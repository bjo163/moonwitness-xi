import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest } from '@moonwitness/jobs';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';
import { manifest as workflowManifest } from '@moonwitness/orm-workflow';
import { manifest, readResearchSuggestionVersion, storeResearchSuggestions } from '../src/index.js';
import { canonicalResearchJson } from '../src/research-release.js';

let db: Knex;
let userId: number;
let companyId: number;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function suggestion(text = 'Synthetic extractive passage.') {
  const sourceText = text;
  return {
    id: 'mw:suggestion:synthetic-summary',
    kind: 'summary',
    status: 'unreviewed',
    visibility: 'INTERNAL',
    text,
    citations: [
      {
        evidence_id: 'mw:evidence:synthetic-evidence',
        assertion_id: 'mw:assertion:synthetic-assertion',
        selector: {
          source_id: 'mw:source:synthetic-source',
          edition_id: 'mw:edition:synthetic-edition',
          locator: text.includes('revised') ? 'synthetic:revision' : 'synthetic:1',
          content_sha256: sha256(sourceText),
          range: { unit: 'unicode_scalar', start: 0, end: Array.from(sourceText).length },
          selected_span_sha256: sha256(sourceText),
        },
      },
    ],
  };
}

function envelope(item = suggestion()) {
  return { format: 'mw-local-ai-suggestion-envelope/v1', suggestions: [item] };
}

const resolver = {
  async resolvePassage(selector: ReturnType<typeof suggestion>['citations'][number]['selector']) {
    const text =
      selector.locator === 'synthetic:revision'
        ? 'Synthetic revised extractive passage.'
        : 'Synthetic extractive passage.';
    return {
      source_id: selector.source_id,
      edition_id: selector.edition_id,
      locator: selector.locator,
      content_sha256: selector.content_sha256,
      text,
      readable: true,
    };
  },
  async resolveAssertion() {
    return { active: true, readable: true };
  },
  async resolveEvidence(evidenceId: string) {
    return {
      assertion_id: 'mw:assertion:synthetic-assertion',
      active: evidenceId === 'mw:evidence:synthetic-evidence',
      readable: true,
    };
  },
};

const actor = () => ({ userId, companyId, role: 'superadmin' as const });

beforeEach(async () => {
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
    manifest,
  ]);
  userId = Number((await db('users').where({ login: 'superadmin' }).first('id'))?.id);
  companyId = Number((await db('companies').first('id'))?.id);
  await db('company_memberships')
    .insert({ user_id: userId, company_id: companyId, is_default: true })
    .onConflict(['user_id', 'company_id'])
    .ignore();
});

afterEach(async () => db.destroy());

describe('tenant-scoped INTERNAL research suggestion versions', () => {
  it('persists only unreviewed candidates, supports idempotent replay and immutable revisions', async () => {
    const input = { authenticatedActor: actor(), envelope: envelope(), resolver };
    const [first] = await storeResearchSuggestions(db, input);
    const [retry] = await storeResearchSuggestions(db, input);
    const [changed] = await storeResearchSuggestions(db, {
      ...input,
      envelope: envelope(suggestion('Synthetic revised extractive passage.')),
    });
    expect(first).toMatchObject({
      version: 1,
      visibility: 'INTERNAL',
      status: 'unreviewed',
      idempotent: false,
    });
    expect(retry).toMatchObject({ version: 1, digest: first!.digest, idempotent: true });
    expect(changed).toMatchObject({ version: 2, status: 'unreviewed', idempotent: false });
    expect(await db('knowledge_research_suggestion_versions')).toHaveLength(2);
    await expect(
      readResearchSuggestionVersion(db, {
        authenticatedReader: actor(),
        suggestionId: first!.suggestionId,
      })
    ).resolves.toMatchObject({ version: 2, status: 'unreviewed', visibility: 'INTERNAL' });
    await expect(
      db('knowledge_research_suggestion_versions').where({ id: 1 }).update({ visibility: 'PUBLIC' })
    ).rejects.toThrow(/append-only/u);
    await expect(
      db('knowledge_research_suggestion_versions').where({ id: 1 }).delete()
    ).rejects.toThrow(/append-only/u);
    expect(await db('knowledge_research_graph_records')).toHaveLength(0);
  });

  it('rejects malformed or cross-tenant reads and inactive membership', async () => {
    await expect(
      storeResearchSuggestions(db, {
        authenticatedActor: actor(),
        envelope: { suggestions: [] },
        resolver,
      })
    ).rejects.toThrow(/schema check/u);
    await storeResearchSuggestions(db, {
      authenticatedActor: actor(),
      envelope: envelope(),
      resolver,
    });
    await expect(
      readResearchSuggestionVersion(db, {
        authenticatedReader: { ...actor(), companyId: companyId + 1 },
        suggestionId: 'mw:suggestion:synthetic-summary',
      })
    ).rejects.toThrow(/unavailable in this company context/u);
    await db('company_memberships')
      .where({ user_id: userId, company_id: companyId })
      .update({ active: false });
    await expect(
      readResearchSuggestionVersion(db, {
        authenticatedReader: actor(),
        suggestionId: 'mw:suggestion:synthetic-summary',
      })
    ).rejects.toThrow(/unavailable in this company context/u);
  });

  it('persists the resolver-validated snapshot even if caller input changes during validation', async () => {
    const candidate = envelope();
    const mutableActor = actor();
    const mutatingResolver = {
      ...resolver,
      async resolvePassage(
        selector: ReturnType<typeof suggestion>['citations'][number]['selector']
      ) {
        candidate.suggestions[0]!.text = 'Unsupported changed text';
        mutableActor.companyId += 1;
        return resolver.resolvePassage(selector);
      },
    };

    const [stored] = await storeResearchSuggestions(db, {
      authenticatedActor: mutableActor,
      envelope: candidate,
      resolver: mutatingResolver,
    });

    expect(stored?.suggestion.text).toBe('Synthetic extractive passage.');
    await expect(
      readResearchSuggestionVersion(db, {
        authenticatedReader: actor(),
        suggestionId: 'mw:suggestion:synthetic-summary',
      })
    ).resolves.toMatchObject({ suggestion: { text: 'Synthetic extractive passage.' } });
  });

  it('snapshots the reader tenant before asynchronous database checks', async () => {
    await storeResearchSuggestions(db, {
      authenticatedActor: actor(),
      envelope: envelope(),
      resolver,
    });
    const mutableReader = actor();
    const read = readResearchSuggestionVersion(db, {
      authenticatedReader: mutableReader,
      suggestionId: 'mw:suggestion:synthetic-summary',
    });
    mutableReader.companyId += 1;
    await expect(read).resolves.toMatchObject({
      version: 1,
      suggestionId: 'mw:suggestion:synthetic-summary',
    });
  });

  it('detects canonical-byte tampering even when the row contains valid JSON', async () => {
    await storeResearchSuggestions(db, {
      authenticatedActor: actor(),
      envelope: envelope(),
      resolver,
    });
    const forged = canonicalResearchJson({
      ...suggestion(),
      text: 'Out-of-band altered content.',
      status: 'unreviewed',
      visibility: 'INTERNAL',
    });
    // Simulate an out-of-band privileged database edit to exercise read-time integrity checks.
    await db.raw('DROP TRIGGER knowledge_research_suggestion_versions_reject_update');
    await db('knowledge_research_suggestion_versions')
      .where({ suggestion_id: 'mw:suggestion:synthetic-summary' })
      .update({ suggestion_json: forged });
    await expect(
      readResearchSuggestionVersion(db, {
        authenticatedReader: actor(),
        suggestionId: 'mw:suggestion:synthetic-summary',
      })
    ).rejects.toThrow(/integrity verification/u);
  });
});
