import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../src/index.js';

describe('Centralized Logger (@moonwitness/logger)', () => {
  const testLogDir = path.resolve(process.cwd(), 'tmp-test-logs');
  const testLogFile = 'test-run.log';

  afterAll(() => {
    try {
      if (fs.existsSync(testLogDir)) {
        fs.rmSync(testLogDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should initialize logger with default silent in test if configured', () => {
    const log = createLogger({ level: 'silent' });
    expect(log).toBeDefined();
    expect(log.level).toBe('silent');
  });

  it('should create logger writing to a destination file', async () => {
    const log = createLogger({
      name: 'test-logger',
      level: 'info',
      logDir: testLogDir,
      logFileName: testLogFile,
      enableFile: true,
      enableConsole: false,
    });

    log.info({ test: 123 }, 'Hello world log test');

    // Wait slightly for pino transport worker thread to flush
    await new Promise((r) => setTimeout(r, 200));

    const fullFilePath = path.join(testLogDir, testLogFile);
    expect(fs.existsSync(fullFilePath)).toBe(true);

    const content = fs.readFileSync(fullFilePath, 'utf-8');
    expect(content).toContain('Hello world log test');
    expect(content).toContain('"test":123');
  });
});
