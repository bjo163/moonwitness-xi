import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { manifest } from '../src/manifest.js';
import {
  applyPrivacyRevocation,
  readActivePrivacyProjections,
  type AuthenticatedPrivacySteward,
} from '../src/privacy-revocation.js';

const connectionString = process.env.POSTGRES_TEST_URL;
const postgresDescribe = connectionString ? describe : describe.skip;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

postgresDescribe('synthetic privacy revocation PostgreSQL integration', () => {
  const schema = `mw_privacy_${randomUUID().replaceAll('-', '')}`;
  let adminDb: Knex;
  let db: Knex;
  let steward: AuthenticatedPrivacySteward;

  beforeAll(async () => {
    if (!connectionString) throw new Error('POSTGRES_TEST_URL is required');
    adminDb = knex({ client: 'pg', connection: connectionString, pool: { min: 0, max: 2 } });
    await adminDb.raw('select 1');
    await adminDb.raw('create schema ??', [schema]);
    db = knex({
      client: 'pg',
      connection: connectionString,
      searchPath: [schema],
      pool: { min: 0, max: 2 },
    });
    await installAddons(db, [baseManifest, manifest]);
    const user = await db('users').where({ login: 'superadmin' }).first('id');
    const company = await db('companies').first('id');
    if (!user || !company) throw new Error('Synthetic superadmin and company seed are required');
    steward = { userId: Number(user.id), companyId: Number(company.id), role: 'superadmin' };
  }, 30000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (adminDb) {
      await adminDb.raw('drop schema if exists ?? cascade', [schema]);
      await adminDb.destroy();
    }
  });

  it('atomically persists redaction, idempotent replay, tenant denial, and rollback', async () => {
    const subjectRef = `synthetic-pg-subject-${randomUUID()}`;
    const consentDecisionRef = `synthetic-pg-consent-${randomUUID()}`;
    const subjectRefSha256 = sha256(subjectRef);
    const consentDecisionRefSha256 = sha256(consentDecisionRef);
    const idempotencyKey = `privacy-pg-${randomUUID()}`;
    const projectionKey = `search-pg-${randomUUID()}`;
    await db('knowledge_privacy_projections').insert({
      company_id: steward.companyId,
      projection_key: projectionKey,
      subject_ref_sha256: subjectRefSha256,
      projection_json: JSON.stringify({ excerpt: 'POSTGRES-SYNTHETIC-CANARY' }),
      projection_digest: sha256(JSON.stringify({ excerpt: 'POSTGRES-SYNTHETIC-CANARY' })),
      visibility: 'RESTRICTED',
      state: 'active',
    });
    const input = {
      steward,
      subjectRefSha256,
      consentDecisionRefSha256,
      idempotencyKey,
      decidedAt: '2026-10-16T04:00:00.000Z',
    };

    const first = await applyPrivacyRevocation(db, input);
    const replay = await applyPrivacyRevocation(db, input);
    expect(first).toMatchObject({ replayed: false, invalidatedProjectionCount: 1 });
    expect(replay).toEqual({
      revocationId: first.revocationId,
      replayed: true,
      invalidatedProjectionCount: 0,
    });
    const activeAfterRevocation = await readActivePrivacyProjections(db, steward);
    expect(activeAfterRevocation.map((projection) => projection.projectionKey)).toEqual([
      'synthetic-search-001',
    ]);
    expect(JSON.stringify(activeAfterRevocation)).not.toContain('POSTGRES-SYNTHETIC-CANARY');
    expect(
      activeAfterRevocation.some((projection) => projection.projectionKey === projectionKey)
    ).toBe(false);
    const revocation = await db('knowledge_privacy_revocations')
      .where({ id: first.revocationId })
      .first();
    expect(JSON.stringify(revocation)).not.toContain(subjectRef);
    expect(JSON.stringify(revocation)).not.toContain(consentDecisionRef);
    expect(JSON.stringify(first)).not.toContain('POSTGRES-SYNTHETIC-CANARY');
    await expect(
      readActivePrivacyProjections(db, { ...steward, companyId: steward.companyId + 999 })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const rollbackSubject = `synthetic-pg-rollback-${randomUUID()}`;
    const rollbackSubjectSha256 = sha256(rollbackSubject);
    await db('knowledge_privacy_projections').insert({
      company_id: steward.companyId,
      projection_key: `search-pg-rollback-${randomUUID()}`,
      subject_ref_sha256: rollbackSubjectSha256,
      projection_json: JSON.stringify({ excerpt: 'ROLLBACK-SYNTHETIC-CANARY' }),
      projection_digest: sha256(JSON.stringify({ excerpt: 'ROLLBACK-SYNTHETIC-CANARY' })),
      visibility: 'RESTRICTED',
      state: 'active',
    });
    await db.raw(`
      CREATE FUNCTION fail_privacy_projection_invalidation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'fixture projection invalidation failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.raw(`
      CREATE TRIGGER fail_privacy_projection_invalidation
      BEFORE UPDATE ON knowledge_privacy_projections
      FOR EACH ROW EXECUTE FUNCTION fail_privacy_projection_invalidation()
    `);
    await expect(
      applyPrivacyRevocation(db, {
        steward,
        subjectRefSha256: rollbackSubjectSha256,
        consentDecisionRefSha256: sha256(`synthetic-pg-rollback-consent-${randomUUID()}`),
        idempotencyKey: `privacy-pg-rollback-${randomUUID()}`,
        decidedAt: '2026-10-16T04:05:00.000Z',
      })
    ).rejects.toThrow('fixture projection invalidation failure');
    expect(
      await db('knowledge_privacy_revocations').where({
        subject_ref_sha256: rollbackSubjectSha256,
      })
    ).toHaveLength(0);
    expect(
      await db('knowledge_privacy_projections').where({
        subject_ref_sha256: rollbackSubjectSha256,
        state: 'active',
      })
    ).toHaveLength(1);
  }, 30000);
});
