import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import { defineAddon, defineModel, fields, installAddons, ref, seed } from '@moonwitness/orm';
import {
  Company,
  AuditLog,
  Country,
  CountryState,
  Currency,
  Language,
  Partner,
  Sequence,
  User,
  initializeSuperadminPassword,
  resetSuperadminPassword,
  nextSequence,
  manifest,
} from '@moonwitness/orm-base';
import { createAuthService, manifest as authManifest } from '@moonwitness/auth';
import {
  Job,
  JobRun,
  enqueueJob,
  jobsManifest,
  registerJobHandler,
  runOneJob,
} from '@moonwitness/jobs';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { buildApp } from '../src/app.js';
import { verifyDefaultBaseAccounts } from '../src/startup-checks.js';
import { createPostgresKnexConfig } from '../src/config/knexfile.js';

const connectionString = process.env.POSTGRES_TEST_URL;
if (process.env.REQUIRE_POSTGRES_TESTS === 'true' && !connectionString) {
  throw new Error('POSTGRES_TEST_URL is required when REQUIRE_POSTGRES_TESTS=true');
}
const postgresDescribe = connectionString ? describe : describe.skip;

postgresDescribe('PostgreSQL addon upgrade integration', () => {
  let adminDb: Knex;
  let db: Knex;
  let apiDb: Knex;
  let app: FastifyInstance | undefined;
  const schema = `mw_test_${randomUUID().replaceAll('-', '')}`;
  const apiSchema = `mw_api_test_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    if (!connectionString) throw new Error('POSTGRES_TEST_URL is required');
    adminDb = knex({ client: 'pg', connection: connectionString, pool: { min: 0, max: 2 } });
    await adminDb.raw('select 1');
    await adminDb.raw('create schema ??', [schema]);
    await adminDb.raw('create schema ??', [apiSchema]);
    db = knex(
      createPostgresKnexConfig(
        connectionString,
        { poolMin: 0, poolMax: 4, acquireTimeoutMs: 5000, statementTimeoutMs: 30_000 },
        { searchPath: [schema] }
      )
    );
  }, 30000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (app) await app.close();
    else if (apiDb) await apiDb.destroy();
    if (adminDb) {
      await adminDb.raw('drop schema if exists ?? cascade', [schema]);
      await adminDb.raw('drop schema if exists ?? cascade', [apiSchema]);
      await adminDb.destroy();
    }
  });

  it('applies the PostgreSQL statement timeout to pooled connections', async () => {
    const result = await db.raw('SHOW statement_timeout');
    expect(result.rows[0]?.statement_timeout).toBe('30s');
  });

  it('upgrades populated legacy tables, restores references and enforces PostgreSQL foreign keys', async () => {
    const {
      street: _companyStreet,
      city: _companyCity,
      postal_code: _companyPostalCode,
      country: _companyCountry,
      currency: _companyCurrency,
      language: _companyLanguage,
      timezone: _companyTimezone,
      ...legacyCompanyFields
    } = Company.fields;
    const {
      street: _partnerStreet,
      city: _partnerCity,
      postal_code: _partnerPostalCode,
      country: _partnerCountry,
      company: _partnerCompany,
      ...legacyPartnerFields
    } = Partner.fields;
    const LegacyCompany = defineModel('base.company', {
      table: 'companies',
      fields: legacyCompanyFields,
    });
    const LegacyPartner = defineModel('base.partner', {
      table: 'partners',
      fields: legacyPartnerFields,
    });
    const {
      language: _userLanguage,
      timezone: _userTimezone,
      partner: _userPartner,
      ...userFields
    } = User.fields;
    const legacyUserFields = {
      ...userFields,
      partner: fields.belongsTo(LegacyPartner, { required: true, unique: true, label: 'Contact' }),
    };
    const LegacyUser = defineModel('base.user', { table: 'users', fields: legacyUserFields });
    const legacy = defineAddon({
      name: 'base',
      version: '0.9.0',
      models: [Country, CountryState, Currency, Language, LegacyCompany, LegacyPartner, LegacyUser],
      data: [
        seed(Country, 'base.country_us', { code: 'US', name: 'United States' }),
        seed(Currency, 'base.currency_usd', { code: 'USD', name: 'US Dollar', symbol: '$' }),
        seed(Language, 'base.language_en_us', { code: 'en-US', name: 'English (US)' }),
        seed(LegacyCompany, 'base.company_default', {
          name: 'MoonWitness',
          email: 'company@moonwitness.local',
          website: 'https://moonwitness.local',
        }),
        seed(LegacyPartner, 'base.partner_system', {
          name: 'System User',
          email: 'system@moonwitness.local',
        }),
        seed(LegacyPartner, 'base.partner_superadmin', {
          name: 'Super Administrator',
          email: 'superadmin@moonwitness.local',
        }),
        seed(LegacyUser, 'base.user_system', {
          login: 'system',
          role: 'system',
          partner: ref('base.partner_system'),
        }),
        seed(LegacyUser, 'base.user_superadmin', {
          login: 'superadmin',
          role: 'superadmin',
          partner: ref('base.partner_superadmin'),
        }),
      ],
    });

    await installAddons(db, [legacy]);
    const previousCounts = await Promise.all(
      ['companies', 'partners', 'users'].map((table) => db(table).count({ count: '*' }).first())
    );

    await installAddons(db, [manifest, authManifest]);

    const upgradedCounts = await Promise.all(
      ['companies', 'partners', 'users'].map((table) => db(table).count({ count: '*' }).first())
    );
    expect(Number(upgradedCounts[0]?.count)).toBe(Number(previousCounts[0]?.count));
    expect(Number(upgradedCounts[1]?.count)).toBeGreaterThanOrEqual(
      Number(previousCounts[1]?.count)
    );
    expect(Number(upgradedCounts[2]?.count)).toBe(Number(previousCounts[2]?.count));
    expect(await db('partners').where({ email: 'system@moonwitness.local' }).first()).toBeTruthy();
    expect(
      await db('partners').where({ email: 'superadmin@moonwitness.local' }).first()
    ).toBeTruthy();
    expect(
      await db('companies').where({ email: 'company@moonwitness.local' }).first()
    ).toBeTruthy();
    const countryCount = await db('countries').count({ count: '*' }).first();
    expect(Number(countryCount?.count)).toBe(249);
    const company = await Company.query()
      .findOne({ name: 'MoonWitness' })
      .withGraphFetched('[country, currency, language]');
    expect(company).toMatchObject({
      country: { code: 'US' },
      currency: { code: 'USD' },
      language: { code: 'en-US' },
      timezone: 'UTC',
    });
    const indexes = await adminDb('pg_indexes')
      .where({ schemaname: schema, tablename: 'partners' })
      .select('indexdef');
    expect(indexes.some(({ indexdef }) => indexdef.includes('(company_id)'))).toBe(true);
    expect(indexes.some(({ indexdef }) => indexdef.includes('(active, id)'))).toBe(true);
    const admin = await User.query()
      .findOne({ login: 'superadmin' })
      .withGraphFetched('partner.company');
    expect(admin?.partner?.company?.name).toBe('MoonWitness');
    expect(await User.search_count([['active', '=', true]])).toBe(2);
    await expect(
      Partner.query().insert({ name: 'Broken link', company_id: 999999 })
    ).rejects.toThrow();

    await initializeSuperadminPassword('postgres-integration-password');
    const session = await createAuthService().login('superadmin', 'postgres-integration-password');
    const parallelRotations = await Promise.all(
      Array.from({ length: 6 }, () => createAuthService().refresh(session.refreshToken))
    );
    expect(parallelRotations).toHaveLength(6);
    expect(new Set(parallelRotations.map(({ refreshToken }) => refreshToken)).size).toBe(6);
    await expect(
      createAuthService().refresh(parallelRotations[0]!.refreshToken)
    ).resolves.toMatchObject({
      userId: session.userId,
    });
  }, 30000);

  it('serializes concurrent addon installation during multi-replica startup', async () => {
    const concurrentSchema = `mw_lock_test_${randomUUID().replaceAll('-', '')}`;
    await adminDb.raw('create schema ??', [concurrentSchema]);
    const concurrentDb = knex({
      client: 'pg',
      connection: connectionString,
      searchPath: [concurrentSchema],
      pool: { min: 0, max: 4 },
    });
    try {
      await Promise.all([
        installAddons(concurrentDb, [manifest, authManifest, jobsManifest]),
        installAddons(concurrentDb, [manifest, authManifest, jobsManifest]),
      ]);
      expect(Number((await concurrentDb('_orm_addons').count({ count: '*' }).first())?.count)).toBe(
        3
      );
      expect(Number((await concurrentDb('users').count({ count: '*' }).first())?.count)).toBe(2);
      const seedCount = baseManifest.data?.length ?? 0;
      expect(Number((await concurrentDb('_orm_data').count({ count: '*' }).first())?.count)).toBe(
        seedCount + (authManifest.data?.length ?? 0) + (jobsManifest.data?.length ?? 0)
      );
      const seededSuperadmin = await concurrentDb('_orm_data')
        .where({ id: 'base.user_superadmin', model: 'base.user' })
        .first('record_id');
      expect(seededSuperadmin).toBeDefined();

      await installAddons(concurrentDb, [manifest, authManifest, jobsManifest]);
      expect(Number((await concurrentDb('_orm_data').count({ count: '*' }).first())?.count)).toBe(
        seedCount + (authManifest.data?.length ?? 0) + (jobsManifest.data?.length ?? 0)
      );
      await expect(
        concurrentDb('_orm_data')
          .where({ id: 'base.user_superadmin', model: 'base.user' })
          .first('record_id')
      ).resolves.toEqual(seededSuperadmin);
    } finally {
      await concurrentDb.destroy();
      await adminDb.raw('drop schema if exists ?? cascade', [concurrentSchema]);
    }
  }, 30000);

  it('runs login, user list/count, profile update and password reset through the PostgreSQL API', async () => {
    apiDb = knex({
      client: 'pg',
      connection: connectionString,
      searchPath: [apiSchema],
      pool: { min: 0, max: 4 },
    });
    app = await buildApp({
      db: apiDb,
      superadminPassword: 'postgres-flow-initial-password',
      jwtSecret: 'postgres-flow-jwt-secret-must-be-32-chars',
    });
    await app.ready();
    await verifyDefaultBaseAccounts(apiDb, true);

    const login = async (password: string) =>
      app!.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { login: 'superadmin', password },
      });
    const firstLogin = await login('postgres-flow-initial-password');
    expect(firstLogin.statusCode).toBe(200);
    const accessToken = firstLogin.json<{ data: { access_token: string } }>().data.access_token;
    const authorization = { authorization: `Bearer ${accessToken}` };

    const users = await app.inject({
      method: 'GET',
      url: '/api/base.user?domain=%5B%5B%22active%22%2C%22%3D%22%2Ctrue%5D%5D&limit=20&order=login%20asc&with=partner%2Clanguage&count=true',
      headers: authorization,
    });
    expect(users.statusCode).toBe(200);
    const userList = users.json<{
      total: number;
      data: { id: number; login: string; timezone: string | null; partner: { name: string } }[];
    }>();
    expect(userList.total).toBe(2);
    expect(userList.data).toHaveLength(2);
    const superadmin = userList.data.find((user) => user.login === 'superadmin');
    expect(superadmin?.partner.name).toBe('Super Administrator');

    await Sequence.query().findOne({ code: 'sales.order' }).patch({ next_number: 1 });
    const allocated = await Promise.all(
      Array.from({ length: 8 }, () => nextSequence('sales.order'))
    );
    expect(allocated.sort()).toEqual([
      'SO-0001',
      'SO-0002',
      'SO-0003',
      'SO-0004',
      'SO-0005',
      'SO-0006',
      'SO-0007',
      'SO-0008',
    ]);

    const update = await app.inject({
      method: 'PATCH',
      url: `/api/base.user/${superadmin?.id}`,
      headers: authorization,
      payload: { timezone: 'Pacific/Honolulu' },
    });
    expect(update.statusCode).toBe(200);
    const updated = await app.inject({
      method: 'GET',
      url: `/api/base.user/${superadmin?.id}?with=partner`,
      headers: authorization,
    });
    expect(updated.json<{ data: { timezone: string } }>().data.timezone).toBe('Pacific/Honolulu');

    const uniqueRecord = await app.inject({
      method: 'POST',
      url: '/api/base.partner',
      headers: authorization,
      payload: { name: 'PostgreSQL unique probe', email: 'postgres-unique-probe@example.test' },
    });
    expect(uniqueRecord.statusCode).toBe(201);
    const duplicateRecord = await app.inject({
      method: 'POST',
      url: '/api/base.partner',
      headers: authorization,
      payload: {
        name: 'Duplicate PostgreSQL unique probe',
        email: 'postgres-unique-probe@example.test',
      },
    });
    expect(duplicateRecord.statusCode).toBe(409);
    expect(duplicateRecord.payload).not.toContain('postgres-unique-probe@example.test');
    expect(duplicateRecord.payload).not.toContain('23505');

    const concurrentRecord = await app.inject({
      method: 'POST',
      url: '/api/base.partner',
      headers: authorization,
      payload: { name: 'Concurrent update probe' },
    });
    const concurrentId = concurrentRecord.json<{ data: { id: number } }>().data.id;
    const concurrentUpdates = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/api/base.partner/${concurrentId}`,
        headers: authorization,
        payload: { city: 'Concurrent A' },
      }),
      app.inject({
        method: 'PATCH',
        url: `/api/base.partner/${concurrentId}`,
        headers: authorization,
        payload: { city: 'Concurrent B' },
      }),
    ]);
    expect(concurrentUpdates.map((response) => response.statusCode)).toEqual([200, 200]);
    const finalConcurrentRecord = await Partner.query().findById(concurrentId).throwIfNotFound();
    expect(['Concurrent A', 'Concurrent B']).toContain(finalConcurrentRecord.city);
    expect(
      await AuditLog.query().where({
        model: 'base.partner',
        record_id: concurrentId,
        operation: 'write',
      })
    ).toHaveLength(2);

    await resetSuperadminPassword('postgres-flow-reset-password');
    expect((await login('postgres-flow-initial-password')).statusCode).toBe(401);
    expect((await login('postgres-flow-reset-password')).statusCode).toBe(200);
  }, 30000);

  it('claims one PostgreSQL job once when two workers race for the same queue item', async () => {
    let signalStarted: (() => void) | undefined;
    let releaseHandler: (() => void) | undefined;
    let invocations = 0;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const unregister = registerJobHandler({
      name: 'test.postgres-claim',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        invocations += 1;
        signalStarted?.();
        await hold;
      },
    });
    try {
      const jobId = await enqueueJob('test.postgres-claim', { run: true });
      const firstWorker = runOneJob({
        workerId: 'postgres-worker-one',
        leaseSeconds: 6,
        heartbeatSeconds: 2,
      });
      await started;
      expect(await runOneJob({ workerId: 'postgres-worker-two' })).toBe(false);
      releaseHandler?.();
      expect(await firstWorker).toBe(true);
      expect(invocations).toBe(1);
      expect(await Job.query().findById(jobId)).toMatchObject({
        status: 'succeeded',
        fencing_token: 1,
      });
      expect(await JobRun.query().where({ job_id: jobId })).toHaveLength(1);
    } finally {
      releaseHandler?.();
      unregister();
    }
  }, 30000);
});
