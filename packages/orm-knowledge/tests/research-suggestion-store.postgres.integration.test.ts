import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { manifest as knowledgeManifest } from '../src/manifest.js';
import {
  readResearchSuggestionVersion,
  storeResearchSuggestions,
} from '../src/research-suggestion-store.js';

const connectionString = process.env.POSTGRES_TEST_URL;
const postgresDescribe = connectionString ? describe : describe.skip;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const sourceText = 'Synthetic PostgreSQL extractive passage.';
const envelopeFor = (text: string, locator: string) =>
  ({
    format: 'mw-local-ai-suggestion-envelope/v1',
    suggestions: [
      {
        id: 'mw:suggestion:postgres-integration',
        kind: 'summary',
        status: 'unreviewed',
        visibility: 'INTERNAL',
        text,
        citations: [
          {
            evidence_id: 'mw:evidence:postgres-synthetic',
            assertion_id: 'mw:assertion:postgres-synthetic',
            selector: {
              source_id: 'mw:source:synthetic-postgres',
              edition_id: 'mw:edition:synthetic-postgres-v1',
              locator,
              content_sha256: sha256(text),
              range: { unit: 'unicode_scalar', start: 0, end: Array.from(text).length },
              selected_span_sha256: sha256(text),
            },
          },
        ],
      },
    ],
  }) as const;

const envelope = envelopeFor(sourceText, 'fixture://postgres/suggestion/1');

const resolverForTransaction = (_trx: Knex.Transaction) => ({
  async resolvePassage(
    selector: (typeof envelope.suggestions)[number]['citations'][number]['selector']
  ) {
    const text =
      selector.locator === 'fixture://postgres/suggestion/changed-a'
        ? 'Synthetic PostgreSQL changed version A.'
        : selector.locator === 'fixture://postgres/suggestion/changed-b'
          ? 'Synthetic PostgreSQL changed version B.'
          : sourceText;
    return {
      source_id: selector.source_id,
      edition_id: selector.edition_id,
      locator: selector.locator,
      content_sha256: sha256(text),
      text,
      readable: true,
    };
  },
  async resolveAssertion() {
    return { active: true, readable: true };
  },
  async resolveEvidence(evidenceId: string) {
    return {
      assertion_id: 'mw:assertion:postgres-synthetic',
      active: evidenceId === 'mw:evidence:postgres-synthetic',
      readable: true,
    };
  },
});

postgresDescribe('research suggestion PostgreSQL integration', () => {
  const schema = `mw_suggestion_${randomUUID().replaceAll('-', '')}`;
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
      pool: { min: 0, max: 3 },
    });
    await installAddons(db, [baseManifest, knowledgeManifest]);
  }, 30000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (adminDb) {
      await adminDb.raw('drop schema if exists ?? cascade', [schema]);
      await adminDb.destroy();
    }
  });

  it('serializes concurrent tenant writes, verifies reads, and rejects SQL mutation', async () => {
    const userId = Number((await db('users').where({ login: 'superadmin' }).first('id'))?.id);
    const companyId = Number((await db('companies').first('id'))?.id);
    if (!userId || !companyId) throw new Error('Synthetic PostgreSQL actor/company is unavailable');
    await db('company_memberships')
      .insert({ user_id: userId, company_id: companyId, is_default: true })
      .onConflict(['user_id', 'company_id'])
      .ignore();
    const input = {
      authenticatedActor: { userId, companyId, role: 'superadmin' as const },
      envelope,
      resolverForTransaction,
    };
    const concurrent = await Promise.all([
      storeResearchSuggestions(db, input),
      storeResearchSuggestions(db, input),
    ]);
    expect(concurrent.flat().map(({ version }) => version)).toEqual([1, 1]);
    expect(concurrent.flat().filter(({ idempotent }) => idempotent)).toHaveLength(1);
    const stored = await readResearchSuggestionVersion(db, {
      authenticatedReader: input.authenticatedActor,
      suggestionId: 'mw:suggestion:postgres-integration',
    });
    expect(stored).toMatchObject({ version: 1, visibility: 'INTERNAL', status: 'unreviewed' });
    const changed = await Promise.all([
      storeResearchSuggestions(db, {
        ...input,
        envelope: envelopeFor(
          'Synthetic PostgreSQL changed version A.',
          'fixture://postgres/suggestion/changed-a'
        ),
      }),
      storeResearchSuggestions(db, {
        ...input,
        envelope: envelopeFor(
          'Synthetic PostgreSQL changed version B.',
          'fixture://postgres/suggestion/changed-b'
        ),
      }),
    ]);
    expect(
      changed
        .flat()
        .map(({ version }) => version)
        .sort()
    ).toEqual([2, 3]);
    expect(changed.flat().every(({ idempotent }) => !idempotent)).toBe(true);
    expect(await db('knowledge_research_suggestion_versions')).toHaveLength(3);
    await expect(
      db('knowledge_research_suggestion_versions')
        .where({ suggestion_id: 'mw:suggestion:postgres-integration' })
        .update({ visibility: 'PUBLIC' })
    ).rejects.toThrow('Knowledge research suggestions are append-only');
    await expect(
      db('knowledge_research_suggestion_versions')
        .where({ suggestion_id: 'mw:suggestion:postgres-integration' })
        .delete()
    ).rejects.toThrow('Knowledge research suggestions are append-only');
  }, 30000);
});
