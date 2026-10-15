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
  });

  beforeAll(async () => app.ready());

  afterAll(async () => {
    await app.close();
  });

  it('answers 429 once an IP exceeds the login budget', async () => {
    // Malformed bodies are rejected before any password hashing, so the loop stays cheap
    // while still counting against the limiter.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {},
        remoteAddress: '198.51.100.10',
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 3)).toEqual([400, 400, 400]);
    expect(statuses.slice(3)).toEqual([429, 429, 429]);
  });

  it('keys the login budget by remote IP', async () => {
    const requestLogin = (remoteAddress: string) =>
      app.inject({ method: 'POST', url: '/auth/login', payload: {}, remoteAddress });

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      statuses.push((await requestLogin('198.51.100.11')).statusCode);
    }
    expect(statuses).toEqual([400, 400, 400, 429]);
    expect((await requestLogin('198.51.100.12')).statusCode).toBe(400);
  });

  it('applies independent login, registration, and refresh budgets per route', async () => {
    const request = (url: string) =>
      app.inject({ method: 'POST', url, payload: {}, remoteAddress: '198.51.100.13' });

    const loginStatuses: number[] = [];
    const registrationStatuses: number[] = [];
    const refreshStatuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      loginStatuses.push((await request('/auth/login')).statusCode);
      registrationStatuses.push((await request('/auth/register')).statusCode);
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      refreshStatuses.push((await request('/auth/refresh')).statusCode);
    }

    expect(loginStatuses).toEqual([400, 400, 400, 429]);
    expect(registrationStatuses).toEqual([400, 400, 400, 429]);
    expect(refreshStatuses.slice(0, 9)).toEqual(Array<number>(9).fill(400));
    expect(refreshStatuses[9]).toBe(429);
  });
});
