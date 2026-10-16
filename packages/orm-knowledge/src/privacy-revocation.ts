import { createHash } from 'node:crypto';
import type { Knex } from 'knex';

const revocationTable = 'knowledge_privacy_revocations';
const projectionTable = 'knowledge_privacy_projections';
const digestPattern = /^[a-f0-9]{64}$/u;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

export interface AuthenticatedPrivacySteward {
  readonly userId: number;
  readonly companyId: number;
  readonly role: 'user' | 'superadmin';
}

export interface ApplyPrivacyRevocationInput {
  readonly steward: AuthenticatedPrivacySteward;
  readonly subjectRefSha256: string;
  readonly consentDecisionRefSha256: string;
  readonly idempotencyKey: string;
  readonly decidedAt: string;
}

export interface ApplyPrivacyRevocationResult {
  readonly revocationId: number;
  readonly replayed: boolean;
  readonly invalidatedProjectionCount: number;
}

export interface ActivePrivacyProjection {
  readonly projectionKey: string;
  readonly content: Record<string, unknown>;
  readonly digest: string;
}

export type PrivacyRevocationErrorCode =
  'INVALID_REQUEST' | 'FORBIDDEN' | 'IDEMPOTENCY_CONFLICT' | 'INVALID_STORED_PROJECTION';

export class PrivacyRevocationError extends Error {
  constructor(
    readonly code: PrivacyRevocationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PrivacyRevocationError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validSteward(steward: AuthenticatedPrivacySteward): boolean {
  return (
    Number.isSafeInteger(steward.userId) &&
    steward.userId > 0 &&
    Number.isSafeInteger(steward.companyId) &&
    steward.companyId > 0 &&
    (steward.role === 'user' || steward.role === 'superadmin')
  );
}

function validateInput(input: ApplyPrivacyRevocationInput): void {
  const timestamp = new Date(input.decidedAt);
  if (
    !validSteward(input.steward) ||
    input.steward.role !== 'superadmin' ||
    typeof input.subjectRefSha256 !== 'string' ||
    !digestPattern.test(input.subjectRefSha256) ||
    typeof input.consentDecisionRefSha256 !== 'string' ||
    !digestPattern.test(input.consentDecisionRefSha256) ||
    typeof input.idempotencyKey !== 'string' ||
    !idempotencyPattern.test(input.idempotencyKey) ||
    Number.isNaN(timestamp.getTime()) ||
    timestamp.toISOString() !== input.decidedAt
  ) {
    throw new PrivacyRevocationError('INVALID_REQUEST', 'Explicit revocation fields are required');
  }
}

async function verifySteward(trx: Knex.Transaction, steward: AuthenticatedPrivacySteward) {
  if (steward.role !== 'superadmin') {
    throw new PrivacyRevocationError(
      'FORBIDDEN',
      'Privacy steward is not authorized for this company'
    );
  }
  const user = await trx('users')
    .where({ id: steward.userId, role: steward.role, active: true })
    .first('id');
  const company = await trx('companies').where({ id: steward.companyId, active: true }).first('id');
  const membership = await trx('company_memberships')
    .where({ user_id: steward.userId, company_id: steward.companyId, active: true })
    .first('id');
  const privacyGroupMembership = await trx('group_memberships as membership')
    .join('access_groups as access_group', 'access_group.id', 'membership.group_id')
    .where({
      'membership.user_id': steward.userId,
      'access_group.code': 'knowledge_privacy_steward',
    })
    .first('membership.id');
  if (!user || !company || !membership || !privacyGroupMembership) {
    throw new PrivacyRevocationError(
      'FORBIDDEN',
      'Privacy steward is not authorized for this company'
    );
  }
}

function eventDigest(input: ApplyPrivacyRevocationInput): string {
  return sha256(
    JSON.stringify({
      action: 'withdrawn',
      companyId: input.steward.companyId,
      actorId: input.steward.userId,
      subjectRefSha256: input.subjectRefSha256,
      consentDecisionRefSha256: input.consentDecisionRefSha256,
      idempotencyKey: input.idempotencyKey,
      decidedAt: input.decidedAt,
    })
  );
}

/**
 * Persist one sanitized withdrawal and erase matching search projections atomically.
 * Raw subject and consent references are never written to the database or result.
 */
export async function applyPrivacyRevocation(
  db: Knex,
  input: ApplyPrivacyRevocationInput
): Promise<ApplyPrivacyRevocationResult> {
  validateInput(input);
  const subjectRefSha256 = input.subjectRefSha256;
  const consentDecisionRefSha256 = input.consentDecisionRefSha256;
  const digest = eventDigest(input);

  return db.transaction(async (trx) => {
    await verifySteward(trx, input.steward);
    const current = await trx(revocationTable)
      .where({ company_id: input.steward.companyId, idempotency_key: input.idempotencyKey })
      .forUpdate()
      .first('id', 'event_digest');
    if (current) {
      if (current.event_digest !== digest) {
        throw new PrivacyRevocationError(
          'IDEMPOTENCY_CONFLICT',
          'Revocation idempotency key was already used for a different decision'
        );
      }
      return { revocationId: Number(current.id), replayed: true, invalidatedProjectionCount: 0 };
    }

    const inserted = await trx(revocationTable)
      .insert({
        company_id: input.steward.companyId,
        actor_id: input.steward.userId,
        subject_ref_sha256: subjectRefSha256,
        consent_decision_ref_sha256: consentDecisionRefSha256,
        idempotency_key: input.idempotencyKey,
        event_digest: digest,
        decided_at: input.decidedAt,
      })
      .onConflict(['company_id', 'idempotency_key'])
      .ignore()
      .returning('id');

    if (inserted.length === 0) {
      const replay = await trx(revocationTable)
        .where({ company_id: input.steward.companyId, idempotency_key: input.idempotencyKey })
        .forUpdate()
        .first('id', 'event_digest');
      if (replay?.event_digest === digest) {
        return { revocationId: Number(replay.id), replayed: true, invalidatedProjectionCount: 0 };
      }
      throw new PrivacyRevocationError(
        'IDEMPOTENCY_CONFLICT',
        'Revocation idempotency key was already used for a different decision'
      );
    }

    const invalidatedProjectionCount = await trx(projectionTable)
      .where({
        company_id: input.steward.companyId,
        subject_ref_sha256: subjectRefSha256,
        state: 'active',
      })
      .update({
        state: 'revoked',
        projection_json: '{}',
        projection_digest: null,
        revoked_at: input.decidedAt,
      });

    return {
      revocationId: Number(inserted[0]?.id),
      replayed: false,
      invalidatedProjectionCount: Number(invalidatedProjectionCount),
    };
  });
}

/** Return active projections only after validating the server-derived tenant membership. */
export async function readActivePrivacyProjections(
  db: Knex,
  steward: AuthenticatedPrivacySteward
): Promise<ActivePrivacyProjection[]> {
  if (!validSteward(steward) || steward.role !== 'superadmin') {
    throw new PrivacyRevocationError('FORBIDDEN', 'Authenticated company membership is required');
  }
  return db.transaction(async (trx) => {
    await verifySteward(trx, steward);

    const rows = await trx(`${projectionTable} as projection`)
      .where({ 'projection.company_id': steward.companyId, 'projection.state': 'active' })
      .whereNotExists(
        trx(`${revocationTable} as revocation`)
          .select(trx.raw('1'))
          .whereRaw('?? = ??', ['revocation.company_id', 'projection.company_id'])
          .whereRaw('?? = ??', ['revocation.subject_ref_sha256', 'projection.subject_ref_sha256'])
      )
      .select(
        'projection.projection_key',
        'projection.projection_json',
        'projection.projection_digest'
      );

    return rows.map((row) => {
      let content: unknown;
      try {
        content = JSON.parse(String(row.projection_json));
      } catch {
        throw new PrivacyRevocationError(
          'INVALID_STORED_PROJECTION',
          'Stored research projection is invalid'
        );
      }
      if (
        typeof content !== 'object' ||
        content === null ||
        Array.isArray(content) ||
        typeof row.projection_digest !== 'string' ||
        !digestPattern.test(row.projection_digest)
      ) {
        throw new PrivacyRevocationError(
          'INVALID_STORED_PROJECTION',
          'Stored research projection is invalid'
        );
      }
      if (sha256(String(row.projection_json)) !== row.projection_digest) {
        throw new PrivacyRevocationError(
          'INVALID_STORED_PROJECTION',
          'Stored research projection is invalid'
        );
      }
      return {
        projectionKey: String(row.projection_key),
        content: content as Record<string, unknown>,
        digest: String(row.projection_digest),
      };
    });
  });
}
