import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { gracefulShutdown } from '../src/lifecycle/graceful-shutdown.js';

function target(close: () => Promise<void>) {
  return {
    close,
    closeConnections: vi.fn(),
    log: vi.fn(),
  };
}

describe('graceful process shutdown', () => {
  it('converts a real SIGTERM into an abort and waits for active work to drain', async () => {
    const helperUrl = new URL('../src/lifecycle/process-shutdown.ts', import.meta.url).href;
    const program = `
      const { createProcessShutdownController } = await import(${JSON.stringify(helperUrl)});
      const shutdown = createProcessShutdownController();
      process.on('message', () => process.emit('SIGTERM'));
      console.log('worker-started');
      await new Promise((resolve) => shutdown.signal.addEventListener('abort', resolve, { once: true }));
      console.log('drain-started');
      await new Promise((resolve) => setTimeout(resolve, 80));
      console.log('drain-complete');
      shutdown.dispose();
      if (process.connected) process.disconnect();
    `;
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', program],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    const waitForText = async (needle: string) => {
      const deadline = Date.now() + 5000;
      while (!stdout.includes(needle) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 10));
      expect(stdout, stderr).toContain(needle);
    };

    try {
      await waitForText('worker-started');
      if (process.platform === 'win32') child.send('simulate-sigterm');
      else child.kill('SIGTERM');
      await waitForText('drain-started');
      expect(stdout).not.toContain('drain-complete');
      const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve, reject) => {
          child.once('error', reject);
          child.once('close', (code, signal) => resolve({ code, signal }));
        }
      );
      expect(exit).toEqual({ code: 0, signal: null });
      expect(stdout).toContain('drain-complete');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 10000);

  it('awaits Fastify close and clears the force-close deadline', async () => {
    const app = target(async () => undefined);
    await gracefulShutdown(app, 'SIGTERM', 10);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(app.closeConnections).not.toHaveBeenCalled();
    expect(app.log).toHaveBeenNthCalledWith(1, 'info', 'Graceful shutdown started after SIGTERM');
    expect(app.log).toHaveBeenNthCalledWith(2, 'info', 'Graceful shutdown complete');
  });

  it('closes active connections after the configured drain deadline while waiting for close', async () => {
    let finishClose: () => void = () => undefined;
    const closeResult = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    const app = target(() => closeResult);
    const shutdown = gracefulShutdown(app, 'SIGINT', 10);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(app.closeConnections).toHaveBeenCalledOnce();
    expect(app.log).toHaveBeenCalledWith(
      'error',
      'Graceful shutdown exceeded 10 ms; closing active connections'
    );
    finishClose();
    await shutdown;
  });

  it('does not claim shutdown succeeded when Fastify close fails', async () => {
    const app = target(async () => {
      throw new Error('close failed');
    });
    await expect(gracefulShutdown(app, 'SIGTERM', 100)).rejects.toThrow('close failed');
    expect(app.log).not.toHaveBeenCalledWith('info', 'Graceful shutdown complete');
  });
});
