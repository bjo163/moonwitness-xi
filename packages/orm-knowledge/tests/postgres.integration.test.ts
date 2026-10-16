import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { Model } from 'objection';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest } from '@moonwitness/jobs';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';
import { manifest as workflowManifest, startWorkflow } from '@moonwitness/orm-workflow';
import { readQuranPassage } from '@moonwitness/corpus';
import {
  activateResearchGraphRelease,
  createResearchGraphRelease,
  manifest,
  readActiveResearchGraphRelease,
  ResearchGraphRecord,
  transitionResearchReview,
  WitnessCorrection,
  WitnessInterpretation,
  WitnessTestimony,
} from '../src/index.js';

const connectionString = process.env.POSTGRES_TEST_URL;
const postgresDescribe = connectionString ? describe : describe.skip;
const pilotScopeId = 'mw:concept:postgres-synthetic-pilot';
const pilotAssertionId = 'mw:assertion:postgres-synthetic-pilot';

function syntheticAssertionContent(revision: number, claim: string) {
  return {
    id: pilotAssertionId,
    kind: 'Assertion',
    schema_version: 1,
    lifecycle: 'candidate',
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    origin_ref: 'fixture://postgres/synthetic-release',
    visibility: 'PUBLIC_APPROVED',
    content_revision: revision,
    claim,
    polarity: 'positive',
    scope: { kind: 'research_context', reference_id: pilotScopeId },
    context: { mode: 'analysis', reference_id: pilotScopeId },
    epistemic_status: 'hypothesized',
    review_status: 'pending',
  };
}

postgresDescribe('knowledge addon PostgreSQL integration', () => {
  const schema = `mw_knowledge_${randomUUID().replaceAll('-', '')}`;
  let adminDb: Knex;
  let db: Knex;

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
  }, 30000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (adminDb) {
      await adminDb.raw('drop schema if exists ?? cascade', [schema]);
      await adminDb.destroy();
    }
  });

  it('installs restricted records and blocks ORM and SQL mutation in an isolated schema', async () => {
    await installAddons(db, [manifest, baseManifest]);
    const testimony = await WitnessTestimony.query().findOne({
      external_key: 'synthetic-witness-001',
    });
    expect(testimony).toMatchObject({
      visibility: 'RESTRICTED',
      received_time_text: 'spring',
      original_text: 'Synthetic example: the meeting began sometime in spring.',
    });
    expect(await WitnessCorrection.query().where('testimony_id', testimony?.id)).toHaveLength(1);
    expect(await WitnessInterpretation.query().where('testimony_id', testimony?.id)).toHaveLength(
      1
    );
    const correction = await WitnessCorrection.query().findOne({ sequence: 1 });
    const interpretation = await WitnessInterpretation.query().first();
    await expect(WitnessTestimony.query().patch({ original_text: 'replacement' })).rejects.toThrow(
      'cannot be updated or deleted'
    );

    const rows = [
      { table: 'knowledge_witness_testimonies', id: testimony?.id, column: 'original_text' },
      { table: 'knowledge_witness_corrections', id: correction?.id, column: 'correction_text' },
      {
        table: 'knowledge_witness_interpretations',
        id: interpretation?.id,
        column: 'interpretation_text',
      },
    ] as const;
    for (const row of rows) {
      await expect(
        db(row.table)
          .where({ id: row.id })
          .update({ [row.column]: 'raw SQL replacement' })
      ).rejects.toThrow('Knowledge witness records are append-only');
      await expect(db(row.table).where({ id: row.id }).delete()).rejects.toThrow(
        'Knowledge witness records are append-only'
      );
    }

    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        db('knowledge_witness_corrections').insert({
          testimony_id: testimony?.id,
          sequence: 2,
          correction_text: 'Concurrent synthetic correction.',
          reason: 'Synthetic concurrent sequence test.',
          source_label: 'Synthetic test',
          source_locator: 'fixture://concurrent-correction',
          source_digest: 'c'.repeat(64),
          asserted_time_text: 'unknown',
          asserted_time_precision: 'unknown',
          recorded_by_id: correction?.recorded_by_id,
        })
      )
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(
      await WitnessCorrection.query().where({ testimony_id: testimony?.id, sequence: 2 })
    ).toHaveLength(1);
  }, 30000);

  it('stores, activates, rolls back, and protects synthetic graph releases in PostgreSQL', async () => {
    await installAddons(db, [manifest, baseManifest]);
    const input = {
      corpusKey: 'postgres-synthetic-pilot',
      schemaVersion: 'research-graph/v1',
      records: [
        {
          key: pilotScopeId,
          kind: 'node' as const,
          visibility: 'INTERNAL' as const,
          content: {
            id: pilotScopeId,
            kind: 'Concept',
            identity_class: 'ConceptIdentity',
            visibility: 'INTERNAL',
          },
        },
        {
          key: pilotAssertionId,
          kind: 'assertion' as const,
          visibility: 'PUBLIC' as const,
          content: syntheticAssertionContent(1, 'Synthetic PostgreSQL pilot record.'),
        },
      ],
    };
    const first = await db.transaction((trx) => createResearchGraphRelease(trx, input));
    await db.transaction((trx) =>
      activateResearchGraphRelease(trx, {
        corpusKey: input.corpusKey,
        releaseDigest: first.releaseDigest,
        expectedCurrentReleaseDigest: null,
        activatedAt: new Date().toISOString(),
      })
    );
    const second = await db.transaction((trx) =>
      createResearchGraphRelease(trx, {
        ...input,
        previousReleaseDigest: first.releaseDigest,
        records: input.records.map((record) =>
          record.key === pilotAssertionId
            ? {
                ...record,
                content: syntheticAssertionContent(2, 'Synthetic PostgreSQL pilot revision.'),
              }
            : record
        ),
      })
    );
    await db.transaction((trx) =>
      activateResearchGraphRelease(trx, {
        corpusKey: input.corpusKey,
        releaseDigest: second.releaseDigest,
        expectedCurrentReleaseDigest: first.releaseDigest,
        activatedAt: new Date().toISOString(),
      })
    );
    await db.transaction((trx) =>
      activateResearchGraphRelease(trx, {
        corpusKey: input.corpusKey,
        releaseDigest: first.releaseDigest,
        expectedCurrentReleaseDigest: second.releaseDigest,
        activatedAt: new Date().toISOString(),
      })
    );
    await expect(
      db.transaction((trx) => readActiveResearchGraphRelease(trx, input.corpusKey))
    ).resolves.toMatchObject({ releaseDigest: first.releaseDigest });

    const releaseRow = await db('knowledge_research_graph_releases')
      .where({ release_digest: first.releaseDigest })
      .first();
    const recordRow = await db('knowledge_research_graph_records')
      .where({ release_id: releaseRow.id })
      .first();
    await expect(
      db('knowledge_research_graph_releases')
        .where({ id: releaseRow.id })
        .update({ record_count: 7 })
    ).rejects.toThrow('Knowledge witness records are append-only');
    await expect(
      db('knowledge_research_graph_records').where({ id: recordRow.id }).delete()
    ).rejects.toThrow('Knowledge witness records are append-only');
  }, 30000);

  it('commits and replays a review decision atomically with the PostgreSQL workflow event', async () => {
    Model.knex(db);
    await installAddons(db, [
      baseManifest,
      jobsManifest,
      notificationManifest,
      workflowManifest,
      manifest,
    ]);
    const systemId = Number((await db('users').where({ login: 'system' }).first('id'))?.id);
    const reviewerId = Number((await db('users').where({ login: 'superadmin' }).first('id'))?.id);
    const companyId = Number((await db('companies').first('id'))?.id);
    if (!systemId || !reviewerId || !companyId)
      throw new Error('Required synthetic actors are missing');
    await db('company_memberships')
      .insert({ user_id: reviewerId, company_id: companyId, is_default: true })
      .onConflict(['user_id', 'company_id'])
      .ignore();
    await db('knowledge_research_actor_identities').insert([
      { user_id: systemId, canonical_user_id: 'mw:user:pg-synthetic-requester' },
      { user_id: reviewerId, canonical_user_id: 'mw:user:pg-synthetic-reviewer' },
    ]);

    const corpusRootDirectory = path.resolve(process.cwd(), '../..');
    const editionId = 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2';
    const sourceId = 'mw:source:tanzil-quran-text';
    const subjectId = 'mw:assertion:pg-review-adapter-fixture';
    const evidenceId = 'mw:evidence:pg-review-adapter-quran-746';
    const scopeId = 'mw:concept:pg-review-adapter-fixture';
    const passage = await readQuranPassage({
      rootDirectory: corpusRootDirectory,
      editionId,
      locator: 'Q7:46',
      use: 'read_analyze',
    });
    const releaseInput = {
      corpusKey: 'research',
      schemaVersion: 'research-graph/v1',
      records: [
        {
          key: sourceId,
          kind: 'source' as const,
          visibility: 'PUBLIC' as const,
          content: { id: sourceId, kind: 'Artifact', visibility: 'PUBLIC_APPROVED' },
        },
        {
          key: editionId,
          kind: 'expression' as const,
          visibility: 'PUBLIC' as const,
          content: { id: editionId, kind: 'Edition', visibility: 'PUBLIC_APPROVED' },
        },
        {
          key: scopeId,
          kind: 'node' as const,
          visibility: 'INTERNAL' as const,
          content: {
            id: scopeId,
            kind: 'Concept',
            identity_class: 'ConceptIdentity',
            visibility: 'INTERNAL',
          },
        },
        {
          key: subjectId,
          kind: 'assertion' as const,
          visibility: 'PUBLIC' as const,
          content: {
            id: subjectId,
            kind: 'Assertion',
            schema_version: 1,
            lifecycle: 'candidate',
            created_at: '2026-10-16T00:00:00.000Z',
            updated_at: '2026-10-16T00:00:00.000Z',
            origin_ref: 'fixture://postgres/review-adapter',
            visibility: 'PUBLIC_APPROVED',
            content_revision: 1,
            claim: 'Synthetic adapter test fixture; no claim is made about the selected passage.',
            polarity: 'positive',
            scope: { kind: 'research_context', reference_id: scopeId },
            context: { mode: 'analysis', reference_id: scopeId },
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
            assertion_id: subjectId,
            direction: 'supporting',
            selector: {
              source_id: sourceId,
              edition_id: editionId,
              locator: 'Q7:46',
              content_sha256: passage.sha256,
            },
          },
        },
      ],
    };
    const release = await db.transaction((trx) => createResearchGraphRelease(trx, releaseInput));
    await db.transaction((trx) =>
      activateResearchGraphRelease(trx, {
        corpusKey: releaseInput.corpusKey,
        releaseDigest: release.releaseDigest,
        expectedCurrentReleaseDigest: null,
        activatedAt: '2026-10-16T00:00:01.000Z',
      })
    );
    const activeRecord = await db('knowledge_research_graph_records')
      .join(
        'knowledge_research_active_releases',
        'knowledge_research_active_releases.release_id',
        'knowledge_research_graph_records.release_id'
      )
      .where({
        'knowledge_research_active_releases.corpus_key': releaseInput.corpusKey,
        'knowledge_research_graph_records.record_key': subjectId,
      })
      .first('knowledge_research_graph_records.id');
    if (!activeRecord) throw new Error('Active synthetic research subject is missing');

    await db('workflow_definitions').insert({
      code: 'research.review',
      version: 1,
      name: 'Synthetic PostgreSQL research review',
      config: JSON.stringify({
        startState: 'submitted',
        startRoles: ['system'],
        timeoutMinutes: 1440,
        resourceModels: [ResearchGraphRecord.modelName],
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
      }),
      enabled: true,
    });

    const start = async (key: string) =>
      startWorkflow(db, {
        code: 'research.review',
        companyId,
        actorId: systemId,
        role: 'system',
        resourceModel: ResearchGraphRecord.modelName,
        resourceId: Number(activeRecord.id),
        idempotencyKey: key,
        now: new Date('2026-10-16T00:01:00.000Z'),
      });
    const review = async (instanceId: number, key: string) =>
      transitionResearchReview(db, {
        instanceId,
        authenticatedReviewer: { userId: reviewerId, companyId, role: 'superadmin' },
        action: 'approve',
        expectedWorkflowRevision: 0,
        subjectId,
        expectedSubjectRevision: 1,
        evidenceIds: [evidenceId],
        idempotencyKey: key,
        corpusRootDirectory,
        now: new Date('2026-10-16T00:02:00.000Z'),
      });

    const started = await start('pg-review-start-primary-01');
    const completed = await review(started.id, 'pg-review-action-primary-01');
    expect(completed).toMatchObject({ status: 'completed', currentState: 'approved', revision: 1 });
    const workflowEvent = await db('workflow_events')
      .where({ instance_id: started.id, sequence: 1 })
      .first('payload');
    const reviewRow = await db('knowledge_research_review_events')
      .where({ workflow_instance_id: started.id, workflow_event_sequence: 1 })
      .first();
    expect(JSON.parse(String(workflowEvent?.payload))).toMatchObject({
      subject_id: subjectId,
      subject_revision: 1,
      research_release_digest: release.releaseDigest,
      workflow_instance_id: started.id,
      reviewer_id: 'mw:user:pg-synthetic-reviewer',
      requester_id: 'mw:user:pg-synthetic-requester',
      visibility: 'INTERNAL',
    });
    expect(JSON.parse(String(reviewRow?.event_json))).toMatchObject({
      subject_id: subjectId,
      workflow_event_sequence: 1,
      workflow_revision: 1,
      research_release_digest: release.releaseDigest,
    });
    await expect(review(started.id, 'pg-review-action-primary-01')).resolves.toMatchObject({
      revision: 1,
      status: 'completed',
    });
    expect(await db('knowledge_research_review_events')).toHaveLength(1);
    expect(
      await db('workflow_events').where({ instance_id: started.id, sequence: 1 })
    ).toHaveLength(1);

    await expect(
      db('knowledge_research_review_events')
        .where({ workflow_instance_id: started.id })
        .update({ event_json: '{}' })
    ).rejects.toThrow('Knowledge witness records are append-only');
    await expect(
      db('knowledge_research_review_events').where({ workflow_instance_id: started.id }).delete()
    ).rejects.toThrow('Knowledge witness records are append-only');

    const failed = await start('pg-review-start-rollback-01');
    await db.raw(`
      CREATE OR REPLACE FUNCTION mw_test_fail_research_review_insert()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'injected PostgreSQL review persistence failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.raw(`
      CREATE TRIGGER mw_test_fail_research_review_insert
      BEFORE INSERT ON knowledge_research_review_events
      FOR EACH ROW EXECUTE FUNCTION mw_test_fail_research_review_insert()
    `);
    await expect(review(failed.id, 'pg-review-action-rollback-01')).rejects.toThrow(
      'injected PostgreSQL review persistence failure'
    );
    expect(
      await db('workflow_instances').where({ id: failed.id }).first('revision', 'status')
    ).toMatchObject({
      revision: 0,
      status: 'active',
    });
    expect(await db('workflow_approvals').where({ instance_id: failed.id })).toHaveLength(0);
    expect(await db('workflow_events').where({ instance_id: failed.id, sequence: 1 })).toHaveLength(
      0
    );
    expect(
      await db('knowledge_research_review_events').where({ workflow_instance_id: failed.id })
    ).toHaveLength(0);
  }, 30000);
});
