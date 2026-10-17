import { createHash } from 'node:crypto';
import {
  validateResearchSuggestionEnvelope,
  validateResearchSuggestionEnvelopeWithResolver,
  type ResearchSuggestion,
  type ResearchSuggestionEnvelope,
  type TrustedSuggestionResolver,
} from '@moonwitness/research';
import type { Knex } from 'knex';
import { canonicalResearchJson } from './research-release.js';
import type { AuthenticatedResearchReviewer } from './research-review.js';

const suggestionIdPattern = /^mw:suggestion:[a-z0-9][a-z0-9._-]{0,179}$/u;

export interface StoreResearchSuggestionsInput {
  readonly authenticatedActor: AuthenticatedResearchReviewer;
  /** Must resolve current authoritative tenant-scoped records using this transaction. */
  readonly resolverForTransaction: (trx: Knex.Transaction) => TrustedSuggestionResolver;
  readonly envelope: unknown;
}

export interface ReadResearchSuggestionInput {
  readonly authenticatedReader: AuthenticatedResearchReviewer;
  /** Must re-resolve current authoritative sources and tenant-scoped records using this transaction. */
  readonly resolverForTransaction: (trx: Knex.Transaction) => TrustedSuggestionResolver;
  readonly suggestionId: string;
  readonly version?: number;
}

export interface StoredResearchSuggestionVersion {
  readonly suggestionId: string;
  readonly version: number;
  readonly digest: string;
  readonly visibility: 'INTERNAL';
  readonly status: 'unreviewed';
  readonly suggestion: ResearchSuggestion;
  readonly idempotent: boolean;
}

function fail(message: string): never {
  throw new TypeError(message);
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validActor(actor: AuthenticatedResearchReviewer): boolean {
  return (
    Number.isSafeInteger(actor.userId) &&
    actor.userId > 0 &&
    Number.isSafeInteger(actor.companyId) &&
    actor.companyId > 0 &&
    (actor.role === 'user' || actor.role === 'superadmin')
  );
}

async function assertActiveCompanyActor(
  trx: Knex.Transaction,
  actor: AuthenticatedResearchReviewer
): Promise<void> {
  const user = await trx('users')
    .where({ id: actor.userId, role: actor.role, active: true })
    .forUpdate()
    .first('id');
  const company = await trx('companies')
    .where({ id: actor.companyId, active: true })
    .forUpdate()
    .first('id');
  const membership = await trx('company_memberships')
    .where({ user_id: actor.userId, company_id: actor.companyId, active: true })
    .forUpdate()
    .first('id');
  if (!user || !company || !membership)
    fail('Research suggestion is unavailable in this company context');
}

async function validatedSuggestions(
  value: unknown,
  resolver: TrustedSuggestionResolver
): Promise<ResearchSuggestion[]> {
  const shape = validateResearchSuggestionEnvelope(value);
  if (!shape.valid) fail('Research suggestion envelope failed its schema check');
  let envelope: ResearchSuggestionEnvelope;
  try {
    envelope = await validateResearchSuggestionEnvelopeWithResolver(value, resolver);
  } catch {
    fail('Research suggestion citations failed trusted source and evidence validation');
  }
  const ids = envelope.suggestions.map(({ id }) => id);
  if (ids.some((id) => !suggestionIdPattern.test(id)) || new Set(ids).size !== ids.length) {
    fail('Research suggestion envelope contains invalid or duplicate IDs');
  }
  return envelope.suggestions;
}

/** Validate and store an envelope as immutable, company-scoped INTERNAL review candidates. */
export async function storeResearchSuggestions(
  db: Knex,
  input: StoreResearchSuggestionsInput
): Promise<StoredResearchSuggestionVersion[]> {
  const requestedActor = input.authenticatedActor;
  if (!validActor(requestedActor)) fail('Research suggestion storage context is invalid');
  const actor = {
    userId: requestedActor.userId,
    companyId: requestedActor.companyId,
    role: requestedActor.role,
  };
  const results: StoredResearchSuggestionVersion[] = [];
  await db.transaction(async (trx) => {
    await assertActiveCompanyActor(trx, actor);
    // Serializes version allocation without allowing model or generated text to mutate canonical graph data.
    await trx('companies').where({ id: actor.companyId }).forUpdate().first('id');
    // Resolve after authorization and under the same transaction used for insertion so a
    // transaction-aware resolver can observe canonical evidence/access changes atomically.
    const resolver = input.resolverForTransaction(trx);
    const suggestions = await validatedSuggestions(input.envelope, resolver);
    for (const suggestion of suggestions) {
      const suggestionJson = canonicalResearchJson(suggestion);
      const suggestionDigest = digest(suggestionJson);
      const existing = await trx('knowledge_research_suggestion_versions')
        .where({
          company_id: actor.companyId,
          suggestion_id: suggestion.id,
          suggestion_digest: suggestionDigest,
        })
        .orderBy('version', 'asc')
        .first('version', 'suggestion_json');
      if (existing) {
        if (
          String(existing.suggestion_json) !== suggestionJson ||
          digest(String(existing.suggestion_json)) !== suggestionDigest
        ) {
          fail('Existing research suggestion version failed integrity verification');
        }
        results.push({
          suggestionId: suggestion.id,
          version: Number(existing.version),
          digest: suggestionDigest,
          visibility: 'INTERNAL',
          status: 'unreviewed',
          suggestion,
          idempotent: true,
        });
        continue;
      }
      const latest = await trx('knowledge_research_suggestion_versions')
        .where({ company_id: actor.companyId, suggestion_id: suggestion.id })
        .max({ version: 'version' })
        .first();
      const version = Number(latest?.version ?? 0) + 1;
      await trx('knowledge_research_suggestion_versions').insert({
        company_id: actor.companyId,
        suggestion_id: suggestion.id,
        version,
        visibility: 'INTERNAL',
        status: 'unreviewed',
        suggestion_json: suggestionJson,
        suggestion_digest: suggestionDigest,
        recorded_by_id: actor.userId,
      });
      results.push({
        suggestionId: suggestion.id,
        version,
        digest: suggestionDigest,
        visibility: 'INTERNAL',
        status: 'unreviewed',
        suggestion,
        idempotent: false,
      });
    }
  });
  return results;
}

/** Read one tenant-scoped immutable suggestion and verify its digest and review ceiling. */
export async function readResearchSuggestionVersion(
  db: Knex,
  input: ReadResearchSuggestionInput
): Promise<StoredResearchSuggestionVersion | null> {
  const requestedActor = input.authenticatedReader;
  const actor = {
    userId: requestedActor.userId,
    companyId: requestedActor.companyId,
    role: requestedActor.role,
  };
  const suggestionId = input.suggestionId;
  const version = input.version;
  if (
    !validActor(actor) ||
    !suggestionIdPattern.test(suggestionId) ||
    (version !== undefined && (!Number.isSafeInteger(version) || version < 1))
  ) {
    fail('Research suggestion read context is invalid');
  }
  return db.transaction(async (trx) => {
    await assertActiveCompanyActor(trx, actor);
    const query = trx('knowledge_research_suggestion_versions').where({
      company_id: actor.companyId,
      suggestion_id: suggestionId,
    });
    if (version !== undefined) query.andWhere({ version });
    const row = await query.orderBy('version', 'desc').first();
    if (!row) return null;
    if (row.visibility !== 'INTERNAL' || row.status !== 'unreviewed') {
      fail('Stored research suggestion exceeded its INTERNAL unreviewed ceiling');
    }
    const suggestionJson = String(row.suggestion_json);
    const suggestionDigest = digest(suggestionJson);
    if (suggestionDigest !== row.suggestion_digest)
      fail('Stored research suggestion failed integrity verification');
    let value: unknown;
    try {
      value = JSON.parse(suggestionJson) as unknown;
    } catch {
      fail('Stored research suggestion is malformed');
    }
    const shape = validateResearchSuggestionEnvelope({
      format: 'mw-local-ai-suggestion-envelope/v1',
      suggestions: [value],
    });
    const suggestion = value as ResearchSuggestion;
    if (
      canonicalResearchJson(value) !== suggestionJson ||
      !shape.valid ||
      suggestion.id !== row.suggestion_id ||
      suggestion.visibility !== 'INTERNAL' ||
      suggestion.status !== 'unreviewed'
    ) {
      fail('Stored research suggestion failed canonical projection verification');
    }
    const resolver = input.resolverForTransaction(trx);
    const [validatedSuggestion] = await validatedSuggestions(
      { format: 'mw-local-ai-suggestion-envelope/v1', suggestions: [suggestion] },
      resolver
    );
    if (!validatedSuggestion || validatedSuggestion.id !== row.suggestion_id) {
      fail('Stored research suggestion failed trusted source and evidence revalidation');
    }
    return {
      suggestionId: String(row.suggestion_id),
      version: Number(row.version),
      digest: suggestionDigest,
      visibility: 'INTERNAL',
      status: 'unreviewed',
      suggestion: validatedSuggestion,
      idempotent: false,
    };
  });
}
