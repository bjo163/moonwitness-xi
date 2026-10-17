import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { readQuranPassage } from '@moonwitness/corpus';
import { manifest as authManifest } from '@moonwitness/auth';
import { jobsManifest } from '@moonwitness/jobs';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';
import { manifest as requestManifest } from '@moonwitness/orm-request';
import { manifest as workflowManifest } from '@moonwitness/orm-workflow';
import {
  activateResearchGraphRelease,
  createResearchGraphRelease,
  readActiveResearchGraphRelease,
  type ResearchGraphRecordInput,
} from '@moonwitness/orm-knowledge';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { manifest as knowledgeManifest } from '@moonwitness/orm-knowledge';
import { config } from '../config/env.js';
import { createDatabase } from '../database/knex.js';

const sourceId = 'mw:source:tanzil-quran-text';
const editionId = 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2';
const scopeId = 'mw:concept:e2e-live-knowledge-scope';
const assertionId = 'mw:assertion:e2e-live-knowledge';
const evidenceId = 'mw:evidence:e2e-live-knowledge';
const claim = 'Synthetic local PostgreSQL Board E2E assertion.';
const locator = 'Q7:46';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesPublicMetadataRecord(
  value: unknown,
  id: string,
  recordKind: 'source' | 'expression',
  contentKind: 'Artifact' | 'Edition'
): boolean {
  if (
    !isRecord(value) ||
    value.key !== id ||
    value.kind !== recordKind ||
    value.visibility !== 'PUBLIC'
  ) {
    return false;
  }
  const content = value.content;
  return (
    isRecord(content) &&
    Object.keys(content).length === 3 &&
    content.id === id &&
    content.kind === contentKind &&
    content.visibility === 'PUBLIC_APPROVED'
  );
}

function assertIsE2eDatabase(connectionString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL test URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  const loopback =
    hostname === 'localhost' ||
    hostname === '::1' ||
    (isIP(hostname) === 4 && Number(hostname.split('.')[0]) === 127);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!loopback || !/(?:^|[_-])(?:test|e2e|ci)(?:$|[_-])/iu.test(databaseName)) {
    throw new Error(
      'Knowledge E2E fixture refused: DATABASE_URL must target a loopback test/e2e/ci database.'
    );
  }
}

function fixtureRecords(contentSha256: string): ResearchGraphRecordInput[] {
  return [
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
      key: assertionId,
      kind: 'assertion',
      visibility: 'INTERNAL',
      content: {
        id: assertionId,
        kind: 'Assertion',
        schema_version: 1,
        lifecycle: 'candidate',
        created_at: '2026-10-17T00:00:00.000Z',
        updated_at: '2026-10-17T00:00:00.000Z',
        origin_ref: 'fixture://board-e2e/knowledge-search/001',
        visibility: 'INTERNAL',
        content_revision: 1,
        claim,
        polarity: 'positive',
        scope: { kind: 'research_context', reference_id: scopeId },
        context: { mode: 'analysis', reference_id: scopeId },
        epistemic_status: 'hypothesized',
        review_status: 'pending',
      },
    },
    {
      key: evidenceId,
      kind: 'evidence',
      visibility: 'INTERNAL',
      content: {
        id: evidenceId,
        kind: 'Evidence',
        visibility: 'INTERNAL',
        assertion_id: assertionId,
        direction: 'supporting',
        selector: {
          source_id: sourceId,
          edition_id: editionId,
          locator,
          content_sha256: contentSha256,
        },
      },
    },
  ];
}

async function seed(): Promise<{ status: 'seeded' | 'already-present'; releaseDigest: string }> {
  const connectionString = config.db.connection;
  assertIsE2eDatabase(connectionString);

  const passage = await readQuranPassage({
    rootDirectory: repositoryRoot,
    editionId,
    locator,
    use: 'read_analyze',
  });
  const db = createDatabase();
  try {
    await installAddons(db, [
      baseManifest,
      authManifest,
      jobsManifest,
      notificationManifest,
      workflowManifest,
      requestManifest,
      knowledgeManifest,
    ]);
    return await db.transaction(async (trx) => {
      const active = await readActiveResearchGraphRelease(trx, 'research');
      const existingAssertion = active?.records.find((record) => record.key === assertionId);
      if (existingAssertion) {
        if (!active) throw new Error('The active research release is unavailable.');
        const existingScope = active.records.find((record) => record.key === scopeId);
        const existingEvidence = active.records.find((record) => record.key === evidenceId);
        const existingSource = active.records.find((record) => record.key === sourceId);
        const existingEdition = active.records.find((record) => record.key === editionId);
        const assertionContent = existingAssertion.content;
        const evidenceContent = existingEvidence?.content;
        const scopeContent = existingScope?.content;
        const assertionScope = isRecord(assertionContent) ? assertionContent.scope : undefined;
        const assertionContext = isRecord(assertionContent) ? assertionContent.context : undefined;
        const selector = isRecord(evidenceContent) ? evidenceContent.selector : undefined;
        if (
          existingAssertion.kind !== 'assertion' ||
          existingAssertion.visibility !== 'INTERNAL' ||
          !isRecord(assertionContent) ||
          assertionContent.id !== assertionId ||
          assertionContent.kind !== 'Assertion' ||
          assertionContent.schema_version !== 1 ||
          assertionContent.lifecycle !== 'candidate' ||
          assertionContent.visibility !== 'INTERNAL' ||
          assertionContent.claim !== claim ||
          assertionContent.polarity !== 'positive' ||
          !isRecord(assertionContext) ||
          assertionContext.mode !== 'analysis' ||
          assertionContext.reference_id !== scopeId ||
          assertionContent.epistemic_status !== 'hypothesized' ||
          assertionContent.review_status !== 'pending' ||
          assertionContent.content_revision !== 1 ||
          assertionContent.origin_ref !== 'fixture://board-e2e/knowledge-search/001' ||
          !isRecord(assertionScope) ||
          assertionScope.kind !== 'research_context' ||
          assertionScope.reference_id !== scopeId ||
          !existingScope ||
          existingScope.kind !== 'node' ||
          existingScope.visibility !== 'INTERNAL' ||
          !isRecord(scopeContent) ||
          scopeContent.id !== scopeId ||
          scopeContent.kind !== 'Concept' ||
          scopeContent.identity_class !== 'ConceptIdentity' ||
          scopeContent.visibility !== 'INTERNAL' ||
          !existingEvidence ||
          existingEvidence.kind !== 'evidence' ||
          existingEvidence.visibility !== 'INTERNAL' ||
          !isRecord(evidenceContent) ||
          evidenceContent.id !== evidenceId ||
          evidenceContent.kind !== 'Evidence' ||
          evidenceContent.visibility !== 'INTERNAL' ||
          evidenceContent.assertion_id !== assertionId ||
          evidenceContent.direction !== 'supporting' ||
          !isRecord(selector) ||
          selector.source_id !== sourceId ||
          selector.edition_id !== editionId ||
          selector.locator !== locator ||
          selector.content_sha256 !== passage.sha256 ||
          !matchesPublicMetadataRecord(existingSource, sourceId, 'source', 'Artifact') ||
          !matchesPublicMetadataRecord(existingEdition, editionId, 'expression', 'Edition')
        ) {
          throw new Error('An existing knowledge E2E fixture has conflicting content.');
        }
        return { status: 'already-present', releaseDigest: active.releaseDigest };
      }

      const reservedIds = new Set([scopeId, assertionId, evidenceId]);
      if (active?.records.some((record) => reservedIds.has(record.key))) {
        throw new Error('A partial knowledge E2E fixture already exists in the active release.');
      }
      const records: ResearchGraphRecordInput[] =
        active?.records.map(({ key, kind, visibility, content }) => ({
          key,
          kind,
          visibility,
          content,
        })) ?? [];
      const keys = new Set(records.map((record) => record.key));
      const existingSource = records.find((record) => record.key === sourceId);
      const existingEdition = records.find((record) => record.key === editionId);
      if (
        (existingSource &&
          !matchesPublicMetadataRecord(existingSource, sourceId, 'source', 'Artifact')) ||
        (existingEdition &&
          !matchesPublicMetadataRecord(existingEdition, editionId, 'expression', 'Edition'))
      ) {
        throw new Error('A knowledge E2E source or edition record has conflicting content.');
      }
      if (!keys.has(sourceId)) {
        records.push({
          key: sourceId,
          kind: 'source',
          visibility: 'PUBLIC',
          content: { id: sourceId, kind: 'Artifact', visibility: 'PUBLIC_APPROVED' },
        });
      }
      if (!keys.has(editionId)) {
        records.push({
          key: editionId,
          kind: 'expression',
          visibility: 'PUBLIC',
          content: { id: editionId, kind: 'Edition', visibility: 'PUBLIC_APPROVED' },
        });
      }
      records.push(...fixtureRecords(passage.sha256));

      const release = await createResearchGraphRelease(trx, {
        corpusKey: 'research',
        schemaVersion: 'research-graph/v1',
        previousReleaseDigest: active?.releaseDigest ?? null,
        records,
      });
      await activateResearchGraphRelease(trx, {
        corpusKey: 'research',
        releaseDigest: release.releaseDigest,
        expectedCurrentReleaseDigest: active?.releaseDigest ?? null,
        activatedAt: '2026-10-17T00:00:00.000Z',
      });
      return { status: 'seeded', releaseDigest: release.releaseDigest };
    });
  } finally {
    await db.destroy();
  }
}

seed()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })
  .catch(() => {
    process.stderr.write('Failed to seed the isolated knowledge E2E fixture.\n');
    process.exitCode = 1;
  });
