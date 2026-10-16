import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import { readQuranPassageSnapshot, readTextualWitnessPassageSnapshot } from '@moonwitness/corpus';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest } from '@moonwitness/jobs';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';
import { manifest as workflowManifest } from '@moonwitness/orm-workflow';
import { manifest as knowledgeManifest } from '@moonwitness/orm-knowledge';
import {
  activateResearchGraphRelease,
  createResearchGraphRelease,
} from '@moonwitness/orm-knowledge';
import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localAiSuggestionRoutes } from '../src/routes/local-ai-suggestion.routes.js';
import { resolveCorpusDataRoot } from '../src/routes/corpus.routes.js';

const sourceId = 'mw:source:tanzil-quran-text';
const editionId = 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2';
const assertionId = 'mw:assertion:local-ai-suggestion-001';
const evidenceId = 'mw:evidence:local-ai-suggestion-001';
const scopeId = 'mw:concept:local-ai-suggestion-scope';

describe('local AI suggestion generation route authorization boundary', () => {
  let db: Knex;
  let app: ReturnType<typeof Fastify>;
  let userId: number;
  let companyId: number;
  const generate = vi.fn(async () => ({ status: 'generated' as const, text: '{}' }));

  beforeEach(async () => {
    generate.mockClear();
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await installAddons(db, [
      baseManifest,
      jobsManifest,
      notificationManifest,
      workflowManifest,
      knowledgeManifest,
    ]);
    userId = Number((await db('users').where({ login: 'superadmin' }).first('id'))?.id);
    companyId = Number((await db('companies').first('id'))?.id);
    await db('company_memberships')
      .insert({ user_id: userId, company_id: companyId, is_default: true })
      .onConflict(['user_id', 'company_id'])
      .ignore();
    app = Fastify();
    app.decorateRequest('auth', null);
    app.decorate('db', db);
    app.decorate('localAi', { generate });
    app.addHook('onRequest', async (request) => {
      if (request.headers.authorization === 'Bearer test')
        request.auth = {
          userId,
          companyId: request.headers['x-test-company'] === 'foreign' ? companyId + 999 : companyId,
          role: 'superadmin',
          groupPermissions: [],
        };
    });
    await app.register(rateLimit, { global: false });
    await app.register(localAiSuggestionRoutes);
  });

  async function publishEvidence(
    options: { webp?: boolean; assertion?: string; evidence?: string } = {}
  ) {
    const selectedSourceId = options.webp ? 'mw:source:ebible-webp-protestant' : sourceId;
    const selectedEditionId = options.webp ? 'mw:edition:webp-protestant-2020-stable' : editionId;
    const selectedLocator = options.webp ? 'Genesis 1:1' : 'Q7:46';
    const selectedAssertionId = options.assertion ?? assertionId;
    const selectedEvidenceId = options.evidence ?? evidenceId;
    const snapshot = options.webp
      ? await readTextualWitnessPassageSnapshot({
          rootDirectory: resolveCorpusDataRoot(),
          expressionId: 'mw:expression:webp-protestant',
          editionId: selectedEditionId,
          locator: selectedLocator,
          use: 'read_analyze',
        })
      : await readQuranPassageSnapshot({
          rootDirectory: resolveCorpusDataRoot(),
          editionId: selectedEditionId,
          locator: selectedLocator,
          use: 'read_analyze',
        });
    const current = await db('knowledge_research_active_releases as active')
      .join('knowledge_research_graph_releases as release', 'release.id', 'active.release_id')
      .where({ 'active.corpus_key': 'research' })
      .first('release.release_digest');
    const release = await db.transaction((trx) =>
      createResearchGraphRelease(trx, {
        corpusKey: 'research',
        schemaVersion: 'research-graph/v1',
        previousReleaseDigest: current?.release_digest ?? null,
        records: [
          {
            key: selectedSourceId,
            kind: 'source',
            visibility: 'PUBLIC',
            content: { id: selectedSourceId, kind: 'Artifact', visibility: 'PUBLIC_APPROVED' },
          },
          {
            key: selectedEditionId,
            kind: 'expression',
            visibility: 'PUBLIC',
            content: { id: selectedEditionId, kind: 'Edition', visibility: 'PUBLIC_APPROVED' },
          },
          ...(options.webp
            ? [
                {
                  key: 'mw:expression:webp-protestant',
                  kind: 'expression' as const,
                  visibility: 'PUBLIC' as const,
                  content: {
                    id: 'mw:expression:webp-protestant',
                    kind: 'Expression',
                    visibility: 'PUBLIC_APPROVED',
                  },
                },
              ]
            : []),
          {
            key: scopeId,
            kind: 'node',
            visibility: 'INTERNAL',
            content: {
              id: scopeId,
              kind: 'Concept',
              identity_class: 'ConceptIdentity',
              visibility: 'INTERNAL',
            },
          },
          {
            key: selectedAssertionId,
            kind: 'assertion',
            visibility: 'INTERNAL',
            content: {
              id: selectedAssertionId,
              kind: 'Assertion',
              schema_version: 1,
              lifecycle: 'candidate',
              created_at: '2026-10-17T00:00:00.000Z',
              updated_at: '2026-10-17T00:00:00.000Z',
              origin_ref: 'fixture://local-ai-suggestion/assertion',
              visibility: 'INTERNAL',
              content_revision: 1,
              claim: 'Synthetic local AI suggestion authorization fixture.',
              polarity: 'positive',
              scope: { kind: 'research_context', reference_id: scopeId },
              context: { mode: 'analysis', reference_id: scopeId },
              epistemic_status: 'hypothesized',
              review_status: 'pending',
            },
          },
          {
            key: selectedEvidenceId,
            kind: 'evidence',
            visibility: 'INTERNAL',
            content: {
              id: selectedEvidenceId,
              kind: 'Evidence',
              visibility: 'INTERNAL',
              assertion_id: selectedAssertionId,
              direction: 'supporting',
              selector: {
                ...(options.webp ? { expression_id: 'mw:expression:webp-protestant' } : {}),
                source_id: selectedSourceId,
                edition_id: selectedEditionId,
                locator: selectedLocator,
                content_sha256: snapshot.passage.sha256,
              },
            },
          },
        ],
      })
    );
    await db.transaction((trx) =>
      activateResearchGraphRelease(trx, {
        corpusKey: 'research',
        releaseDigest: release.releaseDigest,
        expectedCurrentReleaseDigest: current?.release_digest ?? null,
        activatedAt: new Date().toISOString(),
      })
    );
    return snapshot;
  }

  afterEach(async () => {
    if (app) await app.close();
    await db.destroy();
  });

  it('requires an authenticated active company context before generation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/suggestions/generate',
      payload: { kind: 'term', evidence_ids: ['mw:evidence:pilot'] },
    });
    expect(response.statusCode).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });

  it('rate-limits generation requests before invoking the local runtime', async () => {
    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/api/research/suggestions/generate',
          payload: { kind: 'term', evidence_ids: [evidenceId] },
        })
      );
    }
    expect(responses.slice(0, 10).every((response) => response.statusCode === 401)).toBe(true);
    expect(responses[10]?.statusCode).toBe(429);
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects malformed requests before generation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/suggestions/generate',
      headers: { authorization: 'Bearer test' },
      payload: { kind: 'term', evidence_ids: ['mw:evidence:pilot'], company_id: companyId },
    });
    expect(response.statusCode).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not call the model when active tenant evidence is unavailable', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/suggestions/generate',
      headers: { authorization: 'Bearer test' },
      payload: { kind: 'term', evidence_ids: ['mw:evidence:pilot'] },
    });
    expect(response.statusCode).toBe(404);
    expect(generate).not.toHaveBeenCalled();
    expect(await db('knowledge_research_suggestion_versions')).toHaveLength(0);
  });

  it('does not allow evidence to be reused under a different company context', async () => {
    await publishEvidence();
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/suggestions/generate',
      headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
      payload: { kind: 'term', evidence_ids: [evidenceId] },
    });
    expect(response.statusCode).toBe(404);
    expect(generate).not.toHaveBeenCalled();
    expect(await db('knowledge_research_suggestion_versions')).toHaveLength(0);
  });

  it('validates and stores a local extractive candidate for active tenant evidence', async () => {
    const snapshot = await publishEvidence();
    const firstScalar = Array.from(snapshot.passage.text)[0] ?? '';
    const spanDigest = createHash('sha256').update(firstScalar, 'utf8').digest('hex');
    generate.mockResolvedValueOnce({
      status: 'generated',
      text: JSON.stringify({
        format: 'mw-local-ai-suggestion-envelope/v1',
        suggestions: [
          {
            id: 'mw:suggestion:local-ai-suggestion-001',
            status: 'unreviewed',
            visibility: 'INTERNAL',
            kind: 'term',
            text: firstScalar,
            citations: [
              {
                evidence_id: evidenceId,
                assertion_id: assertionId,
                selector: {
                  source_id: sourceId,
                  edition_id: editionId,
                  locator: 'Q7:46',
                  content_sha256: snapshot.passage.sha256,
                  range: { unit: 'unicode_scalar', start: 0, end: 1 },
                  selected_span_sha256: spanDigest,
                },
              },
            ],
          },
        ],
      }),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/suggestions/generate',
      headers: { authorization: 'Bearer test' },
      payload: { kind: 'term', evidence_ids: [evidenceId] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json().data).toMatchObject({
      status: 'unreviewed',
      visibility: 'INTERNAL',
      candidates: [{ version: 1, idempotent: false }],
    });
    expect(await db('knowledge_research_suggestion_versions')).toHaveLength(1);
  });

  it('supports only the separately approved local WEBP Genesis 1:1 sample', async () => {
    const webpAssertion = 'mw:assertion:local-ai-webp-001';
    const webpEvidence = 'mw:evidence:local-ai-webp-001';
    const snapshot = await publishEvidence({
      webp: true,
      assertion: webpAssertion,
      evidence: webpEvidence,
    });
    const firstScalar = Array.from(snapshot.passage.text)[0] ?? '';
    generate.mockResolvedValueOnce({
      status: 'generated',
      text: JSON.stringify({
        format: 'mw-local-ai-suggestion-envelope/v1',
        suggestions: [
          {
            id: 'mw:suggestion:local-ai-webp-001',
            status: 'unreviewed',
            visibility: 'INTERNAL',
            kind: 'term',
            text: firstScalar,
            citations: [
              {
                evidence_id: webpEvidence,
                assertion_id: webpAssertion,
                selector: {
                  source_id: 'mw:source:ebible-webp-protestant',
                  edition_id: 'mw:edition:webp-protestant-2020-stable',
                  locator: 'Genesis 1:1',
                  content_sha256: snapshot.passage.sha256,
                  range: { unit: 'unicode_scalar', start: 0, end: 1 },
                  selected_span_sha256: createHash('sha256')
                    .update(firstScalar, 'utf8')
                    .digest('hex'),
                },
              },
            ],
          },
        ],
      }),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/suggestions/generate',
      headers: { authorization: 'Bearer test' },
      payload: { kind: 'term', evidence_ids: [webpEvidence] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ status: 'unreviewed', visibility: 'INTERNAL' });
    expect(await db('knowledge_research_suggestion_versions')).toHaveLength(1);
  });

  it('rechecks tenant membership after provider await and stores nothing when access is revoked', async () => {
    const snapshot = await publishEvidence();
    const firstScalar = Array.from(snapshot.passage.text)[0] ?? '';
    const candidate = JSON.stringify({
      format: 'mw-local-ai-suggestion-envelope/v1',
      suggestions: [
        {
          id: 'mw:suggestion:revoked-during-generation',
          status: 'unreviewed',
          visibility: 'INTERNAL',
          kind: 'term',
          text: firstScalar,
          citations: [
            {
              evidence_id: evidenceId,
              assertion_id: assertionId,
              selector: {
                source_id: sourceId,
                edition_id: editionId,
                locator: 'Q7:46',
                content_sha256: snapshot.passage.sha256,
                range: { unit: 'unicode_scalar', start: 0, end: 1 },
                selected_span_sha256: createHash('sha256')
                  .update(firstScalar, 'utf8')
                  .digest('hex'),
              },
            },
          ],
        },
      ],
    });
    generate.mockImplementationOnce(async () => {
      await db('company_memberships')
        .where({ user_id: userId, company_id: companyId })
        .update({ active: false });
      return { status: 'generated', text: candidate };
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/suggestions/generate',
      headers: { authorization: 'Bearer test' },
      payload: { kind: 'term', evidence_ids: [evidenceId] },
    });
    expect(response.statusCode).toBe(400);
    expect(await db('knowledge_research_suggestion_versions')).toHaveLength(0);
  });

  it('rejects a model citation that substitutes an out-of-scope source identity', async () => {
    const snapshot = await publishEvidence();
    const firstScalar = Array.from(snapshot.passage.text)[0] ?? '';
    generate.mockResolvedValueOnce({
      status: 'generated',
      text: JSON.stringify({
        format: 'mw-local-ai-suggestion-envelope/v1',
        suggestions: [
          {
            id: 'mw:suggestion:out-of-scope-source',
            status: 'unreviewed',
            visibility: 'INTERNAL',
            kind: 'term',
            text: firstScalar,
            citations: [
              {
                evidence_id: evidenceId,
                assertion_id: assertionId,
                selector: {
                  source_id: 'mw:source:unapproved-external',
                  edition_id: 'mw:edition:unapproved-external',
                  locator: 'External 1:1',
                  content_sha256: snapshot.passage.sha256,
                  range: { unit: 'unicode_scalar', start: 0, end: 1 },
                  selected_span_sha256: createHash('sha256')
                    .update(firstScalar, 'utf8')
                    .digest('hex'),
                },
              },
            ],
          },
        ],
      }),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/research/suggestions/generate',
      headers: { authorization: 'Bearer test' },
      payload: { kind: 'term', evidence_ids: [evidenceId] },
    });
    expect(response.statusCode).toBe(400);
    expect(await db('knowledge_research_suggestion_versions')).toHaveLength(0);
  });
});
