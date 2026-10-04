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
