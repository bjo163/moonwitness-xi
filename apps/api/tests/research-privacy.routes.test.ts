import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { manifest as knowledgeManifest } from '@moonwitness/orm-knowledge';
import { researchPrivacyRoutes } from '../src/routes/research-privacy.routes.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('synthetic research privacy API', () => {
  let db: Knex;
  let app: ReturnType<typeof Fastify>;
  let superadminId: number;
  let systemId: number;
  let companyId: number;

  beforeEach(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      pool: {
        afterCreate(
          connection: { pragma(sql: string): unknown },
          done: (error: Error | null, connection: unknown) => void
        ) {
          connection.pragma('foreign_keys = ON');
          done(null, connection);
        },
      },
    });
    await installAddons(db, [baseManifest, knowledgeManifest]);
    superadminId = Number((await db('users').where({ login: 'superadmin' }).first('id'))?.id);
    systemId = Number((await db('users').where({ login: 'system' }).first('id'))?.id);
    companyId = Number((await db('companies').first('id'))?.id);
    app = Fastify();
    app.decorateRequest('auth', null);
    app.decorate('db', db);
    app.addHook('onRequest', async (request) => {
      const role = request.headers['x-test-role'];
      if (role === 'superadmin' || role === 'user') {
        request.auth = {
          userId: request.headers['x-test-user'] === 'system' ? systemId : superadminId,
          role,
          companyId,
          groupPermissions: [],
        };
      }
    });
    await app.register(researchPrivacyRoutes);
  });

  afterEach(async () => {
    await app.close();
    await db.destroy();
  });

  function body(overrides: Record<string, unknown> = {}) {
    return {
      subject_ref_sha256: sha256('synthetic-api-subject'),
      consent_decision_ref_sha256: sha256('synthetic-api-consent'),
      idempotency_key: 'synthetic-api-revoke-0001',
      ...overrides,
    };
  }

  it('requires authentication and denies ordinary users and non-stewards', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/research/privacy/projections',
    });
    const ordinary = await app.inject({
      method: 'POST',
      url: '/api/research/privacy/revocations',
      headers: { 'x-test-role': 'user' },
      payload: body(),
    });
    const nonSteward = await app.inject({
      method: 'GET',
      url: '/api/research/privacy/projections',
      headers: { 'x-test-role': 'superadmin', 'x-test-user': 'system' },
    });
    expect(anonymous.statusCode).toBe(401);
    expect(ordinary.statusCode).toBe(403);
    expect(nonSteward.statusCode).toBe(403);
    expect(await db('knowledge_privacy_revocations')).toHaveLength(0);
  });

  it('rejects raw references, forged actor/tenant fields, and malformed hashes', async () => {
    const rawReference = await app.inject({
      method: 'POST',
      url: '/api/research/privacy/revocations',
      headers: { 'x-test-role': 'superadmin' },
      payload: body({ subject_ref: 'real-person@example.test' }),
    });
    const forgedActor = await app.inject({
      method: 'POST',
      url: '/api/research/privacy/revocations',
      headers: { 'x-test-role': 'superadmin' },
      payload: body({ actor_id: systemId, company_id: companyId + 1 }),
    });
    const malformedHash = await app.inject({
      method: 'POST',
      url: '/api/research/privacy/revocations',
      headers: { 'x-test-role': 'superadmin' },
      payload: body({ subject_ref_sha256: 'not-a-digest' }),
    });
    expect(rawReference.statusCode).toBe(400);
    expect(forgedActor.statusCode).toBe(400);
    expect(malformedHash.statusCode).toBe(400);
    expect(await db('knowledge_privacy_revocations')).toHaveLength(0);
  });

  it('records a hash-only withdrawal, clears one projection, and replays idempotently', async () => {
    const subjectHash = sha256('synthetic-api-subject');
    await db('knowledge_privacy_projections').insert({
      company_id: companyId,
      projection_key: 'synthetic-api-search-001',
      subject_ref_sha256: subjectHash,
      projection_json: JSON.stringify({ excerpt: 'SYNTHETIC-API-ONLY-CANARY' }),
      projection_digest: sha256(JSON.stringify({ excerpt: 'SYNTHETIC-API-ONLY-CANARY' })),
      synthetic: true,
      visibility: 'RESTRICTED',
      state: 'active',
    });
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/api/research/privacy/revocations',
        headers: { 'x-test-role': 'superadmin' },
        payload: body(),
      });

    const first = await send();
    const replay = await send();
    expect(first.statusCode).toBe(201);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(first.json()).toMatchObject({
      success: true,
      data: { replayed: false, invalidated_projection_count: 1 },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ success: true, data: { replayed: true } });
    expect(first.body).not.toContain('synthetic-api-subject');
    expect(first.body).not.toContain('synthetic-api-consent');
    expect(
      await db('knowledge_privacy_projections').where({
        projection_key: 'synthetic-api-search-001',
        state: 'active',
      })
    ).toHaveLength(0);
    expect(await db('knowledge_privacy_revocations')).toHaveLength(1);
  });

  it('rejects a client-supplied decision timestamp', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/privacy/revocations',
      headers: { 'x-test-role': 'superadmin' },
      payload: body({ decided_at: '1900-01-01T00:00:00.000Z' }),
    });
    expect(response.statusCode).toBe(400);
    expect(await db('knowledge_privacy_revocations')).toHaveLength(0);
  });

  it('does not accept a withdrawal for a matching non-synthetic projection', async () => {
    const subjectHash = sha256('non-synthetic-subject');
    const projectionJson = JSON.stringify({ excerpt: 'NON-SYNTHETIC-PRIVATE-CANARY' });
    await db('knowledge_privacy_projections').insert({
      company_id: companyId,
      projection_key: 'non-synthetic-private-projection',
      subject_ref_sha256: subjectHash,
      projection_json: projectionJson,
      projection_digest: sha256(projectionJson),
      synthetic: false,
      visibility: 'RESTRICTED',
      state: 'active',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/privacy/revocations',
      headers: { 'x-test-role': 'superadmin' },
      payload: body({ subject_ref_sha256: subjectHash }),
    });
    expect(response.statusCode).toBe(404);
    expect(await db('knowledge_privacy_revocations')).toHaveLength(0);
    expect(
      await db('knowledge_privacy_projections')
        .where({ projection_key: 'non-synthetic-private-projection' })
        .first('state')
    ).toMatchObject({ state: 'active' });
  });

  it('returns only active privacy projections and never their subject hashes', async () => {
    await db('knowledge_privacy_projections').insert({
      company_id: companyId,
      projection_key: 'non-synthetic-private-projection',
      subject_ref_sha256: sha256('non-synthetic-subject'),
      projection_json: JSON.stringify({ excerpt: 'MUST-NOT-RETURN' }),
      projection_digest: sha256(JSON.stringify({ excerpt: 'MUST-NOT-RETURN' })),
      synthetic: false,
      visibility: 'RESTRICTED',
      state: 'active',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/research/privacy/projections',
      headers: { 'x-test-role': 'superadmin' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json().data).toMatchObject([
      {
        projection_key: 'synthetic-search-001',
        content: { excerpt: 'Synthetic privacy projection only; no witness data.' },
      },
    ]);
    expect(response.body).not.toContain(
      '357a432635adf14e8fcde203cfc900cb0ad8e43d9768a59a9052a4f52aca7623'
    );
    expect(response.body).not.toContain('MUST-NOT-RETURN');
  });
});
