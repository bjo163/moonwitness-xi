import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest, ModelAccess, User } from '@moonwitness/orm-base';
import {
  applyPrivacyRevocation,
  manifest,
  PrivacyRevocationError,
  readActivePrivacyProjections,
  type ApplyPrivacyRevocationInput,
  type AuthenticatedPrivacySteward,
} from '../src/index.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('persisted synthetic privacy revocation', () => {
  let db: Knex;
  let steward: AuthenticatedPrivacySteward;
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
    await installAddons(db, [baseManifest, manifest]);
    const user = await db('users').where({ login: 'superadmin' }).first('id');
    const company = await db('companies').first('id');
    if (!user || !company) throw new Error('Synthetic superadmin and company seed are required');
    User.knex(db);
    steward = { userId: Number(user.id), companyId: Number(company.id), role: 'superadmin' };
    companyId = Number(company.id);
  });

  afterEach(async () => db.destroy());

  function revocationInput(
    subjectRef = `synthetic-private-subject-${randomUUID()}`,
    consentDecisionRef = `synthetic-consent-decision-${randomUUID()}`,
    idempotencyKey = `privacy-revoke-${randomUUID()}`
  ): ApplyPrivacyRevocationInput {
    return {
      steward,
      subjectRefSha256: sha256(subjectRef),
      consentDecisionRefSha256: sha256(consentDecisionRef),
      idempotencyKey,
      decidedAt: '2026-10-16T04:00:00.000Z',
    };
  }

  async function addProjection(subjectHash: string, projectionKey = `search-${randomUUID()}`) {
    await db('knowledge_privacy_projections').insert({
      company_id: companyId,
      projection_key: projectionKey,
      subject_ref_sha256: subjectHash,
      projection_json: JSON.stringify({ excerpt: 'SYNTHETIC-PRIVATE-CANARY' }),
      projection_digest: sha256(JSON.stringify({ excerpt: 'SYNTHETIC-PRIVATE-CANARY' })),
      visibility: 'RESTRICTED',
      state: 'active',
    });
    return projectionKey;
  }

  it('atomically records only hashes and removes the subject from active search projections', async () => {
    const subjectRef = `synthetic-private-subject-${randomUUID()}`;
    const consentDecisionRef = `synthetic-consent-decision-${randomUUID()}`;
    const input = revocationInput(subjectRef, consentDecisionRef);
    const projectionKey = await addProjection(input.subjectRefSha256);
    const initialProjections = await readActivePrivacyProjections(db, steward);
    expect(
      initialProjections.find((projection) => projection.projectionKey === projectionKey)
    ).toMatchObject({
      content: { excerpt: 'SYNTHETIC-PRIVATE-CANARY' },
    });

    const result = await applyPrivacyRevocation(db, input);

    expect(result).toMatchObject({ replayed: false, invalidatedProjectionCount: 1 });
    const activeAfterRevocation = await readActivePrivacyProjections(db, steward);
    expect(
      activeAfterRevocation.some((projection) => projection.projectionKey === projectionKey)
    ).toBe(false);
    const stored = await db('knowledge_privacy_revocations')
      .where({ id: result.revocationId })
      .first();
    expect(stored).toMatchObject({
      company_id: companyId,
      actor_id: steward.userId,
      subject_ref_sha256: input.subjectRefSha256,
      consent_decision_ref_sha256: input.consentDecisionRefSha256,
      decided_at: input.decidedAt,
    });
    expect(JSON.stringify(stored)).not.toContain(subjectRef);
    expect(JSON.stringify(stored)).not.toContain(consentDecisionRef);
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC-PRIVATE-CANARY');
    await expect(
      db('knowledge_privacy_revocations')
        .where({ id: result.revocationId })
        .update({ decided_at: 'changed' })
    ).rejects.toThrow('append-only');
    await expect(
      db('knowledge_privacy_revocations').where({ id: result.revocationId }).delete()
    ).rejects.toThrow('append-only');
    const projection = await db('knowledge_privacy_projections')
      .where({ projection_key: projectionKey })
      .first();
    expect(projection).toMatchObject({
      state: 'revoked',
      projection_json: '{}',
      projection_digest: null,
    });
  });

  it('replays an exact idempotency key and rejects a conflicting decision', async () => {
    const input = revocationInput();
    await addProjection(input.subjectRefSha256);
    const first = await applyPrivacyRevocation(db, input);
    const replay = await applyPrivacyRevocation(db, input);
    expect(replay).toEqual({
      revocationId: first.revocationId,
      replayed: true,
      invalidatedProjectionCount: 0,
    });
    await expect(
      applyPrivacyRevocation(db, {
        ...input,
        subjectRefSha256: sha256(`different-${randomUUID()}`),
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      applyPrivacyRevocation(db, {
        ...input,
        decidedAt: '2026-10-16T04:01:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await db('knowledge_privacy_revocations')).toHaveLength(1);
  });

  it('rolls the decision back if projection invalidation fails', async () => {
    const input = revocationInput();
    const projectionKey = await addProjection(input.subjectRefSha256);
    await db.raw(`
      CREATE TRIGGER fail_privacy_projection_invalidation
      BEFORE UPDATE ON knowledge_privacy_projections
      BEGIN SELECT RAISE(ABORT, 'fixture projection invalidation failure'); END
    `);

    await expect(applyPrivacyRevocation(db, input)).rejects.toThrow(
      'fixture projection invalidation failure'
    );
    expect(await db('knowledge_privacy_revocations')).toHaveLength(0);
    const projection = await db('knowledge_privacy_projections')
      .where({ projection_key: projectionKey })
      .first();
    expect(projection).toMatchObject({ state: 'active' });
  });

  it('fails closed for a different company and rejects non-steward mutation', async () => {
    const input = revocationInput();
    await addProjection(input.subjectRefSha256);
    await expect(
      readActivePrivacyProjections(db, { ...steward, companyId: companyId + 999 })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      readActivePrivacyProjections(db, { ...steward, role: 'user' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      applyPrivacyRevocation(db, {
        ...input,
        steward: { ...steward, role: 'user' },
      })
    ).rejects.toBeInstanceOf(PrivacyRevocationError);
    const activeProjections = await readActivePrivacyProjections(db, steward);
    expect(
      activeProjections.some(
        (projection) => projection.content.excerpt === 'SYNTHETIC-PRIVATE-CANARY'
      )
    ).toBe(true);
    expect(await db('knowledge_privacy_revocations')).toHaveLength(0);
  });

  it('keeps both privacy models unavailable through generic user model access', async () => {
    for (const modelName of ['knowledge.privacy_revocation', 'knowledge.privacy_projection']) {
      await expect(
        ModelAccess.query().findOne({ model_name: modelName, read: false, write: false })
      ).resolves.toBeDefined();
    }
  });

  it('fails closed when a stored projection digest does not match its JSON bytes', async () => {
    await db('knowledge_privacy_projections')
      .where({ projection_key: 'synthetic-search-001' })
      .update({ projection_digest: '0'.repeat(64) });

    await expect(readActivePrivacyProjections(db, steward)).rejects.toMatchObject({
      code: 'INVALID_STORED_PROJECTION',
    });
  });
});
