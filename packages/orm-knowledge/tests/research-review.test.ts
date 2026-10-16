import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { readQuranPassage } from '@moonwitness/corpus';
import { jobsManifest } from '@moonwitness/jobs';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';
import { manifest as workflowManifest, startWorkflow } from '@moonwitness/orm-workflow';
import {
  activateResearchGraphRelease,
  createResearchGraphRelease,
  manifest as knowledgeManifest,
  ResearchGraphRecord,
  transitionResearchReview,
} from '../src/index.js';

const corpusRootDirectory = path.resolve(process.cwd(), '../..');
const corpusKey = 'research';
const assertionId = 'mw:assertion:review-test-001';
const evidenceId = 'mw:evidence:review-test-quran-001';
const quranSourceId = 'mw:source:tanzil-quran-text';
const quranEditionId = 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2';
const reviewScopeId = 'mw:concept:review-test-scope';
const relationId = 'mw:relation:review-test-001';
const leftEntityId = 'mw:entity:review-fixture-left';
const rightEntityId = 'mw:entity:review-fixture-right';
const reviewWorkflowConfig = {
  startState: 'submitted',
  startRoles: ['system', 'superadmin'],
  timeoutMinutes: 1440,
  resourceModels: [ResearchGraphRecord.modelName, 'base.partner'],
  transitions: [
    {
      action: 'approve',
      from: 'submitted',
      to: 'approved',
      roles: ['user', 'superadmin'],
      requireDifferentActor: true,
    },
    {
      action: 'reject',
      from: 'submitted',
      to: 'rejected',
      roles: ['user', 'superadmin'],
      requireDifferentActor: true,
    },
  ],
};

let db: Knex;
let releaseDigest: string;
let activeRecordId: number;
let activeRelationRecordId: number;
let systemId: number;
let superadminId: number;
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
  await installAddons(db, [
    baseManifest,
    jobsManifest,
    notificationManifest,
    workflowManifest,
    knowledgeManifest,
  ]);
  systemId = Number((await db('users').where({ login: 'system' }).first('id'))?.id);
  superadminId = Number((await db('users').where({ login: 'superadmin' }).first('id'))?.id);
  companyId = Number((await db('companies').first('id'))?.id);
  await db('company_memberships')
    .insert({ user_id: superadminId, company_id: companyId, is_default: true })
    .onConflict(['user_id', 'company_id'])
    .ignore();
  await db('knowledge_research_actor_identities').insert([
    { user_id: systemId, canonical_user_id: 'mw:user:synthetic-requester' },
    { user_id: superadminId, canonical_user_id: 'mw:user:synthetic-reviewer' },
  ]);
  const quran = await readQuranPassage({
    rootDirectory: corpusRootDirectory,
    editionId: quranEditionId,
    locator: 'Q7:46',
    use: 'read_analyze',
  });
  const input = {
    corpusKey,
    schemaVersion: 'research-graph/v1',
    records: [
      {
        key: quranSourceId,
        kind: 'source' as const,
        visibility: 'PUBLIC' as const,
        content: { id: quranSourceId, kind: 'Artifact', visibility: 'PUBLIC_APPROVED' },
      },
      {
        key: quranEditionId,
        kind: 'expression' as const,
        visibility: 'PUBLIC' as const,
        content: { id: quranEditionId, kind: 'Edition', visibility: 'PUBLIC_APPROVED' },
      },
      {
        key: reviewScopeId,
        kind: 'node' as const,
        visibility: 'INTERNAL' as const,
        content: {
          id: reviewScopeId,
          kind: 'Concept',
          identity_class: 'ConceptIdentity',
          visibility: 'INTERNAL',
        },
      },
      {
        key: leftEntityId,
        kind: 'node' as const,
        visibility: 'INTERNAL' as const,
        content: {
          id: leftEntityId,
          kind: 'Entity',
          identity_class: 'Entity',
          visibility: 'INTERNAL',
        },
      },
      {
        key: rightEntityId,
        kind: 'node' as const,
        visibility: 'INTERNAL' as const,
        content: {
          id: rightEntityId,
          kind: 'Entity',
          identity_class: 'Entity',
          visibility: 'INTERNAL',
        },
      },
      {
        key: assertionId,
        kind: 'assertion' as const,
        visibility: 'PUBLIC' as const,
        content: {
          id: assertionId,
          kind: 'Assertion',
          schema_version: 1,
          lifecycle: 'candidate',
          created_at: '2026-10-16T00:00:00.000Z',
          updated_at: '2026-10-16T00:00:00.000Z',
          origin_ref: 'fixture://research/review/001',
          visibility: 'PUBLIC_APPROVED',
          content_revision: 1,
          claim: 'Synthetic review contract fixture.',
          polarity: 'positive',
          scope: { kind: 'research_context', reference_id: reviewScopeId },
          context: { mode: 'analysis', reference_id: reviewScopeId },
          epistemic_status: 'hypothesized',
          review_status: 'pending',
        },
      },
      {
        key: evidenceId,
        kind: 'evidence' as const,
        visibility: 'INTERNAL' as const,
        content: {
          id: evidenceId,
          kind: 'Evidence',
          visibility: 'INTERNAL',
          assertion_id: assertionId,
          direction: 'supporting',
          selector: {
            source_id: quranSourceId,
            edition_id: quranEditionId,
            locator: 'Q7:46',
            content_sha256: quran.sha256,
          },
        },
      },
      {
        key: relationId,
        kind: 'relation' as const,
        visibility: 'INTERNAL' as const,
        content: {
          id: relationId,
          kind: 'ResearchRelation',
          schema_version: 1,
          lifecycle: 'candidate',
          created_at: '2026-10-16T00:00:00.000Z',
          updated_at: '2026-10-16T00:00:00.000Z',
          origin_ref: 'fixture://research/review/relation-001',
          content_revision: 1,
          visibility: 'INTERNAL',
          predicate: 'related_to',
          subject_id: leftEntityId,
          object_id: rightEntityId,
          scope: { kind: 'research_context', reference_id: reviewScopeId },
          supporting_evidence_ids: [evidenceId],
          counterevidence_ids: [],
          alternative_relation_ids: [],
          epistemic_status: 'unreviewed',
          review_status: 'pending',
        },
      },
    ],
  };
  const release = await db.transaction((trx) => createResearchGraphRelease(trx, input));
  releaseDigest = release.releaseDigest;
  await db.transaction((trx) =>
    activateResearchGraphRelease(trx, {
      corpusKey,
      releaseDigest,
      expectedCurrentReleaseDigest: null,
      activatedAt: '2026-10-16T00:00:01.000Z',
    })
  );
  activeRecordId = Number(
    (
      await db('knowledge_research_graph_records')
        .where({
          release_id: (await db('knowledge_research_active_releases').first('release_id'))
            .release_id,
        })
        .where({ record_key: assertionId })
        .first('id')
    )?.id
  );
  activeRelationRecordId = Number(
    (
      await db('knowledge_research_graph_records')
        .where({
          release_id: (await db('knowledge_research_active_releases').first('release_id'))
            .release_id,
        })
        .where({ record_key: relationId })
        .first('id')
    )?.id
  );
  await db('workflow_definitions').insert({
    code: 'research.review',
    version: 1,
    name: 'Synthetic research review',
    config: JSON.stringify(reviewWorkflowConfig),
    enabled: true,
  });
});

afterEach(async () => db.destroy());

async function startReviewWorkflow(
  resourceModel = ResearchGraphRecord.modelName,
  resourceId = activeRecordId
) {
  return startWorkflow(db, {
    code: 'research.review',
    companyId,
    actorId: systemId,
    role: 'system',
    resourceModel,
    resourceId,
    idempotencyKey: `research-review-start-${resourceId}-001`,
    now: new Date('2026-10-16T00:01:00.000Z'),
  });
}

function reviewInput(
  instanceId: number,
  overrides: Partial<Parameters<typeof transitionResearchReview>[1]> = {}
) {
  return {
    instanceId,
    authenticatedReviewer: { userId: superadminId, companyId, role: 'superadmin' as const },
    action: 'approve' as const,
    expectedWorkflowRevision: 0,
    subjectId: assertionId,
    expectedSubjectRevision: 1,
    evidenceIds: [evidenceId],
    idempotencyKey: `research-review-action-${instanceId}-001`,
    corpusRootDirectory,
    now: new Date('2026-10-16T00:02:00.000Z'),
    ...overrides,
  };
}

describe('transactional research review service', () => {
  it('binds the decision to the active graph release and commits it with the workflow event', async () => {
    const started = await startReviewWorkflow();
    const completed = await transitionResearchReview(db, reviewInput(started.id));
    const stored = await db('knowledge_research_review_events').first();
    const event = JSON.parse(String(stored.event_json)) as Record<string, unknown>;
    expect(completed).toMatchObject({ status: 'completed', currentState: 'approved', revision: 1 });
    expect(event).toMatchObject({
      subject_id: assertionId,
      subject_revision: 1,
      research_release_digest: releaseDigest,
      workflow_instance_id: started.id,
      workflow_event_sequence: 1,
      reviewer_id: 'mw:user:synthetic-reviewer',
      requester_id: 'mw:user:synthetic-requester',
      visibility: 'INTERNAL',
    });
    expect(
      await db('workflow_events').where({ instance_id: started.id, sequence: 1 })
    ).toHaveLength(1);
    expect(await db('knowledge_research_review_events')).toHaveLength(1);
  });

  it('replays exact intent without a second event and conflicts on changed evidence', async () => {
    const started = await startReviewWorkflow();
    const input = reviewInput(started.id);
    await transitionResearchReview(db, input);
    await expect(transitionResearchReview(db, input)).resolves.toMatchObject({ revision: 1 });
    await expect(
      transitionResearchReview(db, { ...input, evidenceIds: ['mw:evidence:other'] })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await db('knowledge_research_review_events')).toHaveLength(1);
  });

  it('binds a relation decision to its active revision and directly linked evidence', async () => {
    const started = await startReviewWorkflow(
      ResearchGraphRecord.modelName,
      activeRelationRecordId
    );
    const completed = await transitionResearchReview(
      db,
      reviewInput(started.id, { subjectId: relationId })
    );
    const stored = await db('knowledge_research_review_events').first();
    expect(completed).toMatchObject({ status: 'completed', currentState: 'approved', revision: 1 });
    expect(JSON.parse(String(stored.event_json))).toMatchObject({
      subject_id: relationId,
      research_release_digest: releaseDigest,
      outcome: 'accepted',
    });
  });

  it('rejects a resource outside the active graph before committing a review', async () => {
    const started = await startReviewWorkflow('base.partner', 1);
    await expect(transitionResearchReview(db, reviewInput(started.id))).rejects.toMatchObject({
      code: 'INVALID_EVENT_PAYLOAD',
    });
    expect(
      await db('workflow_instances').where({ id: started.id }).first('revision')
    ).toMatchObject({
      revision: 0,
    });
    expect(await db('knowledge_research_review_events')).toHaveLength(0);
  });

  it('rejects evidence that is not present and associated in the active graph', async () => {
    const started = await startReviewWorkflow();
    await expect(
      transitionResearchReview(
        db,
        reviewInput(started.id, {
          evidenceIds: ['mw:evidence:not-in-active-release'],
          idempotencyKey: 'research-review-unbound-evidence-01',
        })
      )
    ).rejects.toMatchObject({ code: 'INVALID_EVENT_PAYLOAD' });
    expect(
      await db('workflow_instances').where({ id: started.id }).first('revision')
    ).toMatchObject({
      revision: 0,
    });
    expect(await db('knowledge_research_review_events')).toHaveLength(0);
  });

  it('rejects a stale research subject revision without committing workflow state', async () => {
    const started = await startReviewWorkflow();
    await expect(
      transitionResearchReview(db, reviewInput(started.id, { expectedSubjectRevision: 2 }))
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    expect(
      await db('workflow_instances').where({ id: started.id }).first('revision')
    ).toMatchObject({
      revision: 0,
    });
    expect(
      await db('workflow_events').where({ instance_id: started.id, sequence: 1 })
    ).toHaveLength(0);
    expect(await db('knowledge_research_review_events')).toHaveLength(0);
  });

  it('rejects an authenticated role that does not match the persisted database user', async () => {
    const started = await startReviewWorkflow();
    await expect(
      transitionResearchReview(
        db,
        reviewInput(started.id, {
          authenticatedReviewer: { userId: superadminId, companyId, role: 'user' },
        })
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      await db('workflow_instances').where({ id: started.id }).first('revision')
    ).toMatchObject({
      revision: 0,
    });
    expect(await db('knowledge_research_review_events')).toHaveLength(0);
  });

  it('rolls back approvals, workflow state, and workflow event if decision persistence fails', async () => {
    const started = await startReviewWorkflow();
    await db.raw(`
      CREATE TRIGGER fail_research_review_event
      BEFORE INSERT ON knowledge_research_review_events
      BEGIN SELECT RAISE(ABORT, 'injected review persistence failure'); END
    `);
    await expect(transitionResearchReview(db, reviewInput(started.id))).rejects.toThrow(
      'injected review persistence failure'
    );
    expect(
      await db('workflow_instances').where({ id: started.id }).first('revision', 'status')
    ).toMatchObject({
      revision: 0,
      status: 'active',
    });
    expect(await db('workflow_approvals').where({ instance_id: started.id })).toHaveLength(0);
    expect(
      await db('workflow_events').where({ instance_id: started.id, sequence: 1 })
    ).toHaveLength(0);
    expect(await db('knowledge_research_review_events')).toHaveLength(0);
  });

  it('enforces workflow self-review rejection before writing a research decision', async () => {
    const started = await startWorkflow(db, {
      code: 'research.review',
      companyId,
      actorId: superadminId,
      role: 'superadmin',
      resourceModel: ResearchGraphRecord.modelName,
      resourceId: activeRecordId,
      idempotencyKey: 'research-review-self-start-001',
      now: new Date('2026-10-16T00:01:00.000Z'),
    });
    await expect(transitionResearchReview(db, reviewInput(started.id))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await db('knowledge_research_review_events')).toHaveLength(0);
  });

  it('protects review history from raw SQL edits', async () => {
    const started = await startReviewWorkflow();
    await transitionResearchReview(db, reviewInput(started.id));
    const row = await db('knowledge_research_review_events').first('id');
    await expect(
      db('knowledge_research_review_events').where({ id: row.id }).update({ event_json: '{}' })
    ).rejects.toThrow('append-only');
    await expect(
      db('knowledge_research_review_events').where({ id: row.id }).delete()
    ).rejects.toThrow('append-only');
  });

  it('fails closed when a privileged database edit corrupts prior review bytes', async () => {
    const first = await startReviewWorkflow();
    await transitionResearchReview(db, reviewInput(first.id));
    const second = await startWorkflow(db, {
      code: 'research.review',
      companyId,
      actorId: systemId,
      role: 'system',
      resourceModel: ResearchGraphRecord.modelName,
      resourceId: activeRecordId,
      idempotencyKey: 'research-review-corruption-followup-01',
      now: new Date('2026-10-16T00:03:00.000Z'),
    });
    await db.raw('DROP TRIGGER knowledge_research_review_events_reject_update');
    await db('knowledge_research_review_events').where({ workflow_instance_id: first.id }).update({
      event_json: '{}',
    });
    await expect(
      transitionResearchReview(
        db,
        reviewInput(second.id, { idempotencyKey: 'research-review-after-corruption-01' })
      )
    ).rejects.toMatchObject({ code: 'INVALID_EVENT_PAYLOAD' });
    expect(await db('workflow_instances').where({ id: second.id }).first('revision')).toMatchObject(
      {
        revision: 0,
      }
    );
  });
});
