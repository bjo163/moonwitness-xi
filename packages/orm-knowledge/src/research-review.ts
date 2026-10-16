import { createHash } from 'node:crypto';
import { readQuranPassageSnapshot, readTextualWitnessPassage } from '@moonwitness/corpus';
import {
  appendResearchReviewEvent,
  resolveResearchEvidenceReference,
  validateResearchAssertion,
  validateResearchEvidenceReference,
  validateResearchGraph,
  validateResearchRelation,
  validateResearchReviewEvent,
  type ResearchEvidenceReference,
  type ResearchGraphNode,
  type ResearchRelation,
  type ResearchReviewEvent,
  type ResearchReviewSubject,
  type ResearchVisibility,
  type ResolvablePassage,
} from '@moonwitness/research';
import {
  transitionWorkflow,
  WorkflowError,
  type TransitionWorkflowInput,
  type WorkflowEventPayload,
  type WorkflowRole,
} from '@moonwitness/orm-workflow';
import type { Knex } from 'knex';
import {
  canonicalResearchJson,
  readResearchGraphRelease,
  type StoredResearchGraphRecord,
} from './research-release.js';

const corpusKey = 'research';
const graphRecordModel = 'knowledge.research_graph_record';
const userCanonicalIdPattern = /^mw:user:[a-z0-9][a-z0-9._-]{0,179}$/u;
const visibilityOrder: Record<ResearchVisibility, number> = {
  PUBLIC_APPROVED: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
  CHILD_SENSITIVE: 4,
};

export interface AuthenticatedResearchReviewer {
  /** Values populated by server authentication and authorization middleware. */
  readonly userId: number;
  readonly companyId: number;
  readonly role: 'user' | 'superadmin';
}

export interface TransitionResearchReviewInput {
  readonly instanceId: number;
  readonly authenticatedReviewer: AuthenticatedResearchReviewer;
  readonly action: 'approve' | 'reject';
  readonly expectedWorkflowRevision: number;
  readonly subjectId: string;
  readonly expectedSubjectRevision: number;
  readonly evidenceIds: readonly string[];
  readonly idempotencyKey: string;
  /** Trusted local root for pinned corpus bytes; no network access is performed. */
  readonly corpusRootDirectory: string;
  readonly now?: Date;
}

function fail(code: ConstructorParameters<typeof WorkflowError>[0], message: string): never {
  throw new WorkflowError(code, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getVisibility(value: unknown): ResearchVisibility {
  if (
    value === 'PUBLIC_APPROVED' ||
    value === 'INTERNAL' ||
    value === 'CONFIDENTIAL' ||
    value === 'RESTRICTED' ||
    value === 'CHILD_SENSITIVE'
  ) {
    return value;
  }
  return fail('INVALID_EVENT_PAYLOAD', 'Research record visibility is invalid');
}

function maxVisibility(left: ResearchVisibility, right: ResearchVisibility): ResearchVisibility {
  return visibilityOrder[left] >= visibilityOrder[right] ? left : right;
}

/** Generic PUBLIC storage is deliberately only an INTERNAL floor, never publication approval. */
function storageVisibilityFloor(
  value: StoredResearchGraphRecord['visibility']
): ResearchVisibility {
  return value === 'RESTRICTED' ? 'RESTRICTED' : 'INTERNAL';
}

function reviewVisibility(record: StoredResearchGraphRecord, content: Record<string, unknown>) {
  return maxVisibility(
    storageVisibilityFloor(record.visibility),
    getVisibility(content.visibility)
  );
}

function assertObject(value: unknown, message: string): Record<string, unknown> {
  if (!isObject(value)) return fail('INVALID_EVENT_PAYLOAD', message);
  return value;
}

function canonicalId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^mw:[a-z]+(?:-[a-z]+)*:[a-z0-9][a-z0-9._-]{0,179}(?::[a-z0-9][a-z0-9._-]{0,179})*$/u.test(
      value
    )
  );
}

function evidenceReference(record: StoredResearchGraphRecord): ResearchEvidenceReference {
  const content = assertObject(record.content, 'Research evidence record is invalid');
  const candidate = {
    id: content.id,
    assertion_id: content.assertion_id,
    direction: content.direction,
    selector: content.selector,
  };
  const validation = validateResearchEvidenceReference(candidate);
  if (
    record.kind !== 'evidence' ||
    content.kind !== 'Evidence' ||
    content.id !== record.key ||
    !validation.valid
  ) {
    return fail('INVALID_EVENT_PAYLOAD', 'Research evidence record failed its schema check');
  }
  return candidate as ResearchEvidenceReference;
}

async function resolveEvidence(reference: ResearchEvidenceReference, rootDirectory: string) {
  const selector = reference.selector;
  let passage: ResolvablePassage;
  if ('expression_id' in selector) {
    const local = await readTextualWitnessPassage({
      rootDirectory,
      expressionId: selector.expression_id,
      editionId: selector.edition_id,
      locator: selector.locator,
    });
    passage = {
      source_id: local.sourceId,
      expression_id: local.expressionId,
      edition_id: local.editionId,
      locator: local.locator,
      text: local.text,
      content_sha256: local.sha256,
      citation: `${local.expressionId} ${local.editionId} ${local.locator}`,
    };
  } else {
    const local = await readQuranPassageSnapshot({
      rootDirectory,
      editionId: selector.edition_id,
      locator: selector.locator,
      use: 'read_analyze',
    });
    const sourceId = local.sourceId;
    if (sourceId !== selector.source_id) {
      return fail(
        'INVALID_EVENT_PAYLOAD',
        'Quran evidence source identity does not match its local manifest'
      );
    }
    passage = {
      source_id: sourceId,
      edition_id: local.passage.editionId,
      locator: local.passage.locator,
      text: local.passage.text,
      content_sha256: local.passage.sha256,
      citation: `${local.passage.editionId} ${local.passage.locator}`,
    };
  }
  return passage;
}

async function verifiedActiveResearchRecords(trx: Knex.Transaction, resourceRecordId: number) {
  const active = await trx('knowledge_research_active_releases')
    .where({ corpus_key: corpusKey })
    .forUpdate()
    .first('release_id');
  if (!active) return fail('INVALID_EVENT_PAYLOAD', 'No active research release is selected');
  const releaseRow = await trx('knowledge_research_graph_releases')
    .where({ id: active.release_id })
    .first('release_digest');
  if (!releaseRow) return fail('INVALID_EVENT_PAYLOAD', 'Active research release is unavailable');
  const release = await readResearchGraphRelease(trx, String(releaseRow.release_digest));
  if (
    !release ||
    release.corpusKey !== corpusKey ||
    release.schemaVersion !== 'research-graph/v1'
  ) {
    return fail('INVALID_EVENT_PAYLOAD', 'Active research release is invalid or unsupported');
  }
  const resource = await trx('knowledge_research_graph_records')
    .where({ id: resourceRecordId, release_id: active.release_id })
    .first('record_key', 'record_kind', 'content_digest');
  if (!resource)
    return fail('INVALID_EVENT_PAYLOAD', 'Workflow resource is not in the active release');
  const record = release.records.find((candidate) => candidate.key === resource.record_key);
  if (
    !record ||
    record.kind !== resource.record_kind ||
    record.contentDigest !== resource.content_digest
  ) {
    return fail('INVALID_EVENT_PAYLOAD', 'Workflow resource does not match the verified release');
  }
  return { release, records: release.records, record };
}

async function verifiedActorIds(
  trx: Knex.Transaction,
  actorId: number,
  requesterId: number,
  companyId: number,
  role: AuthenticatedResearchReviewer['role']
) {
  const actor = await trx('users').where({ id: actorId }).first('id', 'role');
  if (!actor || actor.role !== role)
    fail('FORBIDDEN', 'Authenticated reviewer identity is invalid');
  const membership = await trx('company_memberships')
    .where({ user_id: actorId, company_id: companyId })
    .first('id');
  if (!membership) fail('FORBIDDEN', 'Reviewer is not authorized for this company');
  const identities = await trx('knowledge_research_actor_identities')
    .whereIn('user_id', [...new Set([actorId, requesterId])])
    .select('user_id', 'canonical_user_id');
  const byUser = new Map<number, string>(
    identities.map((row) => [Number(row.user_id), String(row.canonical_user_id)])
  );
  const reviewer = byUser.get(actorId);
  const requester = byUser.get(requesterId);
  if (
    !reviewer ||
    !requester ||
    !userCanonicalIdPattern.test(reviewer) ||
    !userCanonicalIdPattern.test(requester)
  ) {
    fail(
      'INVALID_EVENT_PAYLOAD',
      'Reviewer or requester has no approved canonical identity mapping'
    );
  }
  return { reviewer, requester };
}

async function verifiedReviewHistory(trx: Knex.Transaction, subjectId: string) {
  const rows = await trx('knowledge_research_review_events')
    .where({ subject_id: subjectId })
    .orderBy('workflow_instance_id', 'asc')
    .orderBy('workflow_event_sequence', 'asc');
  return rows.map((row) => {
    const eventJson = String(row.event_json);
    const actualDigest = createHash('sha256').update(eventJson, 'utf8').digest('hex');
    if (actualDigest !== row.event_digest) {
      return fail(
        'INVALID_EVENT_PAYLOAD',
        'Stored research review history failed integrity verification'
      );
    }
    let event: unknown;
    try {
      event = JSON.parse(eventJson) as unknown;
    } catch {
      return fail('INVALID_EVENT_PAYLOAD', 'Stored research review history is malformed');
    }
    if (canonicalResearchJson(event) !== eventJson || !validateResearchReviewEvent(event).valid) {
      return fail(
        'INVALID_EVENT_PAYLOAD',
        'Stored research review history failed schema verification'
      );
    }
    return event as ResearchReviewEvent;
  });
}

export function validateResearchRelease(records: readonly StoredResearchGraphRecord[]) {
  const nodes: ResearchGraphNode[] = [];
  const relations: ResearchRelation[] = [];
  const evidence = new Map<string, ResearchEvidenceReference>();
  const contentById = new Map<string, Record<string, unknown>>();

  for (const record of records) {
    const content = assertObject(record.content, 'Research graph record content is invalid');
    if (content.id !== record.key || !canonicalId(record.key)) {
      fail('INVALID_EVENT_PAYLOAD', 'Research graph record key does not match its canonical id');
    }
    const visibility = reviewVisibility(record, content);
    const projected = { ...content, visibility };
    if (record.kind === 'relation') {
      if (content.kind !== 'ResearchRelation' || !validateResearchRelation(projected).valid) {
        fail('INVALID_EVENT_PAYLOAD', 'Research relation failed its schema check');
      }
      relations.push(projected as unknown as ResearchRelation);
      contentById.set(record.key, projected);
    } else {
      if (record.kind === 'assertion') {
        if (content.kind !== 'Assertion' || !validateResearchAssertion(projected).valid) {
          fail('INVALID_EVENT_PAYLOAD', 'Research assertion failed its schema check');
        }
      } else if (record.kind === 'evidence') {
        evidence.set(record.key, evidenceReference(record));
        if (content.kind !== 'Evidence')
          fail('INVALID_EVENT_PAYLOAD', 'Research evidence kind is invalid');
      } else if (
        (record.kind === 'source' && content.kind !== 'Artifact') ||
        (record.kind === 'expression' &&
          !['Expression', 'Edition', 'Passage', 'Content'].includes(String(content.kind))) ||
        !['node', 'source', 'expression', 'assertion', 'evidence'].includes(record.kind)
      ) {
        fail('INVALID_EVENT_PAYLOAD', 'Research graph node kind does not match its record kind');
      }
      const node = {
        id: String(content.id),
        kind: content.kind,
        visibility,
        ...(content.identity_class === undefined ? {} : { identity_class: content.identity_class }),
      };
      nodes.push(node as ResearchGraphNode);
      contentById.set(record.key, projected);
    }
  }

  const graphValidation = validateResearchGraph({ nodes, relations });
  if (!graphValidation.valid) {
    fail('INVALID_EVENT_PAYLOAD', 'Active research release failed full graph validation');
  }
  const graphNodeIds = new Set(nodes.map((node) => node.id));
  for (const reference of evidence.values()) {
    if (
      !graphNodeIds.has(reference.selector.source_id) ||
      !graphNodeIds.has(reference.selector.edition_id) ||
      ('expression_id' in reference.selector && !graphNodeIds.has(reference.selector.expression_id))
    ) {
      fail(
        'INVALID_EVENT_PAYLOAD',
        'Evidence source and edition identities must exist in the active graph'
      );
    }
  }
  return { nodes, relations, evidence, contentById };
}

async function persistResearchReview(
  trx: Knex.Transaction,
  event: ResearchReviewEvent
): Promise<void> {
  const eventJson = canonicalResearchJson(event);
  const eventDigest = createHash('sha256').update(eventJson, 'utf8').digest('hex');
  await trx('knowledge_research_review_events').insert({
    event_id: event.id,
    workflow_instance_id: event.workflow_instance_id,
    workflow_event_sequence: event.workflow_event_sequence,
    subject_id: event.subject_id,
    subject_revision: event.subject_revision,
    research_release_digest: event.research_release_digest,
    idempotency_key: event.idempotency_key,
    event_json: eventJson,
    event_digest: eventDigest,
  });
}

/**
 * Persist a validated decision in the same PostgreSQL transaction as its locked
 * workflow transition. This service accepts only server-authenticated identity;
 * it does not expose HTTP or generic ORM CRUD routes.
 */
export async function transitionResearchReview(db: Knex, input: TransitionResearchReviewInput) {
  if (
    !Number.isSafeInteger(input.authenticatedReviewer.userId) ||
    input.authenticatedReviewer.userId < 1 ||
    !Number.isSafeInteger(input.authenticatedReviewer.companyId) ||
    input.authenticatedReviewer.companyId < 1 ||
    !Number.isSafeInteger(input.instanceId) ||
    input.instanceId < 1 ||
    !Number.isSafeInteger(input.expectedWorkflowRevision) ||
    input.expectedWorkflowRevision < 0 ||
    !Number.isSafeInteger(input.expectedSubjectRevision) ||
    input.expectedSubjectRevision < 1 ||
    !canonicalId(input.subjectId) ||
    !Array.isArray(input.evidenceIds) ||
    input.evidenceIds.length === 0 ||
    new Set(input.evidenceIds).size !== input.evidenceIds.length ||
    input.evidenceIds.some((id) => !canonicalId(id)) ||
    input.evidenceIds.some((id) => !id.startsWith('mw:evidence:'))
  ) {
    throw new WorkflowError('INVALID_EVENT_PAYLOAD', 'Research review request is invalid');
  }
  const evidenceIds = [...input.evidenceIds].sort();
  const intent = {
    subjectId: input.subjectId,
    expectedSubjectRevision: input.expectedSubjectRevision,
    evidenceIds,
  };
  const reviewer = input.authenticatedReviewer;
  const role: WorkflowRole = reviewer.role;
  const transition: TransitionWorkflowInput = {
    instanceId: input.instanceId,
    companyId: reviewer.companyId,
    actorId: reviewer.userId,
    role,
    action: input.action,
    expectedRevision: input.expectedWorkflowRevision,
    idempotencyKey: input.idempotencyKey,
    payload: intent,
    ...(input.now ? { now: input.now } : {}),
    preparePayload: async (context) => {
      if (context.instance.resource_model !== graphRecordModel) {
        fail('INVALID_EVENT_PAYLOAD', 'Workflow is not bound to a canonical research graph record');
      }
      if (context.actorId !== reviewer.userId || context.role !== reviewer.role) {
        fail('FORBIDDEN', 'Authenticated reviewer context changed during transition');
      }
      const { reviewer: reviewerCanonicalId, requester: requesterCanonicalId } =
        await verifiedActorIds(
          context.trx,
          context.actorId,
          context.instance.started_by_id,
          context.instance.company_id,
          reviewer.role
        );
      const { release, records, record } = await verifiedActiveResearchRecords(
        context.trx,
        context.instance.resource_id
      );
      if (record.key !== input.subjectId || !['assertion', 'relation'].includes(record.kind)) {
        fail(
          'INVALID_EVENT_PAYLOAD',
          'Workflow resource does not match the requested review subject'
        );
      }
      const graph = validateResearchRelease(records);
      const subjectContent = graph.contentById.get(input.subjectId);
      if (!subjectContent) fail('INVALID_EVENT_PAYLOAD', 'Review subject is unavailable');
      const subject = subjectContent as unknown as ResearchReviewSubject;
      if (subject.content_revision !== input.expectedSubjectRevision) {
        fail('STALE_REVISION', 'Research subject changed; reload before retrying');
      }

      const recordById = new Map(records.map((item) => [item.key, item]));
      const evidenceVisibility = new Map<string, ResearchVisibility>();
      for (const evidenceId of evidenceIds) {
        const evidenceRecord = recordById.get(evidenceId);
        const reference = graph.evidence.get(evidenceId);
        if (!evidenceRecord || !reference) {
          fail('INVALID_EVENT_PAYLOAD', 'Review evidence does not resolve in the active release');
        }
        const content = assertObject(evidenceRecord.content, 'Research evidence record is invalid');
        if (
          subject.kind === 'Assertion'
            ? reference.assertion_id !== subject.id
            : ![...subject.supporting_evidence_ids, ...subject.counterevidence_ids].includes(
                evidenceId
              )
        ) {
          fail('INVALID_EVENT_PAYLOAD', 'Evidence is not bound to the requested research subject');
        }
        await resolveResearchEvidenceReference(reference, (editionId, locator) => {
          if (
            reference.selector.edition_id !== editionId ||
            reference.selector.locator !== locator
          ) {
            return Promise.resolve(null);
          }
          return resolveEvidence(reference, input.corpusRootDirectory);
        }).catch(() =>
          fail('INVALID_EVENT_PAYLOAD', 'Review evidence does not match an authorized local source')
        );
        evidenceVisibility.set(evidenceId, reviewVisibility(evidenceRecord, content));
      }
      const currentVisibility = reviewVisibility(
        record,
        assertObject(record.content, 'Review subject is invalid')
      );
      const authorizedSubject = {
        ...subject,
        visibility: currentVisibility,
      } as ResearchReviewSubject;
      const history = await verifiedReviewHistory(context.trx, subject.id);
      const result = appendResearchReviewEvent(authorizedSubject, history, {
        authenticatedActorId: reviewerCanonicalId,
        authenticatedRole: reviewer.role,
        requesterId: requesterCanonicalId,
        expectedSubjectRevision: input.expectedSubjectRevision,
        researchReleaseDigest: release.releaseDigest,
        workflowInstanceId: context.instance.id,
        workflowEventSequence: context.sequence,
        workflowRevision: context.revision,
        outcome: input.action === 'approve' ? 'accepted' : 'rejected',
        evidenceIds,
        evidenceVisibility,
        idempotencyKey: context.idempotencyKey,
        now: new Date(context.eventTime),
      });
      if (result.status === 'invalid') {
        fail('INVALID_EVENT_PAYLOAD', 'Research review decision failed its validation contract');
      }
      if (result.status === 'replayed') {
        fail('IDEMPOTENCY_CONFLICT', 'Review event exists without a matching workflow event');
      }
      if (
        (input.action === 'approve' && context.toState !== 'approved') ||
        (input.action === 'reject' && context.toState !== 'rejected')
      ) {
        // Multi-approval workflows record intermediate votes in the workflow log;
        // the decision projection is written only when the transition is terminal.
        return null;
      }
      await persistResearchReview(context.trx, result.event);
      return JSON.parse(canonicalResearchJson(result.event)) as WorkflowEventPayload;
    },
  };
  return transitionWorkflow(db, transition);
}
