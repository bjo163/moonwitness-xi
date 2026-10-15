import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import { defineAddon, defineModel, fields, installAddons, ref, seed } from '@moonwitness/orm';
import {
  Activity,
  AuditLog,
  AccessGroup,
  CompanyMembership,
  Company,
  Country,
  CountryState,
  Currency,
  GroupMembership,
  ModelAccess,
  Language,
  Partner,
  PartnerAddress,
  PartnerCategory,
  PartnerCategoryLink,
  Tag,
  TagLink,
  Sequence,
  User,
  initializeSuperadminPassword,
  resetSuperadminPassword,
  assignDefaultUserGroup,
  nextSequence,
  manifest,
} from '@moonwitness/orm-base';
import { createAuthService, manifest as authManifest } from '@moonwitness/auth';
import {
  Job,
  JobRun,
  OutboxEvent,
  Cron,
  enqueueJob,
  enqueueDueCrons,
  cancelJob,
  jobsManifest,
  dispatchOneOutboxEvent,
  registerJobHandler,
  registerOutboxConsumer,
  runOneJob,
} from '@moonwitness/jobs';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';
import {
  OrganizationDepartment,
  manifest as organizationManifest,
} from '@moonwitness/orm-organization';
import { manifest as requestManifest } from '@moonwitness/orm-request';
import { manifest as integrationManifest } from '@moonwitness/orm-integration';
import {
  manifest as workflowManifest,
  expireDueWorkflows,
  startWorkflow,
  transitionWorkflow,
} from '@moonwitness/orm-workflow';
import { buildApp } from '../src/app.js';
import { verifyDefaultBaseAccounts } from '../src/startup-checks.js';
import { createPostgresKnexConfig } from '../src/config/knexfile.js';
import { LocalFileAttachmentStorage, type AttachmentStorage } from '@moonwitness/orm-storage';

const POSTGRES_TEST_REFRESH_SECRET = 'postgres-integration-refresh-secret-32chars';

const connectionString = process.env.POSTGRES_TEST_URL;
if (process.env.REQUIRE_POSTGRES_TESTS === 'true' && !connectionString) {
  throw new Error('POSTGRES_TEST_URL is required when REQUIRE_POSTGRES_TESTS=true');
}
const postgresDescribe = connectionString ? describe : describe.skip;
const postgresAttachmentObjects = new Map<string, Buffer>();
let postgresAttachmentGetCalls = 0;
let postgresAttachmentStorageDirectory: string | undefined;
let postgresLocalAttachmentStorage: LocalFileAttachmentStorage | undefined;
const postgresAttachmentStorage: AttachmentStorage = {
  async put(key, content) {
    const copy = Buffer.from(content);
    if (!postgresLocalAttachmentStorage)
      throw new Error('PostgreSQL attachment storage is not initialized');
    const metadata = await postgresLocalAttachmentStorage.put(key, copy);
    postgresAttachmentObjects.set(key, copy);
    return metadata;
  },
  async get(key) {
    postgresAttachmentGetCalls += 1;
    if (!postgresLocalAttachmentStorage)
      throw new Error('PostgreSQL attachment storage is not initialized');
    return postgresLocalAttachmentStorage.get(key);
  },
  async delete(key) {
    postgresAttachmentObjects.delete(key);
    if (!postgresLocalAttachmentStorage)
      throw new Error('PostgreSQL attachment storage is not initialized');
    await postgresLocalAttachmentStorage.delete(key);
  },
  async *list() {
    if (!postgresLocalAttachmentStorage)
      throw new Error('PostgreSQL attachment storage is not initialized');
    for await (const object of postgresLocalAttachmentStorage.list()) yield object;
  },
};
const runtimeManifests = [
  baseManifest,
  authManifest,
  jobsManifest,
  integrationManifest,
  requestManifest,
  notificationManifest,
  organizationManifest,
  workflowManifest,
];

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
    postgresAttachmentStorageDirectory = await mkdtemp(
      path.join(tmpdir(), 'moonwitness-postgres-attachments-')
    );
    postgresLocalAttachmentStorage = new LocalFileAttachmentStorage(
      postgresAttachmentStorageDirectory
    );
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
    if (postgresAttachmentStorageDirectory)
      await rm(postgresAttachmentStorageDirectory, { recursive: true, force: true });
  });

  it('applies the PostgreSQL statement timeout to pooled connections', async () => {
    const result = await db.raw('SHOW statement_timeout');
    expect(result.rows[0]?.statement_timeout).toBe('30s');
  });

  it('rolls back PostgreSQL upgrade DDL, data, and addon version when a programmatic hook fails', async () => {
    const upgradeSchema = `mw_upgrade_test_${randomUUID().replaceAll('-', '')}`;
    await adminDb.raw('create schema ??', [upgradeSchema]);
    const upgradeDb = knex(
      createPostgresKnexConfig(
        connectionString!,
        { poolMin: 0, poolMax: 2, acquireTimeoutMs: 5000, statementTimeoutMs: 30_000 },
        { searchPath: [upgradeSchema] }
      )
    );
    const addonName = 'test.postgres_upgrade_rollback';
    const installed = defineAddon({ name: addonName, version: '1.0.0', models: [] });
    const failingUpgrade = defineAddon({
      name: addonName,
      version: '1.1.0',
      models: [],
      upgrade: {
        '1.0.0': async (transaction) => {
          await transaction.schema.createTable('upgrade_rollback_probe', (table) => {
            table.string('value').notNullable();
          });
          await transaction('upgrade_rollback_probe').insert({ value: 'must roll back' });
          throw new Error('injected PostgreSQL upgrade failure');
        },
      },
    });

    try {
      await installAddons(upgradeDb, [installed]);
      await expect(installAddons(upgradeDb, [failingUpgrade])).rejects.toThrow(
        'injected PostgreSQL upgrade failure'
      );
      expect(await upgradeDb.schema.hasTable('upgrade_rollback_probe')).toBe(false);
      await expect(
        upgradeDb('_orm_addons').where({ name: addonName }).first('version')
      ).resolves.toEqual({ version: '1.0.0' });
    } finally {
      await upgradeDb.destroy();
      await adminDb.raw('drop schema if exists ?? cascade', [upgradeSchema]);
    }
  }, 30000);

  it('installs every seeded addon on a fresh PostgreSQL schema and preserves sample edits on reinstall', async () => {
    const seedSchema = `mw_seed_test_${randomUUID().replaceAll('-', '')}`;
    await adminDb.raw('create schema ??', [seedSchema]);
    const seedDb = knex(
      createPostgresKnexConfig(
        connectionString!,
        { poolMin: 0, poolMax: 4, acquireTimeoutMs: 5000, statementTimeoutMs: 30_000 },
        { searchPath: [seedSchema] }
      )
    );
    const editedExamples = [
      { externalId: 'base.partner_acme', table: 'partners', field: 'name' },
      { externalId: 'jobs.cron_example_disabled', table: 'crons', field: 'name' },
      {
        externalId: 'notification.template_example_in_app',
        table: 'notification_templates',
        field: 'body',
      },
      {
        externalId: 'organization.department_operations',
        table: 'organization_departments',
        field: 'description',
      },
      {
        externalId: 'workflow.definition_sample_request_v1',
        table: 'workflow_definitions',
        field: 'name',
      },
      { externalId: 'request.example_laptop', table: 'purchase_requests', field: 'description' },
      {
        externalId: 'orm-integration.endpoint_example_disabled',
        table: 'integration_webhook_endpoints',
        field: 'name',
      },
    ];
    try {
      await installAddons(seedDb, [...runtimeManifests].reverse());
      const expectedSeedCount = runtimeManifests.reduce(
        (total, addon) => total + (addon.data?.length ?? 0),
        0
      );
      expect(Number((await seedDb('_orm_data').count({ count: '*' }).first())?.count)).toBe(
        expectedSeedCount
      );
      expect(Number((await seedDb('users').count({ count: '*' }).first())?.count)).toBe(2);

      for (const [index, example] of editedExamples.entries()) {
        const identity = await seedDb('_orm_data').where({ id: example.externalId }).first();
        if (!identity) throw new Error(`Missing seed identity ${example.externalId}`);
        await seedDb(example.table)
          .where({ id: identity.record_id })
          .update({ [example.field]: `PostgreSQL maintainer edit ${index + 1}` });
      }

      await installAddons(seedDb, runtimeManifests);
      expect(Number((await seedDb('_orm_data').count({ count: '*' }).first())?.count)).toBe(
        expectedSeedCount
      );
      expect(Number((await seedDb('users').count({ count: '*' }).first())?.count)).toBe(2);
      for (const [index, example] of editedExamples.entries()) {
        const identity = await seedDb('_orm_data').where({ id: example.externalId }).first();
        if (!identity) throw new Error(`Missing seed identity ${example.externalId}`);
        const persisted = await seedDb(example.table)
          .where({ id: identity.record_id })
          .first(example.field);
        expect(persisted?.[example.field]).toBe(`PostgreSQL maintainer edit ${index + 1}`);
      }
    } finally {
      await seedDb.destroy();
      await adminDb.raw('drop schema if exists ?? cascade', [seedSchema]);
    }
  }, 30000);

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
    const session = await createAuthService({
      refreshTokenSecret: POSTGRES_TEST_REFRESH_SECRET,
    }).login('superadmin', 'postgres-integration-password');
    const parallelRotations = await Promise.all(
      Array.from({ length: 6 }, () =>
        createAuthService({ refreshTokenSecret: POSTGRES_TEST_REFRESH_SECRET }).refresh(
          session.refreshToken
        )
      )
    );
    expect(parallelRotations).toHaveLength(6);
    expect(new Set(parallelRotations.map(({ refreshToken }) => refreshToken)).size).toBe(6);
    await expect(
      createAuthService({ refreshTokenSecret: POSTGRES_TEST_REFRESH_SECRET }).refresh(
        parallelRotations[0]!.refreshToken
      )
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
        installAddons(concurrentDb, [
          manifest,
          authManifest,
          jobsManifest,
          notificationManifest,
          workflowManifest,
        ]),
        installAddons(concurrentDb, [
          manifest,
          authManifest,
          jobsManifest,
          notificationManifest,
          workflowManifest,
        ]),
      ]);
      expect(Number((await concurrentDb('_orm_addons').count({ count: '*' }).first())?.count)).toBe(
        5
      );
      expect(Number((await concurrentDb('users').count({ count: '*' }).first())?.count)).toBe(2);
      const seedCount = baseManifest.data?.length ?? 0;
      expect(Number((await concurrentDb('_orm_data').count({ count: '*' }).first())?.count)).toBe(
        seedCount +
          (authManifest.data?.length ?? 0) +
          (jobsManifest.data?.length ?? 0) +
          (notificationManifest.data?.length ?? 0) +
          (workflowManifest.data?.length ?? 0)
      );
      const seededSuperadmin = await concurrentDb('_orm_data')
        .where({ id: 'base.user_superadmin', model: 'base.user' })
        .first('record_id');
      expect(seededSuperadmin).toBeDefined();

      await installAddons(concurrentDb, [
        manifest,
        authManifest,
        jobsManifest,
        notificationManifest,
        workflowManifest,
      ]);
      expect(Number((await concurrentDb('_orm_data').count({ count: '*' }).first())?.count)).toBe(
        seedCount +
          (authManifest.data?.length ?? 0) +
          (jobsManifest.data?.length ?? 0) +
          (notificationManifest.data?.length ?? 0) +
          (workflowManifest.data?.length ?? 0)
      );
      await expect(
        concurrentDb('_orm_data')
          .where({ id: 'base.user_superadmin', model: 'base.user' })
          .first('record_id')
      ).resolves.toEqual(seededSuperadmin);

      const system = await concurrentDb('users').where({ login: 'system' }).first('id');
      const company = await concurrentDb('companies').where({ name: 'MoonWitness' }).first('id');
      const partner = await concurrentDb('partners')
        .where({ email: 'system@moonwitness.local' })
        .first('id');
      expect(system).toBeDefined();
      expect(company).toBeDefined();
      expect(partner).toBeDefined();
      const workflowStart = {
        code: 'sample.request_approval',
        companyId: Number(company?.id),
        actorId: Number(system?.id),
        role: 'system' as const,
        resourceModel: 'base.partner',
        resourceId: Number(partner?.id),
        idempotencyKey: `pg-concurrent-start-${randomUUID()}`,
      };
      const started = await Promise.all([
        startWorkflow(concurrentDb, workflowStart),
        startWorkflow(concurrentDb, workflowStart),
      ]);
      expect(started[0]?.id).toBe(started[1]?.id);
      expect(
        Number(
          (
            await concurrentDb('workflow_events')
              .where({ idempotency_key: `start:${workflowStart.idempotencyKey}` })
              .count({ count: '*' })
              .first()
          )?.count
        )
      ).toBe(1);
      const workflowAction = {
        instanceId: started[0]!.id,
        companyId: workflowStart.companyId,
        actorId: workflowStart.actorId,
        role: workflowStart.role,
        action: 'submit',
        expectedRevision: 0,
        idempotencyKey: `pg-concurrent-action-${randomUUID()}`,
      };
      const actions = await Promise.all([
        transitionWorkflow(concurrentDb, workflowAction),
        transitionWorkflow(concurrentDb, workflowAction),
      ]);
      expect(actions.map(({ revision }) => revision)).toEqual([1, 1]);
      expect(
        Number(
          (
            await concurrentDb('workflow_events')
              .where({ idempotency_key: workflowAction.idempotencyKey })
              .count({ count: '*' })
              .first()
          )?.count
        )
      ).toBe(1);

      const overdueStartedAt = new Date('2026-10-01T00:00:00.000Z');
      const expirationTime = new Date('2026-10-10T00:00:00.000Z');
      const overdueWorkflow = await startWorkflow(concurrentDb, {
        ...workflowStart,
        idempotencyKey: `pg-overdue-start-${randomUUID()}`,
        now: overdueStartedAt,
      });
      const concurrentExpirations = await Promise.all([
        expireDueWorkflows(concurrentDb, expirationTime),
        expireDueWorkflows(concurrentDb, expirationTime),
      ]);
      expect(concurrentExpirations.reduce((total, expired) => total + expired, 0)).toBe(1);
      expect(await expireDueWorkflows(concurrentDb, expirationTime)).toBe(0);
      await expect(
        concurrentDb('workflow_instances').where({ id: overdueWorkflow.id }).first()
      ).resolves.toMatchObject({
        status: 'timed_out',
        current_state: 'timed_out',
        revision: 1,
      });
      const timeoutEvents = await concurrentDb('workflow_events').where({
        instance_id: overdueWorkflow.id,
        action: 'timeout',
        idempotency_key: `timeout:${overdueWorkflow.id}`,
      });
      expect(timeoutEvents).toHaveLength(1);
      expect(timeoutEvents[0]).toMatchObject({ sequence: 1, revision: 1, actor_id: null });

      const handlerName = `test.pg-scheduler-${randomUUID()}`;
      const unregister = registerJobHandler({
        name: handlerName,
        version: 1,
        parse(payload: unknown): { run: true } {
          if (typeof payload !== 'object' || payload === null || !('run' in payload))
            throw new Error('invalid payload');
          return { run: true };
        },
        async run() {
          return null;
        },
      });
      try {
        const company = await concurrentDb('companies').where({ name: 'MoonWitness' }).first('id');
        expect(company).toBeDefined();
        const now = new Date('2026-10-03T12:03:00.000Z');
        const cron = await Cron.query().insertAndFetch({
          code: `test.pg-scheduler-${randomUUID()}`,
          name: 'Concurrent scheduler claim',
          handler: handlerName,
          payload: '{"run":true}',
          company_id: Number(company?.id),
          cron_expression: '* * * * *',
          timezone: 'UTC',
          enabled: true,
          next_run_at: now.toISOString(),
          misfire_policy: 'coalesce',
          concurrency_policy: 'allow',
          max_catch_up: 1,
        });
        const schedulerResults = await Promise.all([
          enqueueDueCrons({ now }),
          enqueueDueCrons({ now }),
        ]);
        expect(schedulerResults.reduce((total, count) => total + count, 0)).toBe(1);
        const jobs = await Job.query().where({ cron_id: cron.id });
        expect(jobs).toHaveLength(1);
        expect(jobs[0]?.schedule_key).toBe(`cron:${cron.id}:${now.toISOString()}`);
        const advanced = await Cron.query().findById(cron.id).throwIfNotFound();
        expect(Date.parse(advanced.next_run_at)).toBeGreaterThan(now.getTime());
      } finally {
        unregister();
      }
    } finally {
      await concurrentDb.destroy();
      await adminDb.raw('drop schema if exists ?? cascade', [concurrentSchema]);
    }
  }, 30000);

  it('persists the purchase request approval lifecycle through the PostgreSQL API', async () => {
    if (!connectionString) throw new Error('POSTGRES_TEST_URL is required');
    const workflowSchema = `mw_workflow_api_${randomUUID().replaceAll('-', '')}`;
    await adminDb.raw('create schema ??', [workflowSchema]);
    const workflowDb = knex(
      createPostgresKnexConfig(
        connectionString,
        { poolMin: 0, poolMax: 4, acquireTimeoutMs: 5000, statementTimeoutMs: 30_000 },
        { searchPath: [workflowSchema] }
      )
    );
    let workflowApp: FastifyInstance | undefined;

    try {
      workflowApp = await buildApp({
        db: workflowDb,
        superadminPassword: 'postgres-workflow-admin-password',
        jwtSecret: 'postgres-workflow-api-jwt-secret-must-be-32-chars',
      });
      await workflowApp.ready();
      const company = await workflowDb('companies').where({ name: 'MoonWitness' }).first('id');
      const currency = await workflowDb('currencies').where({ code: 'USD' }).first('id');
      if (!company || !currency) throw new Error('PostgreSQL base seeds are incomplete');
      const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
      const requesterPartner = await Partner.query().insertAndFetch({
        name: `PostgreSQL workflow requester ${suffix}`,
        company_id: company.id,
      });
      const requester = await User.query().insertAndFetch({
        login: `pg-workflow-${suffix}`,
        password: 'postgres-workflow-user-password',
        partner_id: requesterPartner.id,
        role: 'user',
      });
      await assignDefaultUserGroup(requester.id);
      await CompanyMembership.query().insert({
        user_id: requester.id,
        company_id: company.id,
        is_default: true,
      });
      const adminUser = await workflowDb('users').where({ login: 'superadmin' }).first('id');
      if (!adminUser) throw new Error('PostgreSQL seeded superadmin is missing');

      const login = async (loginName: string, password: string) =>
        workflowApp!.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { login: loginName, password },
        });
      const adminLogin = await login('superadmin', 'postgres-workflow-admin-password');
      const requesterLogin = await login(requester.login, 'postgres-workflow-user-password');
      expect(adminLogin.statusCode, adminLogin.payload).toBe(200);
      expect(requesterLogin.statusCode, requesterLogin.payload).toBe(200);
      const adminToken = adminLogin.json<{ data: { access_token: string } }>().data.access_token;
      const requesterToken = requesterLogin.json<{ data: { access_token: string } }>().data
        .access_token;
      const headers = (token: string) => ({ authorization: `Bearer ${token}` });

      const createdRequest = await workflowApp.inject({
        method: 'POST',
        url: '/api/request.purchase',
        headers: headers(requesterToken),
        payload: {
          title: `PostgreSQL approval flow ${suffix}`,
          description: 'Verify the persisted request workflow lifecycle.',
          amount_minor: 87500,
          currency_id: currency.id,
          company_id: company.id,
        },
      });
      expect(createdRequest.statusCode, createdRequest.payload).toBe(201);
      const requestId = createdRequest.json<{ data: { id: number; create_uid: number } }>().data.id;
      expect(createdRequest.json<{ data: { create_uid: number } }>().data.create_uid).toBe(
        requester.id
      );
      await expect(
        workflowDb('purchase_requests').where({ id: requestId }).first()
      ).resolves.toMatchObject({
        title: `PostgreSQL approval flow ${suffix}`,
        company_id: company.id,
        create_uid: requester.id,
      });

      const startPayload = {
        code: 'request.purchase_approval',
        resource_model: 'request.purchase',
        resource_id: requestId,
        idempotency_key: `pg-workflow-start-${suffix}`,
      };
      const started = await workflowApp.inject({
        method: 'POST',
        url: '/workflows/instances',
        headers: headers(requesterToken),
        payload: startPayload,
      });
      const replayedStart = await workflowApp.inject({
        method: 'POST',
        url: '/workflows/instances',
        headers: headers(requesterToken),
        payload: startPayload,
      });
      expect(started.statusCode, started.payload).toBe(201);
      expect(replayedStart.statusCode, replayedStart.payload).toBe(201);
      const instanceId = started.json<{ data: { id: number } }>().data.id;
      expect(replayedStart.json<{ data: { id: number } }>().data.id).toBe(instanceId);
      await expect(
        workflowDb('workflow_events').where({
          idempotency_key: `start:${startPayload.idempotency_key}`,
        })
      ).resolves.toHaveLength(1);

      const submitted = await workflowApp.inject({
        method: 'POST',
        url: `/workflows/instances/${instanceId}/actions`,
        headers: headers(requesterToken),
        payload: {
          action: 'submit',
          expected_revision: 0,
          idempotency_key: `pg-workflow-submit-${suffix}`,
        },
      });
      expect(submitted.statusCode, submitted.payload).toBe(200);
      const selfApproval = await workflowApp.inject({
        method: 'POST',
        url: `/workflows/instances/${instanceId}/actions`,
        headers: headers(requesterToken),
        payload: {
          action: 'approve',
          expected_revision: 1,
          idempotency_key: `pg-workflow-self-approve-${suffix}`,
        },
      });
      expect(selfApproval.statusCode, selfApproval.payload).toBe(403);
      const approved = await workflowApp.inject({
        method: 'POST',
        url: `/workflows/instances/${instanceId}/actions`,
        headers: headers(adminToken),
        payload: {
          action: 'approve',
          expected_revision: 1,
          idempotency_key: `pg-workflow-admin-approve-${suffix}`,
        },
      });
      expect(approved.statusCode, approved.payload).toBe(200);
      expect(
        approved.json<{ data: { currentState: string; status: string; revision: number } }>().data
      ).toMatchObject({ currentState: 'approved', status: 'completed', revision: 2 });

      const persistedInstance = await workflowDb('workflow_instances')
        .where({ id: instanceId })
        .first();
      expect(persistedInstance).toMatchObject({
        company_id: company.id,
        resource_model: 'request.purchase',
        resource_id: requestId,
        started_by_id: requester.id,
        current_state: 'approved',
        status: 'completed',
        revision: 2,
      });
      const detail = await workflowApp.inject({
        method: 'GET',
        url: `/workflows/instances/${instanceId}`,
        headers: headers(requesterToken),
      });
      expect(detail.statusCode, detail.payload).toBe(200);
      expect(
        detail
          .json<{
            data: {
              events: { action: string; from_state: string; to_state: string; revision: number }[];
              approvals: { action: string; decision: string; actor_id: number }[];
            };
          }>()
          .data.events.map(({ action, from_state, to_state, revision }) => [
            action,
            from_state,
            to_state,
            revision,
          ])
      ).toEqual([
        ['start', 'draft', 'draft', 0],
        ['submit', 'draft', 'submitted', 1],
        ['approve', 'submitted', 'approved', 2],
      ]);
      expect(
        detail.json<{
          data: { approvals: { action: string; decision: string; actor_id: number }[] };
        }>().data.approvals
      ).toMatchObject([{ action: 'approve', decision: 'approved', actor_id: adminUser.id }]);
    } finally {
      try {
        if (workflowApp) await workflowApp.close();
        else await workflowDb.destroy();
      } finally {
        await adminDb.raw('drop schema if exists ?? cascade', [workflowSchema]);
      }
    }
  }, 60000);

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
      attachmentStorage: postgresAttachmentStorage,
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
    if (!superadmin) throw new Error('PostgreSQL seed must include a superadmin user');
    expect(superadmin.partner.name).toBe('Super Administrator');

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
      url: `/api/base.user/${superadmin.id}`,
      headers: authorization,
      payload: { timezone: 'Pacific/Honolulu' },
    });
    expect(update.statusCode).toBe(200);
    const updated = await app.inject({
      method: 'GET',
      url: `/api/base.user/${superadmin.id}?with=partner`,
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

    const deliveredEvents: Array<{ eventId: number; payload: unknown }> = [];
    const unregisterConsumer = registerOutboxConsumer(
      'record.created',
      async (payload, eventId) => {
        deliveredEvents.push({ eventId, payload });
      }
    );
    try {
      const outboxProbe = await app.inject({
        method: 'POST',
        url: '/api/base.partner',
        headers: authorization,
        payload: { name: 'PostgreSQL transaction outbox probe' },
      });
      expect(outboxProbe.statusCode).toBe(201);
      const partnerId = outboxProbe.json<{ data: { id: number } }>().data.id;
      const pendingEvent = await OutboxEvent.query()
        .where({
          aggregate_model: 'base.partner',
          aggregate_id: partnerId,
          event_type: 'record.created',
        })
        .first()
        .throwIfNotFound();
      expect(JSON.parse(pendingEvent.payload)).toMatchObject({
        model: 'base.partner',
        id: partnerId,
        operation: 'created',
        record: { id: partnerId, name: 'PostgreSQL transaction outbox probe' },
      });

      const queuedEvents = await OutboxEvent.query()
        .whereIn('status', ['pending', 'processing'])
        .resultSize();
      let targetEventPublished = false;
      for (let attempt = 0; attempt <= queuedEvents; attempt += 1) {
        const currentEvent = await OutboxEvent.query().findById(pendingEvent.id).throwIfNotFound();
        if (currentEvent.status === 'published') {
          targetEventPublished = true;
          break;
        }
        if (!(await dispatchOneOutboxEvent('postgres-outbox-integration'))) break;
      }
      expect(targetEventPublished).toBe(true);
      expect(deliveredEvents).toContainEqual({
        eventId: pendingEvent.id,
        payload: expect.objectContaining({ model: 'base.partner', id: partnerId }),
      });
      await expect(OutboxEvent.query().findById(pendingEvent.id)).resolves.toMatchObject({
        status: 'published',
        attempts: 1,
        fencing_token: 1,
      });

      const lifecycleRecord = await app.inject({
        method: 'POST',
        url: '/api/base.partner',
        headers: authorization,
        payload: { name: 'PostgreSQL audit lifecycle probe' },
      });
      expect(lifecycleRecord.statusCode).toBe(201);
      const lifecycleId = lifecycleRecord.json<{ data: { id: number } }>().data.id;
      for (const method of ['action_archive', 'action_unarchive']) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/base.partner/${lifecycleId}/action/${method}`,
          headers: authorization,
        });
        expect(response.statusCode, response.payload).toBe(200);
      }
      const lifecycleAudit = await AuditLog.query()
        .where({ model: 'base.partner', record_id: lifecycleId })
        .orderBy('id', 'asc');
      expect(lifecycleAudit.map(({ operation, actor_id }) => [operation, actor_id])).toEqual([
        ['create', superadmin.id],
        ['action_archive', superadmin.id],
        ['action_unarchive', superadmin.id],
      ]);
      const auditMutationAttempts = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/base.audit_log',
          headers: authorization,
          payload: {
            model: 'base.partner',
            record_id: lifecycleId,
            operation: 'create',
            changes: 'forged PostgreSQL audit event',
          },
        }),
        app.inject({
          method: 'PATCH',
          url: `/api/base.audit_log/${lifecycleAudit[0].id}`,
          headers: authorization,
          payload: { changes: 'forged PostgreSQL audit changes' },
        }),
        app.inject({
          method: 'DELETE',
          url: `/api/base.audit_log/${lifecycleAudit[0].id}?hard=true`,
          headers: authorization,
        }),
      ]);
      expect(auditMutationAttempts.map(({ statusCode }) => statusCode)).toEqual([403, 403, 403]);
      await expect(
        AuditLog.query()
          .where({ model: 'base.partner', record_id: lifecycleId })
          .orderBy('id', 'asc')
      ).resolves.toEqual(lifecycleAudit);
      await expect(Partner.query().findById(lifecycleId)).resolves.toMatchObject({ active: true });

      const attachmentContent = Buffer.from('PostgreSQL attachment lifecycle probe');
      const uploadedAttachment = await app.inject({
        method: 'POST',
        url: `/api/base.attachment/upload?resource_model=base.partner&resource_id=${lifecycleId}&name=lifecycle.txt`,
        headers: {
          ...authorization,
          'content-type': 'application/octet-stream',
          'x-file-mime': 'text/plain',
        },
        payload: attachmentContent,
      });
      expect(uploadedAttachment.statusCode, uploadedAttachment.payload).toBe(201);
      const attachmentId = uploadedAttachment.json<{ data: { id: number } }>().data.id;
      const attachmentRow = await apiDb('attachments').where({ id: attachmentId }).first();
      expect(attachmentRow).toMatchObject({
        id: attachmentId,
        resource_model: 'base.partner',
        resource_id: lifecycleId,
      });
      const storageKey = String(attachmentRow.storage_key);
      if (!postgresAttachmentStorageDirectory)
        throw new Error('PostgreSQL attachment directory is not initialized');
      const storagePath = path.join(postgresAttachmentStorageDirectory, storageKey);
      expect(postgresAttachmentObjects.get(storageKey)).toEqual(attachmentContent);
      await expect(readFile(storagePath)).resolves.toEqual(attachmentContent);

      const archivedAttachment = await app.inject({
        method: 'DELETE',
        url: `/api/base.attachment/${attachmentId}`,
        headers: authorization,
      });
      expect(archivedAttachment.statusCode, archivedAttachment.payload).toBe(200);
      expect(await apiDb('attachments').where({ id: attachmentId }).first()).toMatchObject({
        id: attachmentId,
        active: false,
      });
      expect(postgresAttachmentObjects.get(storageKey)).toEqual(attachmentContent);
      await expect(readFile(storagePath)).resolves.toEqual(attachmentContent);

      const restoredAttachment = await app.inject({
        method: 'POST',
        url: `/api/base.attachment/${attachmentId}/action/action_unarchive`,
        headers: authorization,
      });
      expect(restoredAttachment.statusCode, restoredAttachment.payload).toBe(200);
      const restoredDownload = await app.inject({
        method: 'GET',
        url: `/api/base.attachment/${attachmentId}/download`,
        headers: authorization,
      });
      expect(restoredDownload.statusCode, restoredDownload.payload).toBe(200);
      expect(restoredDownload.payload).toBe(attachmentContent.toString());

      const deletedAttachment = await app.inject({
        method: 'DELETE',
        url: `/api/base.attachment/${attachmentId}?hard=true`,
        headers: authorization,
      });
      expect(deletedAttachment.statusCode, deletedAttachment.payload).toBe(200);
      expect(await apiDb('attachments').where({ id: attachmentId }).first()).toBeUndefined();
      expect(postgresAttachmentObjects.has(storageKey)).toBe(false);
      await expect(readFile(storagePath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        AuditLog.query().where({
          model: 'base.attachment',
          record_id: attachmentId,
          operation: 'delete',
          actor_id: superadmin.id,
        })
      ).resolves.toHaveLength(1);

      await apiDb.raw(`
        CREATE OR REPLACE FUNCTION reject_attachment_outbox_insert()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'outbox unavailable'; END $$;
      `);
      await apiDb.raw(`
        CREATE TRIGGER reject_attachment_outbox_insert
        BEFORE INSERT ON outbox_events
        FOR EACH ROW EXECUTE FUNCTION reject_attachment_outbox_insert();
      `);
      const attachmentCountBeforeRollback = (await apiDb('attachments').select('id')).length;
      const auditCountBeforeRollback = (await apiDb('audit_logs').select('id')).length;
      const storedObjectsBeforeRollback = postgresAttachmentObjects.size;
      if (!postgresLocalAttachmentStorage)
        throw new Error('PostgreSQL attachment storage is not initialized');
      const storedFileKeysBeforeRollback = [];
      for await (const object of postgresLocalAttachmentStorage.list())
        storedFileKeysBeforeRollback.push(object.key);
      let rejectedAttachmentUpload: Awaited<ReturnType<typeof app.inject>>;
      try {
        rejectedAttachmentUpload = await app.inject({
          method: 'POST',
          url: `/api/base.attachment/upload?resource_model=base.partner&resource_id=${lifecycleId}&name=rollback.txt`,
          headers: {
            ...authorization,
            'content-type': 'application/octet-stream',
            'x-file-mime': 'text/plain',
          },
          payload: Buffer.from('must be removed after rollback'),
        });
      } finally {
        await apiDb.raw('DROP TRIGGER reject_attachment_outbox_insert ON outbox_events');
        await apiDb.raw('DROP FUNCTION reject_attachment_outbox_insert()');
      }
      expect(rejectedAttachmentUpload.statusCode).toBe(500);
      expect((await apiDb('attachments').select('id')).length).toBe(attachmentCountBeforeRollback);
      expect((await apiDb('audit_logs').select('id')).length).toBe(auditCountBeforeRollback);
      expect(postgresAttachmentObjects.size).toBe(storedObjectsBeforeRollback);
      const storedFileKeysAfterRollback = [];
      for await (const object of postgresLocalAttachmentStorage.list())
        storedFileKeysAfterRollback.push(object.key);
      expect(storedFileKeysAfterRollback).toEqual(storedFileKeysBeforeRollback);
      await expect(
        apiDb('attachments').where({ resource_id: lifecycleId, name: 'rollback.txt' }).first()
      ).resolves.toBeUndefined();

      const rollbackRecord = await app.inject({
        method: 'POST',
        url: '/api/base.partner',
        headers: authorization,
        payload: { name: 'PostgreSQL audit rollback probe' },
      });
      expect(rollbackRecord.statusCode).toBe(201);
      const rollbackId = rollbackRecord.json<{ data: { id: number } }>().data.id;
      await apiDb.raw(`
        CREATE FUNCTION reject_archive_outbox() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.event_type = 'record.action_archive' THEN
            RAISE EXCEPTION 'injected outbox failure';
          END IF;
          RETURN NEW;
        END;
        $$;
      `);
      await apiDb.raw(`
        CREATE TRIGGER reject_archive_outbox
        BEFORE INSERT ON outbox_events
        FOR EACH ROW EXECUTE FUNCTION reject_archive_outbox();
      `);
      let rejectedArchive: Awaited<ReturnType<typeof app.inject>>;
      try {
        rejectedArchive = await app.inject({
          method: 'POST',
          url: `/api/base.partner/${rollbackId}/action/action_archive`,
          headers: authorization,
        });
      } finally {
        await apiDb.raw('DROP TRIGGER IF EXISTS reject_archive_outbox ON outbox_events');
        await apiDb.raw('DROP FUNCTION IF EXISTS reject_archive_outbox()');
      }
      expect(rejectedArchive.statusCode).toBe(500);
      await expect(Partner.query().findById(rollbackId)).resolves.toMatchObject({ active: true });
      await expect(
        AuditLog.query().where({
          model: 'base.partner',
          record_id: rollbackId,
          operation: 'action_archive',
        })
      ).resolves.toHaveLength(0);
    } finally {
      unregisterConsumer();
    }

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

    await app.close();
    app = undefined;
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
      attachmentStorage: postgresAttachmentStorage,
    });
    await app.ready();

    const oldPasswordAfterRestart = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'superadmin', password: 'postgres-flow-initial-password' },
    });
    expect(oldPasswordAfterRestart.statusCode).toBe(401);
    const resetPasswordAfterRestart = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'superadmin', password: 'postgres-flow-reset-password' },
    });
    expect(resetPasswordAfterRestart.statusCode).toBe(200);
  }, 30000);

  it('enforces PostgreSQL company isolation for partner list, count, relations and foreign references', async () => {
    if (!app) throw new Error('PostgreSQL API app is not initialized');

    const localCompany = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const localPartner = await Partner.query().insertAndFetch({
      name: 'PostgreSQL Tenant Contact',
      company_id: localCompany.id,
    });
    const localUser = await User.query().insertAndFetch({
      login: 'postgres-tenant-user',
      password: 'postgres-tenant-password',
      partner_id: localPartner.id,
      role: 'user',
    });
    await assignDefaultUserGroup(localUser.id);
    await CompanyMembership.query().insert({
      user_id: localUser.id,
      company_id: localCompany.id,
      is_default: true,
    });
    const userGroup = await AccessGroup.query().findOne({ code: 'user' }).throwIfNotFound();
    const partnerGrant = await ModelAccess.query()
      .findOne({ group_id: userGroup.id, model_name: 'base.partner' })
      .throwIfNotFound();
    await apiDb('model_access')
      .where({ id: partnerGrant.id })
      .update({ create: true, write: true });
    await ModelAccess.query().insert({
      group_id: userGroup.id,
      model_name: 'base.attachment',
      read: true,
      create: true,
    });

    const foreignCompany = await Company.query().insertAndFetch({
      name: 'PostgreSQL Foreign Tenant',
    });
    const foreignPartner = await Partner.query().insertAndFetch({
      name: 'PostgreSQL Foreign Contact',
      company_id: foreignCompany.id,
    });
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'postgres-tenant-user', password: 'postgres-tenant-password' },
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json<{ data: { access_token: string } }>().data.access_token;
    const headers = { authorization: `Bearer ${accessToken}` };

    const uploadedAttachment = await app.inject({
      method: 'POST',
      url: `/api/base.attachment/upload?resource_model=base.partner&resource_id=${localPartner.id}&name=tenant-scope.txt`,
      headers: {
        ...headers,
        'content-type': 'application/octet-stream',
        'x-file-mime': 'text/plain',
      },
      payload: Buffer.from('company-scoped attachment'),
    });
    expect(uploadedAttachment.statusCode, uploadedAttachment.payload).toBe(201);
    const uploadedAttachmentId = uploadedAttachment.json<{ data: { id: number } }>().data.id;
    const putCountBeforeForeignUpload = postgresAttachmentObjects.size;
    const deniedForeignUpload = await app.inject({
      method: 'POST',
      url: `/api/base.attachment/upload?resource_model=base.partner&resource_id=${foreignPartner.id}&name=foreign.txt`,
      headers: {
        ...headers,
        'content-type': 'application/octet-stream',
        'x-file-mime': 'text/plain',
      },
      payload: Buffer.from('foreign attachment'),
    });
    expect(deniedForeignUpload.statusCode).toBe(404);
    expect(postgresAttachmentObjects.size).toBe(putCountBeforeForeignUpload);

    await Partner.query().findById(localPartner.id).patch({ company_id: foreignCompany.id });
    const getCallsBeforeForeignParentDownload = postgresAttachmentGetCalls;
    const deniedForeignParentDownload = await app.inject({
      method: 'GET',
      url: `/api/base.attachment/${uploadedAttachmentId}/download`,
      headers,
    });
    expect(deniedForeignParentDownload.statusCode).toBe(404);
    expect(deniedForeignParentDownload.payload).not.toContain('company-scoped attachment');
    expect(postgresAttachmentGetCalls).toBe(getCallsBeforeForeignParentDownload);
    await Partner.query().findById(localPartner.id).patch({ company_id: localCompany.id });
    const archivedParent = await Tag.query().insertAndFetch({
      name: 'PostgreSQL Archived Attachment Parent',
    });
    const archivedParentUpload = await app.inject({
      method: 'POST',
      url: `/api/base.attachment/upload?resource_model=base.tag&resource_id=${archivedParent.id}&name=archived-parent.txt`,
      headers: {
        ...headers,
        'content-type': 'application/octet-stream',
        'x-file-mime': 'text/plain',
      },
      payload: Buffer.from('archived parent content'),
    });
    expect(archivedParentUpload.statusCode, archivedParentUpload.payload).toBe(201);
    const archivedParentAttachmentId = archivedParentUpload.json<{ data: { id: number } }>().data
      .id;
    await Tag.query().findById(archivedParent.id).patch({ active: false });
    try {
      const objectsBeforeArchivedUpload = postgresAttachmentObjects.size;
      const deniedArchivedParentUpload = await app.inject({
        method: 'POST',
        url: `/api/base.attachment/upload?resource_model=base.tag&resource_id=${archivedParent.id}&name=second-archived-parent.txt`,
        headers: {
          ...headers,
          'content-type': 'application/octet-stream',
          'x-file-mime': 'text/plain',
        },
        payload: Buffer.from('must not be stored'),
      });
      expect(deniedArchivedParentUpload.statusCode).toBe(404);
      expect(postgresAttachmentObjects.size).toBe(objectsBeforeArchivedUpload);
      const getCallsBeforeArchivedParentDownload = postgresAttachmentGetCalls;
      const deniedArchivedParentDownload = await app.inject({
        method: 'GET',
        url: `/api/base.attachment/${archivedParentAttachmentId}/download`,
        headers,
      });
      expect(deniedArchivedParentDownload.statusCode).toBe(404);
      expect(deniedArchivedParentDownload.payload).not.toContain('archived parent content');
      expect(postgresAttachmentGetCalls).toBe(getCallsBeforeArchivedParentDownload);
    } finally {
      await Tag.query().findById(archivedParent.id).patch({ active: true });
    }

    const listed = await app.inject({
      method: 'GET',
      url: '/api/base.partner?limit=500&count=true&with=company',
      headers,
    });
    expect(listed.statusCode).toBe(200);
    const result = listed.json<{
      total: number;
      data: { id: number; name: string; company: { name: string } | null }[];
    }>();
    expect(result.total).toBe(result.data.length);
    expect(result.data.map(({ id }) => id)).toContain(localPartner.id);
    expect(result.data.map(({ id }) => id)).not.toContain(foreignPartner.id);
    expect(result.data.find(({ id }) => id === localPartner.id)?.company?.name).toBe('MoonWitness');

    const allowedPartnerCreateName = `PostgreSQL tenant create ${randomUUID()}`;
    const allowedPartnerCreate = await app.inject({
      method: 'POST',
      url: '/api/base.partner',
      headers,
      payload: { name: allowedPartnerCreateName, company_id: localCompany.id },
    });
    expect(allowedPartnerCreate.statusCode, allowedPartnerCreate.payload).toBe(201);
    const allowedPartnerId = allowedPartnerCreate.json<{ data: { id: number } }>().data.id;
    expect(await Partner.query().findById(allowedPartnerId)).toMatchObject({
      name: allowedPartnerCreateName,
      company_id: localCompany.id,
    });

    const deniedForeignPartnerCreateName = `PostgreSQL foreign tenant create ${randomUUID()}`;
    const deniedForeignPartnerCreate = await app.inject({
      method: 'POST',
      url: '/api/base.partner',
      headers,
      payload: { name: deniedForeignPartnerCreateName, company_id: foreignCompany.id },
    });
    expect([400, 403]).toContain(deniedForeignPartnerCreate.statusCode);
    expect(deniedForeignPartnerCreate.payload).not.toContain('PostgreSQL Foreign Tenant');
    expect(await Partner.query().findOne({ name: deniedForeignPartnerCreateName })).toBeUndefined();

    const directRead = await app.inject({
      method: 'GET',
      url: `/api/base.partner/${foreignPartner.id}`,
      headers,
    });
    expect(directRead.statusCode).toBe(404);

    const allowedLocalWrite = await app.inject({
      method: 'PATCH',
      url: `/api/base.partner/${localPartner.id}`,
      headers,
      payload: { name: 'PostgreSQL Tenant Contact Updated' },
    });
    expect(allowedLocalWrite.statusCode, allowedLocalWrite.payload).toBe(200);
    expect(await Partner.query().findById(localPartner.id)).toMatchObject({
      name: 'PostgreSQL Tenant Contact Updated',
      company_id: localCompany.id,
    });

    const partnerAuditBeforeDeniedUnlink = await AuditLog.query()
      .where({ model: 'base.partner', record_id: localPartner.id })
      .orderBy('id', 'asc');
    const deniedPartnerUnlink = await app.inject({
      method: 'DELETE',
      url: `/api/base.partner/${localPartner.id}`,
      headers,
    });
    expect(deniedPartnerUnlink.statusCode).toBe(403);
    expect(await Partner.query().findById(localPartner.id)).toMatchObject({
      name: 'PostgreSQL Tenant Contact Updated',
      company_id: localCompany.id,
      active: true,
    });
    await expect(
      AuditLog.query()
        .where({ model: 'base.partner', record_id: localPartner.id })
        .orderBy('id', 'asc')
    ).resolves.toEqual(partnerAuditBeforeDeniedUnlink);

    const allowedCompanyMembership = await app.inject({
      method: 'GET',
      url: `/api/base.partner/${localPartner.id}`,
      headers: { ...headers, 'x-company-id': String(localCompany.id) },
    });
    expect(allowedCompanyMembership.statusCode).toBe(200);
    const companyMembership = await CompanyMembership.query()
      .findOne({ user_id: localUser.id, company_id: localCompany.id })
      .throwIfNotFound();
    await CompanyMembership.query().findById(companyMembership.id).patch({ active: false });
    const deniedRevokedCompanyMembership = await app.inject({
      method: 'PATCH',
      url: `/api/base.partner/${localPartner.id}`,
      headers: { ...headers, 'x-company-id': String(localCompany.id) },
      payload: { name: 'Must remain unchanged after company access revocation' },
    });
    expect(deniedRevokedCompanyMembership.statusCode).toBe(403);
    expect(await Partner.query().findById(localPartner.id)).toMatchObject({
      name: 'PostgreSQL Tenant Contact Updated',
      company_id: localCompany.id,
      active: true,
    });
    await CompanyMembership.query().findById(companyMembership.id).patch({ active: true });

    const membershipAdminGroup = await AccessGroup.query().insert({
      code: 'postgres_company_membership_admins',
      name: 'PostgreSQL Company Membership Admins',
    });
    await GroupMembership.query().insert({
      user_id: localUser.id,
      group_id: membershipAdminGroup.id,
    });
    await ModelAccess.query().insert({
      group_id: membershipAdminGroup.id,
      model_name: 'base.company_membership',
      read: true,
      create: true,
      write: true,
      unlink: true,
    });
    const deniedCompanyMembershipMutation = await app.inject({
      method: 'PATCH',
      url: `/api/base.company_membership/${companyMembership.id}`,
      headers,
      payload: { active: false },
    });
    expect(deniedCompanyMembershipMutation.statusCode).toBe(403);
    expect(await CompanyMembership.query().findById(companyMembership.id)).toMatchObject({
      active: true,
      company_id: localCompany.id,
      user_id: localUser.id,
    });

    const revocableGroup = await AccessGroup.query().insert({
      code: 'postgres_revocable_partner_writers',
      name: 'PostgreSQL Revocable Partner Writers',
    });
    const revocableMembership = await GroupMembership.query().insert({
      user_id: localUser.id,
      group_id: revocableGroup.id,
    });
    await ModelAccess.query().insert({
      group_id: revocableGroup.id,
      model_name: 'base.partner',
      read: true,
      write: true,
    });
    await apiDb('model_access').where({ id: partnerGrant.id }).update({ write: false });
    const revokedGrantAttempt = await app.inject({
      method: 'PATCH',
      url: `/api/base.partner/${localPartner.id}`,
      headers,
      payload: { name: 'Should remain unchanged after grant revocation' },
    });
    expect(revokedGrantAttempt.statusCode, revokedGrantAttempt.payload).toBe(200);
    expect(await Partner.query().findById(localPartner.id)).toMatchObject({
      name: 'Should remain unchanged after grant revocation',
      company_id: localCompany.id,
    });
    await GroupMembership.query().findById(revocableMembership.id).patch({ active: false });
    const deniedAfterGrantRevocation = await app.inject({
      method: 'PATCH',
      url: `/api/base.partner/${localPartner.id}`,
      headers,
      payload: { name: 'Unauthorized write after grant revocation' },
    });
    expect(deniedAfterGrantRevocation.statusCode).toBe(403);
    expect(await Partner.query().findById(localPartner.id)).toMatchObject({
      name: 'Should remain unchanged after grant revocation',
      company_id: localCompany.id,
    });
    await apiDb('model_access').where({ id: partnerGrant.id }).update({ write: true });

    const deniedCompanyReassignment = await app.inject({
      method: 'PATCH',
      url: `/api/base.partner/${localPartner.id}`,
      headers,
      payload: { company_id: foreignCompany.id },
    });
    expect(deniedCompanyReassignment.statusCode).toBe(403);
    expect(await Partner.query().findById(localPartner.id)).toMatchObject({
      name: 'Should remain unchanged after grant revocation',
      company_id: localCompany.id,
    });

    const deniedForeignWrite = await app.inject({
      method: 'PATCH',
      url: `/api/base.partner/${foreignPartner.id}`,
      headers,
      payload: { name: 'Unauthorized foreign update' },
    });
    expect(deniedForeignWrite.statusCode).toBe(404);
    expect(deniedForeignWrite.payload).not.toContain('PostgreSQL Foreign Tenant');
    expect(await Partner.query().findById(foreignPartner.id)).toMatchObject({
      name: 'PostgreSQL Foreign Contact',
      company_id: foreignCompany.id,
    });

    const activityGroup = await AccessGroup.query().insert({
      code: 'postgres_activity_maintainers',
      name: 'PostgreSQL Activity Maintainers',
    });
    await GroupMembership.query().insert({ user_id: localUser.id, group_id: activityGroup.id });
    await ModelAccess.query().insert({
      group_id: activityGroup.id,
      model_name: 'base.activity',
      create: true,
      write: true,
    });
    await ModelAccess.query().insert({
      group_id: activityGroup.id,
      model_name: 'base.tag_link',
      create: true,
    });
    await ModelAccess.query().insert({
      group_id: activityGroup.id,
      model_name: 'base.partner_category_link',
      create: true,
    });
    await ModelAccess.query().insert({
      group_id: activityGroup.id,
      model_name: 'base.partner_address',
      create: true,
    });
    const allowedAddress = await app.inject({
      method: 'POST',
      url: '/api/base.partner_address',
      headers,
      payload: {
        partner_id: localPartner.id,
        label: 'PostgreSQL Home',
        street: '1 Main Street',
        city: 'Jakarta',
      },
    });
    expect(allowedAddress.statusCode, allowedAddress.payload).toBe(201);
    const allowedAddressId = allowedAddress.json<{ data: { id: number } }>().data.id;
    expect(await PartnerAddress.query().findById(allowedAddressId)).toMatchObject({
      partner_id: localPartner.id,
      label: 'PostgreSQL Home',
      street: '1 Main Street',
    });
    const deniedForeignAddress = await app.inject({
      method: 'POST',
      url: '/api/base.partner_address',
      headers,
      payload: {
        partner_id: foreignPartner.id,
        label: 'PostgreSQL Foreign Home',
        street: '2 Main Street',
        city: 'Jakarta',
      },
    });
    expect([400, 403]).toContain(deniedForeignAddress.statusCode);
    expect(await PartnerAddress.query().findOne({ partner_id: foreignPartner.id })).toBeUndefined();
    const scopedCategory = await PartnerCategory.query().insertAndFetch({
      code: `postgres-scoped-category-${randomUUID()}`,
      name: 'PostgreSQL Scoped Category',
    });
    const allowedCategoryLink = await app.inject({
      method: 'POST',
      url: '/api/base.partner_category_link',
      headers,
      payload: { partner_id: localPartner.id, category_id: scopedCategory.id },
    });
    expect(allowedCategoryLink.statusCode, allowedCategoryLink.payload).toBe(201);
    const allowedCategoryLinkId = allowedCategoryLink.json<{ data: { id: number } }>().data.id;
    expect(await PartnerCategoryLink.query().findById(allowedCategoryLinkId)).toMatchObject({
      partner_id: localPartner.id,
      category_id: scopedCategory.id,
    });
    const deniedForeignCategoryLink = await app.inject({
      method: 'POST',
      url: '/api/base.partner_category_link',
      headers,
      payload: { partner_id: foreignPartner.id, category_id: scopedCategory.id },
    });
    expect([400, 403]).toContain(deniedForeignCategoryLink.statusCode);
    expect(
      await PartnerCategoryLink.query().findOne({
        partner_id: foreignPartner.id,
        category_id: scopedCategory.id,
      })
    ).toBeUndefined();
    const scopedTag = await Tag.query().insertAndFetch({ name: 'PostgreSQL Scoped Resource Tag' });
    const allowedLocalTagLink = await app.inject({
      method: 'POST',
      url: '/api/base.tag_link',
      headers,
      payload: {
        tag_id: scopedTag.id,
        resource_model: Partner.modelName,
        resource_id: localPartner.id,
      },
    });
    expect(allowedLocalTagLink.statusCode, allowedLocalTagLink.payload).toBe(201);
    const allowedLocalTagLinkId = allowedLocalTagLink.json<{ data: { id: number } }>().data.id;
    expect(await TagLink.query().findById(allowedLocalTagLinkId)).toMatchObject({
      tag_id: scopedTag.id,
      resource_model: Partner.modelName,
      resource_id: localPartner.id,
    });
    const deniedForeignTagLink = await app.inject({
      method: 'POST',
      url: '/api/base.tag_link',
      headers,
      payload: {
        tag_id: scopedTag.id,
        resource_model: Partner.modelName,
        resource_id: foreignPartner.id,
      },
    });
    expect(deniedForeignTagLink.statusCode).toBe(400);
    expect(
      await TagLink.query().findOne({
        resource_model: Partner.modelName,
        resource_id: foreignPartner.id,
      })
    ).toBeUndefined();
    const deniedForeignActivity = await app.inject({
      method: 'POST',
      url: '/api/base.activity',
      headers,
      payload: {
        summary: 'Must not reference a foreign PostgreSQL partner',
        resource_model: Partner.modelName,
        resource_id: foreignPartner.id,
      },
    });
    expect(deniedForeignActivity.statusCode).toBe(400);
    expect(
      await Activity.query().findOne({ summary: 'Must not reference a foreign PostgreSQL partner' })
    ).toBeUndefined();
    const archivedActivityParent = await Tag.query().insertAndFetch({
      name: 'PostgreSQL Archived Activity Parent',
    });
    await Tag.query().findById(archivedActivityParent.id).patch({ active: false });
    const deniedArchivedActivity = await app.inject({
      method: 'POST',
      url: '/api/base.activity',
      headers,
      payload: {
        summary: 'Must not reference an archived PostgreSQL tag',
        resource_model: Tag.modelName,
        resource_id: archivedActivityParent.id,
      },
    });
    expect(deniedArchivedActivity.statusCode).toBe(400);
    expect(
      await Activity.query().findOne({ summary: 'Must not reference an archived PostgreSQL tag' })
    ).toBeUndefined();
    const createdActivity = await app.inject({
      method: 'POST',
      url: '/api/base.activity',
      headers,
      payload: {
        summary: 'PostgreSQL customer follow-up',
        resource_model: Partner.modelName,
        resource_id: localPartner.id,
      },
    });
    expect(createdActivity.statusCode, createdActivity.payload).toBe(201);
    const createdActivityId = createdActivity.json<{ data: { id: number } }>().data.id;
    expect(await Activity.query().findById(createdActivityId)).toMatchObject({
      summary: 'PostgreSQL customer follow-up',
      resource_model: Partner.modelName,
      resource_id: localPartner.id,
    });
    const deniedForeignActivityReassignment = await app.inject({
      method: 'PATCH',
      url: `/api/base.activity/${createdActivityId}`,
      headers,
      payload: { resource_id: foreignPartner.id },
    });
    expect(deniedForeignActivityReassignment.statusCode).toBe(400);
    expect(await Activity.query().findById(createdActivityId)).toMatchObject({
      resource_model: Partner.modelName,
      resource_id: localPartner.id,
    });
    const updatedActivity = await app.inject({
      method: 'PATCH',
      url: `/api/base.activity/${createdActivityId}`,
      headers,
      payload: { summary: 'PostgreSQL customer follow-up completed' },
    });
    expect(updatedActivity.statusCode, updatedActivity.payload).toBe(200);
    expect(await Activity.query().findById(createdActivityId)).toMatchObject({
      summary: 'PostgreSQL customer follow-up completed',
    });
    const deniedActivityUnlink = await app.inject({
      method: 'DELETE',
      url: `/api/base.activity/${createdActivityId}`,
      headers,
    });
    expect(deniedActivityUnlink.statusCode).toBe(403);
    expect(await Activity.query().findById(createdActivityId)).toMatchObject({
      summary: 'PostgreSQL customer follow-up completed',
    });

    const organizationGroup = await AccessGroup.query().insert({
      code: 'postgres_org_maintainers',
      name: 'PostgreSQL Organization Maintainers',
    });
    await GroupMembership.query().insert({
      user_id: localUser.id,
      group_id: organizationGroup.id,
    });
    await ModelAccess.query().insert({
      group_id: organizationGroup.id,
      model_name: 'organization.department',
      create: true,
      write: true,
    });
    const localDepartment = await OrganizationDepartment.query().insertAndFetch({
      company_id: localCompany.id,
      code: 'postgres_local_operations',
      name: 'PostgreSQL Local Operations',
    });
    const foreignDepartment = await OrganizationDepartment.query().insertAndFetch({
      company_id: foreignCompany.id,
      code: 'postgres_foreign_operations',
      name: 'PostgreSQL Foreign Operations',
    });

    const allowedDepartmentWrite = await app.inject({
      method: 'PATCH',
      url: `/api/organization.department/${localDepartment.id}`,
      headers,
      payload: { name: 'PostgreSQL Local Operations Updated' },
    });
    expect(allowedDepartmentWrite.statusCode, allowedDepartmentWrite.payload).toBe(200);
    expect(await OrganizationDepartment.query().findById(localDepartment.id)).toMatchObject({
      name: 'PostgreSQL Local Operations Updated',
      company_id: localCompany.id,
    });

    const deniedDepartmentWrite = await app.inject({
      method: 'PATCH',
      url: `/api/organization.department/${foreignDepartment.id}`,
      headers,
      payload: { name: 'Unauthorized foreign department update' },
    });
    expect(deniedDepartmentWrite.statusCode).toBe(404);
    expect(deniedDepartmentWrite.payload).not.toContain('PostgreSQL Foreign Tenant');
    expect(await OrganizationDepartment.query().findById(foreignDepartment.id)).toMatchObject({
      name: 'PostgreSQL Foreign Operations',
      company_id: foreignCompany.id,
    });

    const allowedDepartmentCreate = await app.inject({
      method: 'POST',
      url: '/api/organization.department',
      headers,
      payload: {
        company_id: localCompany.id,
        code: 'postgres_local_support',
        name: 'PostgreSQL Local Support',
      },
    });
    expect(allowedDepartmentCreate.statusCode, allowedDepartmentCreate.payload).toBe(201);
    const createdDepartmentId = allowedDepartmentCreate.json<{ data: { id: number } }>().data.id;
    expect(await OrganizationDepartment.query().findById(createdDepartmentId)).toMatchObject({
      company_id: localCompany.id,
      code: 'postgres_local_support',
      name: 'PostgreSQL Local Support',
    });

    const deniedDepartmentUnlink = await app.inject({
      method: 'DELETE',
      url: `/api/organization.department/${createdDepartmentId}`,
      headers,
    });
    expect(deniedDepartmentUnlink.statusCode).toBe(403);
    expect(await OrganizationDepartment.query().findById(createdDepartmentId)).toMatchObject({
      company_id: localCompany.id,
      code: 'postgres_local_support',
      name: 'PostgreSQL Local Support',
    });

    const deniedDepartmentCreate = await app.inject({
      method: 'POST',
      url: '/api/organization.department',
      headers,
      payload: {
        company_id: foreignCompany.id,
        code: 'postgres_foreign_support',
        name: 'PostgreSQL Foreign Support',
      },
    });
    expect(deniedDepartmentCreate.statusCode).toBe(403);
    expect(deniedDepartmentCreate.payload).not.toContain('PostgreSQL Foreign Tenant');
    expect(
      await OrganizationDepartment.query().findOne({ code: 'postgres_foreign_support' })
    ).toBeUndefined();

    const filteredCount = await app.inject({
      method: 'GET',
      url: `/api/base.partner?domain=${encodeURIComponent(JSON.stringify([['id', '=', foreignPartner.id]]))}&limit=500&count=true`,
      headers,
    });
    expect(filteredCount.statusCode).toBe(200);
    expect(filteredCount.json<{ total: number; data: { id: number }[] }>()).toMatchObject({
      total: 0,
      data: [],
    });

    const mixedCompanyDomain = encodeURIComponent(
      JSON.stringify(['|', ['id', '=', localPartner.id], ['id', '=', foreignPartner.id]])
    );
    const scopedOrCount = await app.inject({
      method: 'GET',
      url: `/api/base.partner?domain=${mixedCompanyDomain}&limit=1&count=true`,
      headers,
    });
    expect(scopedOrCount.statusCode).toBe(200);
    expect(scopedOrCount.json<{ total: number; data: { id: number }[] }>()).toMatchObject({
      total: 1,
      data: [{ id: localPartner.id }],
    });

    const scopedOrExport = await app.inject({
      method: 'GET',
      url: `/api/base.partner?domain=${mixedCompanyDomain}&limit=500`,
      headers,
    });
    expect(scopedOrExport.statusCode).toBe(200);
    expect(scopedOrExport.json<{ data: { id: number; name: string }[] }>().data).toEqual([
      expect.objectContaining({
        id: localPartner.id,
        name: 'Should remain unchanged after grant revocation',
      }),
    ]);
    expect(scopedOrExport.payload).not.toContain('PostgreSQL Foreign Contact');

    const groupedCount = await app.inject({
      method: 'GET',
      url: `/api/base.partner/group-count?group_by=company_id&domain=${mixedCompanyDomain}`,
      headers,
    });
    expect(groupedCount.statusCode).toBe(200);
    expect(
      groupedCount.json<{ groups: { values: { company_id: number }; count: number }[] }>().groups
    ).toEqual([{ values: { company_id: localCompany.id }, count: 1 }]);

    const allowedCreateName = 'PostgreSQL Granted Tenant Contact';
    const allowedOwnCreate = await app.inject({
      method: 'POST',
      url: '/api/base.partner',
      headers,
      payload: { name: allowedCreateName, company_id: localCompany.id },
    });
    expect(allowedOwnCreate.statusCode, allowedOwnCreate.payload).toBe(201);
    const createdPartnerId = allowedOwnCreate.json<{ data: { id: number } }>().data.id;
    expect(await Partner.query().findById(createdPartnerId)).toMatchObject({
      name: allowedCreateName,
      company_id: localCompany.id,
    });

    const deniedCreateName = 'PostgreSQL Denied Foreign Create';
    const deniedForeignCreate = await app.inject({
      method: 'POST',
      url: '/api/base.partner',
      headers,
      payload: { name: deniedCreateName, company_id: foreignCompany.id },
    });
    expect(deniedForeignCreate.statusCode).toBe(403);
    expect(await Partner.query().findOne({ name: deniedCreateName })).toBeUndefined();

    const deniedForeignParent = await app.inject({
      method: 'POST',
      url: '/api/base.partner',
      headers,
      payload: {
        name: 'Cross-company parent assignment',
        company_id: localCompany.id,
        parent_id: foreignPartner.id,
      },
    });
    expect(deniedForeignParent.statusCode).toBe(403);
  }, 30000);

  it('matches PostgreSQL domain operator and nullable-field semantics', async () => {
    const fixtures = await Partner.query().insert([
      { name: 'Domain Probe Alpha', city: 'Jakarta' },
      { name: 'DOMAIN PROBE Beta', city: 'Bandung' },
      { name: 'Unrelated Domain Probe', city: null },
    ]);
    const fixtureIds = fixtures.map(({ id }) => id);
    const fixtureDomain: [string, 'in', number[]][] = [['id', 'in', fixtureIds]];

    const insensitiveMatches = await Partner.search([
      ...fixtureDomain,
      ['name', 'ilike', '%domain probe%'],
    ]);
    expect(insensitiveMatches.map(({ name }) => name).sort()).toEqual([
      'DOMAIN PROBE Beta',
      'Domain Probe Alpha',
      'Unrelated Domain Probe',
    ]);

    const caseSensitiveMatches = await Partner.search([
      ...fixtureDomain,
      ['name', 'like', '%Domain Probe%'],
    ]);
    expect(caseSensitiveMatches.map(({ name }) => name).sort()).toEqual([
      'Domain Probe Alpha',
      'Unrelated Domain Probe',
    ]);

    const caseSensitiveExclusions = await Partner.search([
      ...fixtureDomain,
      ['name', 'not like', '%Domain Probe%'],
    ]);
    expect(caseSensitiveExclusions.map(({ name }) => name)).toEqual(['DOMAIN PROBE Beta']);

    const negativeInsensitiveMatches = await Partner.search([
      ...fixtureDomain,
      ['name', 'not ilike', '%domain probe%'],
    ]);
    expect(negativeInsensitiveMatches).toHaveLength(0);

    const nullCities = await Partner.search([...fixtureDomain, ['city', 'is null', null]]);
    expect(nullCities.map(({ name }) => name)).toEqual(['Unrelated Domain Probe']);

    const nonNullCities = await Partner.search([...fixtureDomain, ['city', 'is not null', null]]);
    expect(nonNullCities.map(({ city }) => city).sort()).toEqual(['Bandung', 'Jakarta']);

    const listedCities = await Partner.search([
      ...fixtureDomain,
      ['city', 'in', ['Jakarta', 'Bandung']],
    ]);
    expect(listedCities).toHaveLength(2);

    const excludedCities = await Partner.search([
      ...fixtureDomain,
      ['city', 'not in', ['Jakarta', 'Bandung']],
    ]);
    expect(excludedCities).toHaveLength(0);

    const boundedIds = await Partner.search([
      ...fixtureDomain,
      ['id', '>=', Math.min(...fixtureIds)],
      ['id', '<=', Math.max(...fixtureIds)],
    ]);
    expect(boundedIds).toHaveLength(3);
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

  it('commits a PostgreSQL cancellation that wins the race with worker success', async () => {
    let signalStarted: (() => void) | undefined;
    let releaseHandler: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const unregister = registerJobHandler({
      name: 'test.postgres-cancel-at-commit',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        signalStarted?.();
        await hold;
        return { completed: true };
      },
    });
    try {
      const jobId = await enqueueJob('test.postgres-cancel-at-commit', { run: true });
      const worker = runOneJob({ workerId: 'postgres-cancel-at-commit-worker' });
      await started;

      expect(await cancelJob(jobId)).toBe(true);
      releaseHandler?.();
      expect(await worker).toBe(true);
      await expect(Job.query().findById(jobId)).resolves.toMatchObject({
        status: 'cancelled',
        cancel_requested: false,
        lease_owner: null,
      });
      await expect(JobRun.query().where({ job_id: jobId }).first()).resolves.toMatchObject({
        status: 'cancelled',
        error_code: 'JOB_CANCELLED',
        result: null,
      });
    } finally {
      releaseHandler?.();
      unregister();
    }
  }, 30000);

  it('recovers an expired PostgreSQL worker lease with a new fence and preserved attempt history', async () => {
    const unregister = registerJobHandler({
      name: 'test.postgres-reclaim',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        return { recovered: true };
      },
    });
    try {
      const expired = await Job.query().insertAndFetch({
        handler: 'test.postgres-reclaim',
        handler_version: 1,
        payload: '{"run":true}',
        status: 'running',
        attempts: 1,
        max_attempts: 3,
        fencing_token: 1,
        lease_owner: 'crashed-postgres-worker',
        lease_until: new Date(0).toISOString(),
        available_at: new Date(0).toISOString(),
      });
      const previousRun = await JobRun.query().insertAndFetch({
        job_id: expired.id,
        attempt: 1,
        worker_id: 'crashed-postgres-worker',
        status: 'running',
        started_at: new Date(0).toISOString(),
      });

      expect(await runOneJob({ workerId: 'postgres-recovery-worker' })).toBe(true);
      await expect(Job.query().findById(expired.id)).resolves.toMatchObject({
        status: 'succeeded',
        attempts: 2,
        fencing_token: 2,
        lease_owner: null,
      });
      await expect(JobRun.query().findById(previousRun.id)).resolves.toMatchObject({
        status: 'retrying',
        error_code: 'LEASE_EXPIRED',
      });
      const history = await JobRun.query().where({ job_id: expired.id }).orderBy('attempt');
      expect(history).toHaveLength(2);
      expect(history.map(({ worker_id, status }) => ({ worker_id, status }))).toEqual([
        { worker_id: 'crashed-postgres-worker', status: 'retrying' },
        { worker_id: 'postgres-recovery-worker', status: 'succeeded' },
      ]);
    } finally {
      unregister();
    }
  }, 30000);
});
