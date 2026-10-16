import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify, { LogController } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger } from '@moonwitness/logger';
import { installPrivacySafeNotFoundHandler } from '../src/not-found.js';

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
    const app = Fastify({
      loggerInstance: logger,
      logController: new LogController({ disableRequestLogging: true }),
    });
    app.addHook('onResponse', async (request, reply) => {
      request.log.info(
        { req: request, res: { statusCode: reply.statusCode } },
        'request completed'
      );
    });
    installPrivacySafeNotFoundHandler(app);
    app.get('/api/privacy-search', async () => ({ ok: true }));
    app.get('/api/users/:userId', async () => ({ ok: true }));
    app.post('/api/privacy-submit', async () => ({ ok: true }));

    try {
      await app.inject({
        method: 'GET',
        url: '/api/privacy-search?term=private-search-canary&access_token=query-token-canary',
      });
      await app.inject({ method: 'GET', url: '/api/users/private-path-canary' });
      const unmatched = await app.inject({
        method: 'GET',
        url: '/api/missing/private-unmatched-canary',
      });
      await app.inject({
        method: 'POST',
        url: '/api/privacy-submit',
        headers: {
          host: 'private-host-canary',
          authorization: 'Bearer private-header-token-canary',
          cookie: 'session=private-cookie-canary',
        },
        payload: { text: 'private-body-canary' },
      });
      app.log.flush();
      const logContents = await readFile(path.join(temporaryDirectory, 'api.log'), 'utf8');

      expect(logContents).toContain('/api/privacy-search');
      expect(logContents).toContain('/api/users/:userId');
      expect(logContents).toContain('Route not found');
      expect(logContents).not.toContain('/api/missing/private-unmatched-canary');
      expect(unmatched.statusCode).toBe(404);
      expect(unmatched.body).not.toContain('private-unmatched-canary');
      expect(logContents).not.toContain('private-search-canary');
      expect(logContents).not.toContain('query-token-canary');
      expect(logContents).not.toContain('private-path-canary');
      expect(logContents).not.toContain('private-unmatched-canary');
      expect(logContents).not.toContain('private-header-token-canary');
      expect(logContents).not.toContain('private-cookie-canary');
      expect(logContents).not.toContain('private-body-canary');
      expect(logContents).not.toContain('private-host-canary');
    } finally {
      await app.close();
      app.log.flush();
    }
  });
});
