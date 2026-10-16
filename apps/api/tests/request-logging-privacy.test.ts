import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger } from '@moonwitness/logger';

describe('request logging privacy', () => {
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  it('keeps the route path but never writes query values to automatic request logs', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'moonwitness-api-logs-'));
    const logger = createLogger({
      name: 'api-log-privacy-test',
      level: 'info',
      logDir: temporaryDirectory,
      logFileName: 'api.log',
      enableConsole: false,
      enableFile: true,
      prettyPrint: false,
    });
    const app = Fastify({ loggerInstance: logger });
    app.get('/api/privacy-search', async () => ({ ok: true }));

    try {
      await app.inject({
        method: 'GET',
        url: '/api/privacy-search?term=private-search-canary&access_token=query-token-canary',
      });
      app.log.flush();
      const logContents = await readFile(path.join(temporaryDirectory, 'api.log'), 'utf8');

      expect(logContents).toContain('/api/privacy-search');
      expect(logContents).not.toContain('private-search-canary');
      expect(logContents).not.toContain('query-token-canary');
    } finally {
      await app.close();
      app.log.flush();
    }
  });
});
