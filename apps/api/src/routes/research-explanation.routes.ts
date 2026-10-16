import type { FastifyPluginAsync } from 'fastify';
import {
  explainResearchRelation,
  type ResearchEvidenceReference,
  type ResearchGraphInput,
  type ResearchGraphNode,
  type ResearchRelation,
  type ResearchVisibility,
} from '@moonwitness/research';
import {
  readActiveResearchGraphRelease,
  type StoredResearchGraphRecord,
  type StoredResearchGraphRelease,
} from '@moonwitness/orm-knowledge';
import { readQuranPassage, readTextualWitnessPassage } from '@moonwitness/corpus';
import type { Knex } from 'knex';
import { resolveCorpusDataRoot } from './corpus.routes.js';

const corpusKey = 'research';
const visibilities: readonly ResearchVisibility[] = [
  'PUBLIC_APPROVED',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'CHILD_SENSITIVE',
];
const visibilityRank: Record<ResearchVisibility, number> = {
  PUBLIC_APPROVED: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
  CHILD_SENSITIVE: 4,
};

export interface ResearchExplanationRouteOptions {
  readActiveRelease?: (
    trx: Knex.Transaction,
    key: string
  ) => Promise<StoredResearchGraphRelease | null>;
  lookupPassage?: (
    editionId: string,
    locator: string
  ) => Promise<{
    source_id: string;
    expression_id?: string;
    edition_id: string;
    locator: string;
    text: string;
    content_sha256: string;
    citation: string;
  } | null>;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function storedVisibility(record: StoredResearchGraphRecord, content: Record<string, unknown>) {
  if (!visibilities.includes(content.visibility as ResearchVisibility)) {
    throw new TypeError('Research record visibility is invalid');
  }
  const embedded = content.visibility as ResearchVisibility;
  // Storage PUBLIC is only an INTERNAL floor. It never means approved publication.
  const floor: ResearchVisibility = record.visibility === 'RESTRICTED' ? 'RESTRICTED' : 'INTERNAL';
  return visibilityRank[embedded] >= visibilityRank[floor] ? embedded : floor;
}

function graphFromRelease(release: StoredResearchGraphRelease) {
  if (release.corpusKey !== corpusKey || release.schemaVersion !== 'research-graph/v1') {
    throw new TypeError('Research release has an unsupported identity');
  }
  const nodes: ResearchGraphNode[] = [];
  const relations: ResearchRelation[] = [];
  const evidenceReferences: ResearchEvidenceReference[] = [];
  const evidenceVisibility = new Map<string, ResearchVisibility>();

  for (const record of release.records) {
    const content = object(record.content);
    if (!content || content.id !== record.key) throw new TypeError('Research record is malformed');
    const visibility = storedVisibility(record, content);
    if (record.kind === 'relation') {
      if (content.kind !== 'ResearchRelation')
        throw new TypeError('Research relation is malformed');
      relations.push({ ...content, visibility } as unknown as ResearchRelation);
      continue;
    }

    if (typeof content.kind !== 'string') throw new TypeError('Research node is malformed');
    nodes.push({
      id: record.key,
      kind: content.kind,
      visibility,
      ...(typeof content.identity_class === 'string'
        ? { identity_class: content.identity_class }
        : {}),
    } as ResearchGraphNode);

    if (record.kind === 'evidence') {
      if (
        content.kind !== 'Evidence' ||
        typeof content.assertion_id !== 'string' ||
        (content.direction !== 'supporting' && content.direction !== 'counterevidence') ||
        !object(content.selector)
      ) {
        throw new TypeError('Research evidence is malformed');
      }
      evidenceReferences.push({
        id: record.key as ResearchEvidenceReference['id'],
        assertion_id: content.assertion_id as ResearchEvidenceReference['assertion_id'],
        direction: content.direction,
        selector: content.selector as ResearchEvidenceReference['selector'],
      });
      evidenceVisibility.set(record.key, visibility);
    }
  }
  return {
    graph: { nodes, relations } satisfies ResearchGraphInput,
    evidenceReferences,
    evidenceVisibility,
  };
}

async function localPassage(editionId: string, locator: string) {
  const rootDirectory = resolveCorpusDataRoot();
  if (editionId === 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2' && locator === 'Q7:46') {
    const passage = await readQuranPassage({
      rootDirectory,
      editionId,
      locator,
      use: 'quote_excerpt',
    });
    return {
      source_id: 'mw:source:tanzil-quran-text',
      edition_id: passage.editionId,
      locator: passage.locator,
      text: passage.text,
      content_sha256: passage.sha256,
      citation: passage.attribution,
    };
  }
  if (editionId === 'mw:edition:webp-protestant-2020-stable' && locator === 'Genesis 1:1') {
    const passage = await readTextualWitnessPassage({
      rootDirectory,
      expressionId: 'mw:expression:webp-protestant',
      editionId,
      locator,
    });
    return {
      source_id: 'mw:source:ebible-webp-protestant',
      expression_id: passage.expressionId,
      edition_id: passage.editionId,
      locator: passage.locator,
      text: passage.text,
      content_sha256: passage.sha256,
      citation: passage.attribution,
    };
  }
  return null;
}

const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'error'],
  properties: { success: { const: false }, error: { type: 'string' } },
} as const;

const relationSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'kind',
    'schema_version',
    'content_revision',
    'predicate',
    'subject_id',
    'object_id',
    'scope',
    'epistemic_status',
    'review_status',
    'interpretation_boundary',
  ],
  properties: {
    id: { type: 'string' },
    kind: { const: 'ResearchRelation' },
    schema_version: { const: 1 },
    content_revision: { type: 'integer', minimum: 1 },
    predicate: { type: 'string' },
    subject_id: { type: 'string' },
    object_id: { type: 'string' },
    scope: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'reference_id'],
      properties: { kind: { type: 'string' }, reference_id: { type: 'string' } },
    },
    epistemic_status: { type: 'string' },
    review_status: { type: 'string' },
    interpretation_boundary: { const: 'linked_evidence_only' },
  },
} as const;

const resolvedEvidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'evidence',
    'direction',
    'source_id',
    'edition_id',
    'locator',
    'content_sha256',
    'citation',
    'excerpt',
  ],
  properties: {
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'assertion_id', 'direction', 'selector'],
      properties: {
        id: { type: 'string' },
        assertion_id: { type: 'string' },
        direction: { enum: ['supporting', 'counterevidence'] },
        selector: { type: 'object', additionalProperties: true },
      },
    },
    direction: { enum: ['supporting', 'counterevidence'] },
    source_id: { type: 'string' },
    expression_id: { type: 'string' },
    edition_id: { type: 'string' },
    locator: { type: 'string' },
    content_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    citation: { type: 'string' },
    excerpt: { type: 'string' },
    range: {
      type: 'object',
      additionalProperties: false,
      required: ['unit', 'start', 'end'],
      properties: {
        unit: { const: 'unicode_scalar' },
        start: { type: 'integer', minimum: 0 },
        end: { type: 'integer', minimum: 1 },
      },
    },
  },
} as const;

const relationExplanationSchema = {
  ...relationSummarySchema,
  required: [
    ...(relationSummarySchema.required as readonly string[]),
    'supporting_evidence',
    'counterevidence',
    'alternatives',
  ],
  properties: {
    ...relationSummarySchema.properties,
    supporting_evidence: { type: 'array', items: resolvedEvidenceSchema },
    counterevidence: { type: 'array', items: resolvedEvidenceSchema },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['relation', 'supporting_evidence', 'counterevidence'],
        properties: {
          relation: relationSummarySchema,
          supporting_evidence: { type: 'array', items: resolvedEvidenceSchema },
          counterevidence: { type: 'array', items: resolvedEvidenceSchema },
        },
      },
    },
  },
} as const;

const successSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'data'],
  properties: {
    success: { const: true },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['release_digest', 'explanation'],
      properties: {
        release_digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        explanation: relationExplanationSchema,
      },
    },
  },
} as const;

export const researchExplanationRoutes: FastifyPluginAsync<
  ResearchExplanationRouteOptions
> = async (fastify, options) => {
  const readRelease = options.readActiveRelease ?? readActiveResearchGraphRelease;
  const passageLookup = options.lookupPassage ?? localPassage;

  fastify.get<{ Params: { relationId: string } }>(
    '/api/research/relations/:relationId/explanation',
    {
      schema: {
        tags: ['Research'],
        summary: 'Explain a relation from the verified active graph release',
        description:
          'Returns supporting evidence, counterevidence and alternatives bound to one immutable active PostgreSQL release. Evidence is resolved from pinned local corpus data with no network fetch. The server requires system or superadmin and only permits INTERNAL visibility; restricted and child-sensitive records remain hidden.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['relationId'],
          properties: { relationId: { type: 'string', minLength: 1, maxLength: 255 } },
        },
        response: {
          200: { description: 'Explanation and exact source release digest.', ...successSchema },
          401: { description: 'Bearer authentication is required.', ...errorSchema },
          403: {
            description: 'The authenticated role cannot read research explanations.',
            ...errorSchema,
          },
          404: {
            description: 'The relation is missing or hidden by access policy.',
            ...errorSchema,
          },
          503: {
            description: 'The active release or local evidence could not be verified.',
            ...errorSchema,
          },
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      if (!request.auth)
        return reply.code(401).send({ success: false, error: 'Authentication required' });
      if (request.auth.role !== 'system' && request.auth.role !== 'superadmin') {
        return reply
          .code(403)
          .send({ success: false, error: 'Research explanation access denied' });
      }

      try {
        const release = await fastify.knex.transaction((trx) => readRelease(trx, corpusKey));
        if (!release) {
          return reply
            .code(503)
            .send({ success: false, error: 'Research explanation is unavailable' });
        }
        const snapshot = graphFromRelease(release);
        const result = await explainResearchRelation(snapshot.graph, request.params.relationId, {
          evidenceReferences: snapshot.evidenceReferences,
          evidenceVisibility: snapshot.evidenceVisibility,
          lookupPassage: passageLookup,
          canRead: (record) => record.visibility === 'INTERNAL',
        });
        if (result.status === 'evidence_unavailable') {
          return reply
            .code(503)
            .send({ success: false, error: 'Research explanation is unavailable' });
        }
        if (result.status === 'not_found') {
          return reply.code(404).send({ success: false, error: 'Research relation was not found' });
        }
        return reply.send({
          success: true,
          data: {
            release_digest: release.releaseDigest,
            explanation: result.explanation,
          },
        });
      } catch (error) {
        request.log.error({ err: error }, 'Verified research explanation could not be built');
        return reply
          .code(503)
          .send({ success: false, error: 'Research explanation is unavailable' });
      }
    }
  );
};
