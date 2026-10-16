import type { FastifyPluginAsync } from 'fastify';
import { isRecord } from '@moonwitness/types';
import { readQuranPassageSnapshot, readTextualWitnessPassageSnapshot } from '@moonwitness/corpus';
import { generateLocalAiSuggestion } from '@moonwitness/local-ai';
import {
  resolveConceptProfileEvidence,
  storeResearchSuggestions,
} from '@moonwitness/orm-knowledge';
import {
  validateResearchSuggestionEnvelopeWithResolver,
  type TrustedSuggestionResolver,
} from '@moonwitness/research';
import { resolveCorpusDataRoot } from './corpus.routes.js';
import type { Knex } from 'knex';

const sources = [
  {
    source_id: 'mw:source:tanzil-quran-text',
    edition_id: 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2',
    locator: 'Q7:46',
  },
  {
    source_id: 'mw:source:ebible-webp-protestant',
    edition_id: 'mw:edition:webp-protestant-2020-stable',
    locator: 'Genesis 1:1',
  },
] as const;
const error = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'error'],
  properties: { success: { const: false }, error: { type: 'string' } },
} as const;

async function localPassage(selector: { source_id: string; edition_id: string; locator: string }) {
  if (
    selector.source_id === sources[0].source_id &&
    selector.edition_id === sources[0].edition_id &&
    selector.locator === sources[0].locator
  ) {
    const result = await readQuranPassageSnapshot({
      rootDirectory: resolveCorpusDataRoot(),
      editionId: selector.edition_id,
      locator: selector.locator,
      use: 'read_analyze',
    });
    return {
      source_id: result.sourceId,
      edition_id: result.passage.editionId,
      locator: result.passage.locator,
      content_sha256: result.passage.sha256,
      text: result.passage.text,
    };
  }
  if (
    selector.source_id === sources[1].source_id &&
    selector.edition_id === sources[1].edition_id &&
    selector.locator === sources[1].locator
  ) {
    const result = await readTextualWitnessPassageSnapshot({
      rootDirectory: resolveCorpusDataRoot(),
      expressionId: 'mw:expression:webp-protestant',
      editionId: selector.edition_id,
      locator: selector.locator,
      use: 'read_analyze',
    });
    return {
      source_id: result.passage.sourceId,
      edition_id: result.passage.editionId,
      locator: result.passage.locator,
      content_sha256: result.passage.sha256,
      text: result.passage.text,
    };
  }
  return null;
}

export const localAiSuggestionRoutes: FastifyPluginAsync = async (fastify) => {
  const bodyWithAdditionalFields = new WeakSet<object>();
  fastify.post<{ Body: unknown }>(
    '/api/research/suggestions/generate',
    {
      attachValidation: true,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      preValidation: async (request) => {
        if (
          isRecord(request.body) &&
          Object.keys(request.body).some((key) => !['kind', 'evidence_ids'].includes(key))
        )
          bodyWithAdditionalFields.add(request);
      },
      schema: {
        tags: ['Research'],
        summary: 'Generate an INTERNAL local research candidate from approved sample evidence',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'evidence_ids'],
          properties: {
            kind: { enum: ['summary', 'term', 'duplicate'] },
            evidence_ids: {
              type: 'array',
              minItems: 1,
              maxItems: 2,
              uniqueItems: true,
              items: { type: 'string', pattern: '^mw:evidence:[a-z0-9][a-z0-9._-]{0,179}$' },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['success', 'data'],
            properties: {
              success: { const: true },
              data: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'visibility', 'candidates'],
                properties: {
                  status: { const: 'unreviewed' },
                  visibility: { const: 'INTERNAL' },
                  candidates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['suggestionId', 'version', 'digest', 'idempotent'],
                      properties: {
                        suggestionId: { type: 'string' },
                        version: { type: 'integer' },
                        digest: { type: 'string' },
                        idempotent: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: error,
          401: error,
          403: error,
          404: error,
          429: {
            type: 'object',
            additionalProperties: false,
            required: ['statusCode', 'error', 'message'],
            properties: {
              statusCode: { const: 429 },
              error: { const: 'Too Many Requests' },
              message: { type: 'string' },
            },
          },
          503: error,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      const auth = request.auth;
      if (!auth) return reply.code(401).send({ success: false, error: 'Authentication required' });
      if (
        !['user', 'superadmin'].includes(auth.role) ||
        !Number.isSafeInteger(auth.userId) ||
        auth.userId < 1 ||
        !Number.isSafeInteger(auth.companyId) ||
        !auth.companyId
      )
        return reply.code(403).send({ success: false, error: 'Evidence is unavailable' });
      const body = request.body;
      if (
        request.validationError ||
        bodyWithAdditionalFields.has(request) ||
        !isRecord(body) ||
        Object.keys(body).some((key) => !['kind', 'evidence_ids'].includes(key)) ||
        !['summary', 'term', 'duplicate'].includes(String(body.kind)) ||
        !Array.isArray(body.evidence_ids) ||
        body.evidence_ids.length < 1 ||
        body.evidence_ids.length > 2 ||
        new Set(body.evidence_ids).size !== body.evidence_ids.length ||
        (body.kind === 'duplicate'
          ? body.evidence_ids.length !== 2
          : body.evidence_ids.length !== 1)
      )
        return reply.code(400).send({ success: false, error: 'Invalid suggestion request' });
      const actor = {
        userId: auth.userId,
        companyId: auth.companyId,
        role: auth.role as 'user' | 'superadmin',
      };
      try {
        const evidence = new Map<
          string,
          NonNullable<Awaited<ReturnType<typeof resolveConceptProfileEvidence>>>
        >();
        for (const id of body.evidence_ids) {
          if (typeof id !== 'string')
            return reply.code(400).send({ success: false, error: 'Invalid suggestion request' });
          const trusted = await resolveConceptProfileEvidence(fastify.db, id, {
            authenticatedReader: actor,
            corpusRootDirectory: resolveCorpusDataRoot(),
          });
          if (
            !trusted ||
            trusted.access !== 'readable' ||
            !sources.some(
              (source) =>
                source.source_id === trusted.canonicalEvidence.selector.source_id &&
                source.edition_id === trusted.canonicalEvidence.selector.edition_id &&
                source.locator === trusted.canonicalEvidence.selector.locator
            )
          )
            return reply.code(404).send({ success: false, error: 'Evidence is unavailable' });
          evidence.set(id, trusted);
        }
        const passages = [];
        for (const [evidenceId, trusted] of evidence) {
          const selector = trusted.canonicalEvidence.selector;
          const passage = await localPassage({
            source_id: selector.source_id,
            edition_id: selector.edition_id,
            locator: selector.locator,
          });
          if (!passage || passage.content_sha256 !== selector.content_sha256)
            return reply.code(404).send({ success: false, error: 'Evidence is unavailable' });
          passages.push({
            source_id: passage.source_id,
            edition_id: passage.edition_id,
            locator: passage.locator,
            content_sha256: passage.content_sha256,
            evidence_id: evidenceId,
            assertion_id: trusted.canonicalEvidence.assertion_id,
            text: passage.text,
          });
        }
        const createResolver = (database: Knex | Knex.Transaction): TrustedSuggestionResolver => ({
          async resolvePassage(selector) {
            const requested = [...evidence.entries()].find(([, item]) => {
              const source = item.canonicalEvidence.selector;
              return (
                item.access === 'readable' &&
                source.source_id === selector.source_id &&
                source.edition_id === selector.edition_id &&
                source.locator === selector.locator &&
                source.content_sha256 === selector.content_sha256
              );
            });
            if (!requested) return null;
            const [evidenceId, original] = requested;
            const trusted = await resolveConceptProfileEvidence(database, evidenceId, {
              authenticatedReader: actor,
              corpusRootDirectory: resolveCorpusDataRoot(),
            });
            if (!trusted) return null;
            const source = trusted.canonicalEvidence.selector;
            const originalSource = original.canonicalEvidence.selector;
            if (
              trusted.access !== 'readable' ||
              trusted.canonicalEvidence.assertion_id !== original.canonicalEvidence.assertion_id ||
              source.source_id !== originalSource.source_id ||
              source.edition_id !== originalSource.edition_id ||
              source.locator !== originalSource.locator ||
              source.content_sha256 !== originalSource.content_sha256
            )
              return null;
            const passage = await localPassage({
              source_id: source.source_id,
              edition_id: source.edition_id,
              locator: source.locator,
            });
            return passage && passage.content_sha256 === selector.content_sha256
              ? { ...passage, readable: true }
              : null;
          },
          async resolveAssertion(id) {
            for (const [evidenceId, original] of evidence) {
              if (original.canonicalEvidence.assertion_id !== id) continue;
              const trusted = await resolveConceptProfileEvidence(database, evidenceId, {
                authenticatedReader: actor,
                corpusRootDirectory: resolveCorpusDataRoot(),
              });
              if (trusted?.access === 'readable' && trusted.canonicalEvidence.assertion_id === id)
                return { active: true, readable: true };
            }
            return null;
          },
          async resolveEvidence(id) {
            const original = evidence.get(id);
            if (!original) return null;
            const trusted = await resolveConceptProfileEvidence(database, id, {
              authenticatedReader: actor,
              corpusRootDirectory: resolveCorpusDataRoot(),
            });
            return trusted?.access === 'readable' &&
              trusted.canonicalEvidence.assertion_id === original.canonicalEvidence.assertion_id
              ? {
                  assertion_id: trusted.canonicalEvidence.assertion_id,
                  active: true,
                  readable: true,
                }
              : null;
          },
        });
        const resolver = createResolver(fastify.db);
        const result = await generateLocalAiSuggestion({
          runtime: fastify.localAi,
          request: { kind: body.kind as 'summary' | 'term' | 'duplicate', passages },
          validate: (value) => validateResearchSuggestionEnvelopeWithResolver(value, resolver),
        });
        if (result.status === 'disabled' || result.status === 'unavailable')
          return reply
            .code(503)
            .send({ success: false, error: 'Local suggestion generation is unavailable' });
        if (result.status !== 'candidate')
          return reply.code(400).send({
            success: false,
            error: 'Generated suggestion did not pass trusted validation',
          });
        const stored = await storeResearchSuggestions(fastify.db, {
          authenticatedActor: actor,
          resolverForTransaction: (trx) => createResolver(trx),
          envelope: result.value,
        });
        return reply.send({
          success: true,
          data: {
            status: 'unreviewed',
            visibility: 'INTERNAL',
            candidates: stored.map(({ suggestionId, version, digest, idempotent }) => ({
              suggestionId,
              version,
              digest,
              idempotent,
            })),
          },
        });
      } catch {
        return reply.code(404).send({ success: false, error: 'Evidence is unavailable' });
      }
    }
  );
};
