import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex from 'knex';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('health and metrics endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    app = await buildApp({
      db,
      superadminPassword: 'observability-test-password',
      jwtSecret: 'test-secret-test-secret-test-secret-123',
      metricsToken: 'metrics-secret-token-at-least-32-chars',
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('separates liveness from database readiness', async () => {
    expect((await app.inject('/livez')).statusCode).toBe(200);
    expect((await app.inject('/readyz')).json()).toMatchObject({
      status: 'healthy',
      database: 'connected',
    });
    expect((await app.inject('/health')).statusCode).toBe(200);
  });

  it('protects Prometheus metrics and records route status and duration', async () => {
    expect((await app.inject('/metrics')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: '/metrics',
          headers: { authorization: 'Bearer wrong-token' },
        })
      ).statusCode
    ).toBe(401);

    await app.inject('/api/models');
    const metrics = await app.inject({
      url: '/metrics',
      headers: { authorization: 'Bearer metrics-secret-token-at-least-32-chars' },
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.body).toContain('moonwitness_http_requests_total');
    expect(metrics.body).toContain('route="/api/models"');
    expect(metrics.body).toContain('moonwitness_http_request_duration_seconds_sum');
    expect(metrics.body).toContain('moonwitness_process_uptime_seconds');
  });
});
