import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex from 'knex';
import type { FastifyInstance } from 'fastify';
import { Company } from '@moonwitness/orm-base';
import type { SecurityContext } from '../src/auth/rules.js';
import { buildApp } from '../src/app.js';
import { registerRecordRule, clearRecordRules, getRecordRuleDomain } from '../src/auth/rules.js';

const ADMIN_PASSWORD = 'admin-rules-password';

describe('Row-Level Security & Multi-Tenancy Record Rules', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = await buildApp({
      db: knex({
        client: 'better-sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
      }),
      superadminPassword: ADMIN_PASSWORD,
      jwtSecret: 'test-secret-test-secret-test-secret-123',
      loginRateMax: 1000,
    });
    await app.ready();
  }, 30000);

  afterAll(async () => {
    clearRecordRules();
    await app.close();
  });

  it('superadmin and system roles bypass row-level domain filtering', async () => {
    const fakeSuperReq = {
      auth: { userId: 1, role: 'superadmin' },
      env: app.env,
    } as unknown as SecurityContext['request'] & { auth: { userId: number; role: string } };

    const domain = await getRecordRuleDomain(fakeSuperReq, 'base.partner');
    expect(domain).toEqual([]);
  });

  it('evaluates custom registered record rules for regular users', async () => {
    registerRecordRule('base.partner', (_ctx) => {
      return [['name', 'ilike', 'Enterprise%']];
    });

    const fakeUserReq = {
      auth: { userId: 42, role: 'user', partnerId: 99, companyId: 10 },
      env: app.env,
    } as unknown as SecurityContext['request'] & {
      auth: { userId: number; role: string; partnerId: number; companyId: number };
    };

    const domain = await getRecordRuleDomain(fakeUserReq, 'base.partner');
    expect(domain).toEqual([
      ['company_id', '=', 10],
      ['name', 'ilike', 'Enterprise%'],
    ]);
    clearRecordRules();
  });

  it('multi-tenant requests resolve company from X-Company-Id header', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'superadmin', password: ADMIN_PASSWORD },
    });

    expect(loginRes.statusCode).toBe(200);
    const token = loginRes.json().data.access_token;

    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
        'x-company-id': String(company.id),
      },
    });

    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.company_id).toBe(company.id);
    const denied = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}`, 'x-company-id': '999999' },
    });
    expect(denied.statusCode).toBe(403);
  });
});
