import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex from 'knex';
import type { FastifyInstance } from 'fastify';
import { Company } from '@moonwitness/orm-base';
import type { SecurityContext } from '../src/auth/rules.js';
import { buildApp } from '../src/app.js';
import { registerRecordRule, clearRecordRules, getRecordRuleDomain } from '../src/auth/rules.js';
import { canAccess, canManageBaseUser, operationFor, rpcOperation } from '../src/auth/policy.js';

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

  it('keeps public reference data open and applies safe fallback scopes', async () => {
    const userReq = {
      auth: { userId: 8, role: 'user', companyId: 10 },
      env: app.env,
    } as unknown as SecurityContext['request'] & {
      auth: { userId: number; role: string; companyId: number };
    };
    expect(await getRecordRuleDomain(userReq, 'base.country')).toEqual([]);
    expect(await getRecordRuleDomain(userReq, 'base.partner')).toEqual([
      ['company_id', '=', 10],
      ['id', '=', -1],
    ]);
    expect(await getRecordRuleDomain(userReq, 'base.company')).toEqual([['id', '=', 10]]);
    expect(await getRecordRuleDomain(userReq, 'base.partner_address')).toEqual([
      ['partner_id', '=', -1],
    ]);
    expect(await getRecordRuleDomain(userReq, 'base.audit_log')).toEqual([['create_uid', '=', 8]]);
    expect(
      await getRecordRuleDomain({ env: app.env } as SecurityContext['request'], 'base.partner')
    ).toEqual([]);
  });

  it('scopes notification inbox and preferences by company and authenticated recipient', async () => {
    const userReq = {
      auth: { userId: 42, role: 'user', companyId: 10 },
      env: app.env,
    } as unknown as SecurityContext['request'] & {
      auth: { userId: number; role: string; companyId: number };
    };
    await expect(getRecordRuleDomain(userReq, 'notification.notification')).resolves.toEqual([
      ['company_id', '=', 10],
      ['recipient_id', '=', 42],
    ]);
    await expect(getRecordRuleDomain(userReq, 'notification.preference')).resolves.toEqual([
      ['company_id', '=', 10],
      ['user_id', '=', 42],
    ]);
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

describe('central access policy', () => {
  it('denies internal and admin-only models to users while honoring explicit grants', () => {
    const grant = {
      model_name: 'base.partner',
      read: false,
      create: true,
      write: false,
      unlink: false,
    };
    expect(canAccess('user', 'auth.refresh_token', 'read')).toBe(false);
    expect(canAccess('user', 'base.user', 'read')).toBe(false);
    expect(canAccess('user', 'base.partner', 'read')).toBe(true);
    expect(canAccess('user', 'base.partner', 'action', [grant])).toBe(false);
    expect(canAccess('user', 'base.partner', 'create', [grant])).toBe(true);
    expect(canAccess('unknown', 'base.partner', 'read')).toBe(false);
    expect(canAccess('system', 'auth.refresh_token', 'read')).toBe(false);
    expect(canAccess('system', 'base.partner', 'unlink')).toBe(true);
    expect(canAccess('superadmin', 'base.audit_log', 'write')).toBe(false);
  });

  it('protects system users and maps HTTP and RPC operations with default deny', () => {
    expect(canManageBaseUser('system', 'unlink', 'system')).toBe(true);
    expect(canManageBaseUser('user', 'read')).toBe(false);
    expect(canManageBaseUser('superadmin', 'read', 'system')).toBe(true);
    expect(canManageBaseUser('superadmin', 'write', 'system')).toBe(false);
    expect(canManageBaseUser('superadmin', 'create', undefined, 'system')).toBe(false);
    expect(canManageBaseUser('superadmin', 'write', 'user', 'user')).toBe(true);
    expect(operationFor('GET', '/api/base.partner')).toBe('read');
    expect(operationFor('POST', '/api/base.partner/action/:method')).toBe('action');
    expect(operationFor('PATCH', '/api/base.partner')).toBe('write');
    expect(operationFor('DELETE', '/api/base.partner')).toBe('unlink');
    expect(operationFor('OPTIONS', '/api/base.partner')).toBe('action');
    expect(rpcOperation('search_read')).toBe('read');
    expect(rpcOperation('create')).toBe('create');
    expect(rpcOperation('unlink')).toBe('unlink');
    expect(rpcOperation('unknown')).toBeNull();
  });
});
