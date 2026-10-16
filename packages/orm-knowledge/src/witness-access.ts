import type { Knex } from 'knex';

export interface AuthenticatedWitnessSteward {
  userId: number;
  companyId: number;
  role: string;
}

type WitnessTimePrecision = 'instant' | 'day' | 'month' | 'year' | 'unknown';
type WitnessVisibility = 'RESTRICTED' | 'INTERNAL' | 'PUBLIC';
type WitnessEpistemicStatus = 'hypothesis' | 'supported' | 'contested' | 'rejected';

interface WitnessTestimonyRow {
  active: boolean;
  id: number;
  external_key: string;
  original_text: string;
  source_label: string;
  source_locator: string;
  source_digest: string;
  received_time_text: string;
  received_time_precision: WitnessTimePrecision;
  uncertainty_note: string | null;
  visibility: WitnessVisibility;
  company_id: number | null;
  created_by_id: number;
  synthetic: boolean;
}

interface WitnessCorrectionRow {
  active: boolean;
  testimony_id: number;
  synthetic: boolean;
  sequence: number;
  correction_text: string;
  reason: string;
  source_label: string;
  source_locator: string;
  source_digest: string;
  asserted_time_text: string;
  asserted_time_precision: WitnessTimePrecision;
  uncertainty_note: string | null;
}

interface WitnessInterpretationRow {
  active: boolean;
  id: number;
  testimony_id: number;
  synthetic: boolean;
  assertion_ref: string;
  evidence_ref: string;
  interpretation_text: string;
  method_label: string;
  method_version: string;
  epistemic_status: WitnessEpistemicStatus;
  visibility: WitnessVisibility;
}

export interface ScopedSyntheticWitness {
  id: number;
  externalKey: string;
  originalText: string;
  sourceLabel: string;
  sourceLocator: string;
  sourceDigest: string;
  receivedTimeText: string;
  receivedTimePrecision: WitnessTimePrecision;
  uncertaintyNote: string | null;
  corrections: Array<{
    sequence: number;
    correctionText: string;
    reason: string;
    sourceLabel: string;
    sourceLocator: string;
    sourceDigest: string;
    assertedTimeText: string;
    assertedTimePrecision: WitnessTimePrecision;
    uncertaintyNote: string | null;
  }>;
  interpretations: Array<{
    assertionRef: string;
    evidenceRef: string;
    interpretationText: string;
    methodLabel: string;
    methodVersion: string;
    epistemicStatus: WitnessEpistemicStatus;
    visibility: WitnessVisibility;
  }>;
}

export type WitnessAccessErrorCode = 'FORBIDDEN' | 'NOT_FOUND';

export class WitnessAccessError extends Error {
  constructor(readonly code: WitnessAccessErrorCode) {
    super(code === 'FORBIDDEN' ? 'Witness access denied' : 'Witness record not found');
    this.name = 'WitnessAccessError';
  }
}

async function verifyWitnessSteward(db: Knex, steward: AuthenticatedWitnessSteward): Promise<void> {
  if (
    steward.role !== 'superadmin' ||
    !Number.isSafeInteger(steward.userId) ||
    steward.userId < 1 ||
    !Number.isSafeInteger(steward.companyId) ||
    steward.companyId < 1
  ) {
    throw new WitnessAccessError('FORBIDDEN');
  }

  const [user, companyMembership, witnessGroupMembership] = await Promise.all([
    db('users').where({ id: steward.userId, role: 'superadmin', active: true }).first('id'),
    db('company_memberships as membership')
      .join('companies as company', 'company.id', 'membership.company_id')
      .where({
        'membership.user_id': steward.userId,
        'membership.company_id': steward.companyId,
        'membership.active': true,
        'company.active': true,
      })
      .first('membership.id'),
    db('group_memberships as membership')
      .join('access_groups as access_group', 'access_group.id', 'membership.group_id')
      .where({
        'membership.user_id': steward.userId,
        'membership.active': true,
        'access_group.code': 'knowledge_witness_steward',
        'access_group.active': true,
      })
      .first('membership.id'),
  ]);

  if (!user || !companyMembership || !witnessGroupMembership) {
    throw new WitnessAccessError('FORBIDDEN');
  }
}

/** Read one active owner- and tenant-scoped synthetic witness; no list/search or write path exists. */
export async function readOwnedSyntheticWitness(
  db: Knex,
  steward: AuthenticatedWitnessSteward,
  testimonyId: number
): Promise<ScopedSyntheticWitness> {
  await verifyWitnessSteward(db, steward);
  if (!Number.isSafeInteger(testimonyId) || testimonyId < 1) {
    throw new WitnessAccessError('NOT_FOUND');
  }

  const testimony = await db<WitnessTestimonyRow>('knowledge_witness_testimonies')
    .where({
      id: testimonyId,
      active: true,
      company_id: steward.companyId,
      created_by_id: steward.userId,
      synthetic: true,
      visibility: 'RESTRICTED',
    })
    .first(
      'id',
      'external_key',
      'original_text',
      'source_label',
      'source_locator',
      'source_digest',
      'received_time_text',
      'received_time_precision',
      'uncertainty_note',
      'visibility',
      'company_id',
      'created_by_id',
      'synthetic'
    );
  if (!testimony) throw new WitnessAccessError('NOT_FOUND');

  const [corrections, interpretations] = await Promise.all([
    db<WitnessCorrectionRow>('knowledge_witness_corrections')
      .where({ testimony_id: testimony.id, synthetic: true, active: true })
      .orderBy('sequence', 'asc')
      .select(
        'sequence',
        'correction_text',
        'reason',
        'source_label',
        'source_locator',
        'source_digest',
        'asserted_time_text',
        'asserted_time_precision',
        'uncertainty_note'
      ),
    db<WitnessInterpretationRow>('knowledge_witness_interpretations')
      .where({
        testimony_id: testimony.id,
        synthetic: true,
        active: true,
        visibility: 'RESTRICTED',
      })
      .orderBy('id', 'asc')
      .select(
        'assertion_ref',
        'evidence_ref',
        'interpretation_text',
        'method_label',
        'method_version',
        'epistemic_status',
        'visibility'
      ),
  ]);

  return {
    id: testimony.id,
    externalKey: testimony.external_key,
    originalText: testimony.original_text,
    sourceLabel: testimony.source_label,
    sourceLocator: testimony.source_locator,
    sourceDigest: testimony.source_digest,
    receivedTimeText: testimony.received_time_text,
    receivedTimePrecision: testimony.received_time_precision,
    uncertaintyNote: testimony.uncertainty_note,
    corrections: corrections.map((correction) => ({
      sequence: correction.sequence,
      correctionText: correction.correction_text,
      reason: correction.reason,
      sourceLabel: correction.source_label,
      sourceLocator: correction.source_locator,
      sourceDigest: correction.source_digest,
      assertedTimeText: correction.asserted_time_text,
      assertedTimePrecision: correction.asserted_time_precision,
      uncertaintyNote: correction.uncertainty_note,
    })),
    interpretations: interpretations.map((interpretation) => ({
      assertionRef: interpretation.assertion_ref,
      evidenceRef: interpretation.evidence_ref,
      interpretationText: interpretation.interpretation_text,
      methodLabel: interpretation.method_label,
      methodVersion: interpretation.method_version,
      epistemicStatus: interpretation.epistemic_status,
      visibility: interpretation.visibility,
    })),
  };
}
