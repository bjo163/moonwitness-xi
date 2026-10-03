import knex from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Company, CompanyMembership, Partner, User } from '@moonwitness/orm-base';
import { Cron, Job, OutboxEvent } from '@moonwitness/jobs';
import { buildApp } from '../src/app.js';

describe('job and scheduler operations', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    app = await buildApp({
      db,
      superadminPassword: 'jobs-admin-password',
      jwtSecret: 'test-secret-test-secret-test-secret-123',
      loginRateMax: 1000,
    });
    await app.ready();
    adminToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { login: 'superadmin', password: 'jobs-admin-password' },
      })
    ).json<{ data: { access_token: string } }>().data.access_token;
    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const partner = await Partner.query().insert({ name: 'Jobs viewer', company_id: company.id });
    const user = await User.query().insertAndFetch({
      login: 'jobs-viewer',
      password: 'jobs-viewer-password',
      partner_id: partner.id,
      role: 'user',
    });
    await CompanyMembership.query().insert({
      user_id: user.id,
      company_id: company.id,
      is_default: true,
    });
    userToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { login: 'jobs-viewer', password: 'jobs-viewer-password' },
      })
    ).json<{ data: { access_token: string } }>().data.access_token;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('limits controls to administrators and excludes job payloads', async () => {
    await Job.query().insert({
      handler: 'example.noop',
      payload: '{"secret":"do-not-return"}',
      status: 'queued',
      available_at: new Date().toISOString(),
    });
    const denied = await app.inject({
      method: 'GET',
      url: '/admin/jobs/health',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(denied.statusCode).toBe(403);
    const response = await app.inject({
      method: 'GET',
      url: '/admin/jobs',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('do-not-return');
    expect(response.body).not.toContain('payload');
    const health = await app.inject({
      method: 'GET',
      url: '/admin/jobs/health',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(health.json<{ data: { queued: number } }>().data.queued).toBe(1);
  });

  it('supports audited job/outbox retry and cron rescheduling', async () => {
    const job = await Job.query().insertAndFetch({
      handler: 'example.noop',
      payload: '{}',
      status: 'dead',
      available_at: new Date().toISOString(),
      attempts: 2,
      max_attempts: 2,
    });
    const retriedJob = await app.inject({
      method: 'POST',
      url: `/admin/jobs/${job.id}/retry`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(retriedJob.statusCode).toBe(200);
    expect(await Job.query().findById(job.id)).toMatchObject({ status: 'queued', max_attempts: 7 });

    const event = await OutboxEvent.query().insertAndFetch({
      event_type: 'record.created',
      aggregate_model: 'base.partner',
      aggregate_id: 44,
      payload: '{}',
      status: 'dead',
      available_at: new Date().toISOString(),
    });
    const retriedEvent = await app.inject({
      method: 'POST',
      url: `/admin/outbox/${event.id}/retry`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(retriedEvent.statusCode).toBe(200);
    expect(await OutboxEvent.query().findById(event.id)).toMatchObject({
      status: 'pending',
      attempts: 0,
    });

    const cron = await Cron.query().findOne({ code: 'example.noop' }).throwIfNotFound();
    const invalid = await app.inject({
      method: 'PATCH',
      url: `/admin/crons/${cron.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cron_expression: 'not-cron', enabled: true },
    });
    expect(invalid.statusCode).toBe(400);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/admin/crons/${cron.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cron_expression: '0 * * * *', timezone: 'UTC', enabled: true },
    });
    expect(updated.statusCode).toBe(200);
    expect(await Cron.query().findById(cron.id)).toMatchObject({ enabled: true });

    const createdCron = await app.inject({
      method: 'POST',
      url: '/admin/crons',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: 'jobs.test.minute',
        name: 'Jobs test minute',
        handler: 'example.noop',
        payload: { example: true },
        cron_expression: '*/5 * * * *',
        timezone: 'UTC',
        enabled: false,
      },
    });
    expect(createdCron.statusCode).toBe(201);
    expect(await Cron.query().findOne({ code: 'jobs.test.minute' })).toMatchObject({
      enabled: false,
      handler: 'example.noop',
    });
  });
});
