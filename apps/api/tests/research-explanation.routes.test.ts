import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { readQuranPassage } from '@moonwitness/corpus';
import type { StoredResearchGraphRelease } from '@moonwitness/orm-knowledge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCorpusDataRoot } from '../src/routes/corpus.routes.js';
import { researchExplanationRoutes } from '../src/routes/research-explanation.routes.js';

const relationId = 'mw:relation:api-fixture';
const evidenceId = 'mw:evidence:api-fixture';
const assertionId = 'mw:assertion:api-fixture';
const releaseDigest = 'a'.repeat(64);
const editionId = 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2';

describe('research relation explanation API', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function fixtureRelease(
    overrides: {
      relationVisibility?: string;
      evidenceVisibility?: string;
      evidenceHash?: string;
    } = {}
  ) {
    const passage = await readQuranPassage({
      rootDirectory: resolveCorpusDataRoot(),
      editionId,
      locator: 'Q7:46',
      use: 'quote_excerpt',
    });
    const visibility = overrides.relationVisibility ?? 'INTERNAL';
    return {
      corpusKey: 'research',
      releaseDigest,
      manifestDigest: releaseDigest,
      manifestJson: '{}',
      schemaVersion: 'research-graph/v1',
      previousReleaseDigest: null,
      records: [
        {
          key: 'mw:source:tanzil-quran-text',
          kind: 'source',
          visibility: 'PUBLIC',
          content: {
            id: 'mw:source:tanzil-quran-text',
            kind: 'Artifact',
            visibility: 'PUBLIC_APPROVED',
          },
          contentDigest: '7'.repeat(64),
        },
        {
          key: editionId,
          kind: 'expression',
          visibility: 'PUBLIC',
          content: { id: editionId, kind: 'Edition', visibility: 'PUBLIC_APPROVED' },
          contentDigest: '8'.repeat(64),
        },
        {
          key: 'mw:entity:api-left',
          kind: 'node',
          visibility: 'PUBLIC',
          content: {
            id: 'mw:entity:api-left',
            kind: 'Entity',
            identity_class: 'Entity',
            visibility: 'PUBLIC_APPROVED',
          },
          contentDigest: '1'.repeat(64),
        },
        {
          key: 'mw:entity:api-right',
          kind: 'node',
          visibility: 'INTERNAL',
          content: {
            id: 'mw:entity:api-right',
            kind: 'Entity',
            identity_class: 'Entity',
            visibility: 'INTERNAL',
          },
          contentDigest: '2'.repeat(64),
        },
        {
          key: 'mw:concept:api-scope',
          kind: 'node',
          visibility: 'INTERNAL',
          content: { id: 'mw:concept:api-scope', kind: 'Concept', visibility: 'INTERNAL' },
          contentDigest: '3'.repeat(64),
        },
        {
          key: assertionId,
          kind: 'assertion',
          visibility: 'PUBLIC',
          content: {
            id: assertionId,
            kind: 'Assertion',
            schema_version: 1,
            lifecycle: 'candidate',
            created_at: '2026-10-16T00:00:00.000Z',
            updated_at: '2026-10-16T00:00:00.000Z',
            origin_ref: 'fixture://research/api/001',
            visibility: 'PUBLIC_APPROVED',
            content_revision: 1,
            claim: 'Synthetic explanation fixture.',
            polarity: 'positive',
            scope: { kind: 'research_context', reference_id: 'mw:concept:api-scope' },
            context: { mode: 'analysis', reference_id: 'mw:concept:api-scope' },
            epistemic_status: 'hypothesized',
            review_status: 'pending',
          },
          contentDigest: '4'.repeat(64),
        },
        {
          key: evidenceId,
          kind: 'evidence',
          visibility: 'PUBLIC',
          content: {
            id: evidenceId,
            kind: 'Evidence',
            visibility: overrides.evidenceVisibility ?? 'PUBLIC_APPROVED',
            assertion_id: assertionId,
            direction: 'supporting',
            selector: {
              source_id: 'mw:source:tanzil-quran-text',
              edition_id: editionId,
              locator: 'Q7:46',
              content_sha256: overrides.evidenceHash ?? passage.sha256,
            },
          },
          contentDigest: '5'.repeat(64),
        },
        {
          key: relationId,
          kind: 'relation',
          visibility: visibility === 'RESTRICTED' ? 'RESTRICTED' : 'PUBLIC',
          content: {
            id: relationId,
            kind: 'ResearchRelation',
            schema_version: 1,
            lifecycle: 'candidate',
            created_at: '2026-10-16T00:00:00.000Z',
            updated_at: '2026-10-16T00:00:00.000Z',
            origin_ref: 'fixture://research/api/001',
            content_revision: 1,
            visibility,
            predicate: 'related_to',
            subject_id: 'mw:entity:api-left',
            object_id: 'mw:entity:api-right',
            scope: { kind: 'research_context', reference_id: 'mw:concept:api-scope' },
            supporting_evidence_ids: [evidenceId],
            counterevidence_ids: [],
            alternative_relation_ids: [],
            epistemic_status: 'unreviewed',
            review_status: 'pending',
          },
          contentDigest: '6'.repeat(64),
        },
      ],
    } satisfies StoredResearchGraphRelease;
  }

  async function createApp(
    release: StoredResearchGraphRelease,
    lookupPassage?: () => Promise<null>
  ) {
    const app = Fastify();
    app.decorateRequest('auth', null);
    app.decorate('knex', {
      transaction: async (callback: (trx: object) => Promise<unknown>) => callback({}),
    } as never);
    app.addHook('onRequest', async (request) => {
      const role = request.headers['x-test-role'];
      if (role === 'system' || role === 'superadmin' || role === 'user') {
        request.auth = { userId: 1, role, groupPermissions: [] };
      }
    });
    const readActiveRelease = vi.fn(async (_trx, key: string) => {
      expect(key).toBe('research');
      return release;
    });
    await app.register(researchExplanationRoutes, {
      readActiveRelease,
      ...(lookupPassage ? { lookupPassage } : {}),
    });
    return { app, readActiveRelease };
  }

  it('requires authentication and denies ordinary users', async () => {
    const release = await fixtureRelease();
    const { app } = await createApp(release);
    try {
      const anonymous = await app.inject({
        method: 'GET',
        url: `/api/research/relations/${relationId}/explanation`,
      });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.headers['cache-control']).toBe('private, no-store');
      const ordinary = await app.inject({
        method: 'GET',
        url: `/api/research/relations/${relationId}/explanation`,
        headers: { 'x-test-role': 'user' },
      });
      expect(ordinary.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('explains only records/evidence from the exact active release for an authorized role', async () => {
    const release = await fixtureRelease();
    const { app, readActiveRelease } = await createApp(release);
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/research/relations/${relationId}/explanation`,
        headers: { 'x-test-role': 'superadmin' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(readActiveRelease).toHaveBeenCalledTimes(1);
      expect(response.json()).toMatchObject({
        success: true,
        data: {
          release_digest: releaseDigest,
          explanation: {
            id: relationId,
            supporting_evidence: [{ evidence: { id: evidenceId }, locator: 'Q7:46' }],
            counterevidence: [],
            alternatives: [],
            interpretation_boundary: 'linked_evidence_only',
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it('keeps storage PUBLIC at the INTERNAL floor and hides restricted relation records', async () => {
    const release = await fixtureRelease({ relationVisibility: 'RESTRICTED' });
    const { app } = await createApp(release);
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/research/relations/${relationId}/explanation`,
        headers: { 'x-test-role': 'system' },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Research relation was not found');
    } finally {
      await app.close();
    }
  });

  it('hides a confidential relation and its confidential selected evidence', async () => {
    const release = await fixtureRelease({
      relationVisibility: 'CONFIDENTIAL',
      evidenceVisibility: 'CONFIDENTIAL',
    });
    const { app } = await createApp(release);
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/research/relations/${relationId}/explanation`,
        headers: { 'x-test-role': 'system' },
      });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('Q7:46');
      expect(response.body).not.toContain('excerpt');
    } finally {
      await app.close();
    }
  });

  it('fails closed when exact local evidence cannot be verified', async () => {
    const release = await fixtureRelease({ evidenceHash: '0'.repeat(64) });
    const { app } = await createApp(release);
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/research/relations/${relationId}/explanation`,
        headers: { 'x-test-role': 'system' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe('Research explanation is unavailable');
    } finally {
      await app.close();
    }
  });

  it('fails closed when an injected release has a semantically invalid graph', async () => {
    const release = await fixtureRelease();
    const relation = release.records.find((record) => record.key === relationId)!;
    relation.content = { ...relation.content, subject_id: 'mw:entity:missing-endpoint' };
    const { app } = await createApp(release);
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/research/relations/${relationId}/explanation`,
        headers: { 'x-test-role': 'system' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe('Research explanation is unavailable');
    } finally {
      await app.close();
    }
  });

  it('fails closed when an evidence selector names a source outside the injected release', async () => {
    const release = await fixtureRelease();
    const evidence = release.records.find((record) => record.key === evidenceId)!;
    evidence.content = {
      ...evidence.content,
      selector: {
        ...(evidence.content.selector as Record<string, unknown>),
        source_id: 'mw:source:missing-from-release',
      },
    };
    const { app } = await createApp(release);
    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/research/relations/${relationId}/explanation`,
        headers: { 'x-test-role': 'system' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe('Research explanation is unavailable');
    } finally {
      await app.close();
    }
  });

  it('registers authenticated GET OpenAPI docs with cache and failure contracts', async () => {
    const app = Fastify();
    await app.register(swagger, {
      openapi: {
        info: { title: 'Test API', version: '1.0.0' },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
      },
    });
    await app.register(researchExplanationRoutes, {
      readActiveRelease: async () => null,
      lookupPassage: async () => null,
    });
    await app.ready();
    try {
      const operation = (
        app.swagger().paths as Record<
          string,
          { get: { security: unknown; responses: Record<string, unknown> } }
        >
      )['/api/research/relations/{relationId}/explanation']!.get;
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(Object.keys(operation.responses).sort()).toEqual(['200', '401', '403', '404', '503']);
    } finally {
      await app.close();
    }
  });
});
