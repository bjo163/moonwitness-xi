import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('login rate limiting', () => {
  let db: Knex;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    app = await buildApp({
      db,
      jwtSecret: 'test-secret-test-secret-test-secret-123',
      loginRateMax: 3,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 429 once an IP exceeds the login budget', async () => {
    // Malformed bodies are rejected before any password hashing, so the loop stays cheap
    // while still counting against the limiter.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await app.inject({ method: 'POST', url: '/auth/login', payload: {} });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 3)).toEqual([400, 400, 400]);
    expect(statuses.slice(3)).toEqual([429, 429, 429]);
  });
});
