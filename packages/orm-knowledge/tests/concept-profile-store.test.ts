import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest } from '@moonwitness/jobs';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';
import { manifest as workflowManifest } from '@moonwitness/orm-workflow';
import {
  manifest as knowledgeManifest,
  readConceptProfileVersion,
  storeConceptProfiles,
} from '../src/index.js';

let db: Knex;
let userId: number;
let companyId: number;
const corpusRootDirectory = process.cwd();

function profile(id: string, scope = 'Synthetic, provisional scope.') {
  return {
    id: `mw:concept-profile:${id}`,
    concept_id: 'mw:concept:synthetic-concept',
    tradition: 'Synthetic test tradition',
    interpretive_scope: scope,
    epistemic_status: 'provisional',
    uncertainty: { level: 'high', note: 'Synthetic fixture with no interpretive claim.' },
    interpretations: [
      {
        claim_type: 'human_interpretation',
        text: 'Synthetic candidate only.',
        status: 'candidate',
        evidence_ids: [],
      },
    ],
  };
}

function input(document: unknown, overrides: Partial<{ userId: number; companyId: number }> = {}) {
  return {
    authenticatedActor: {
      userId: overrides.userId ?? userId,
      companyId: overrides.companyId ?? companyId,
      role: 'superadmin' as const,
    },
    corpusRootDirectory,
    document,
  };
}

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
    knowledgeManifest,
  ]);
  userId = Number((await db('users').where({ login: 'superadmin' }).first('id'))?.id);
  companyId = Number((await db('companies').first('id'))?.id);
  await db('company_memberships')
    .insert({ user_id: userId, company_id: companyId, is_default: true })
    .onConflict(['user_id', 'company_id'])
    .ignore();
});

afterEach(async () => db.destroy());

describe('company-scoped immutable concept profile versions', () => {
  it('stores INTERNAL snapshots, retries idempotently, and preserves divergent scopes and IDs', async () => {
    const firstDocument = {
      format: 'moonwitness-concept-profiles/v1',
      profiles: [profile('synthetic-a')],
    };
    const [first] = await storeConceptProfiles(db, input(firstDocument));
    const [retry] = await storeConceptProfiles(db, input(firstDocument));
    const [revision] = await storeConceptProfiles(
      db,
      input({
        format: 'moonwitness-concept-profiles/v1',
        profiles: [profile('synthetic-a', 'A different synthetic scope.')],
      })
    );
    const [divergent] = await storeConceptProfiles(
      db,
      input({
        format: 'moonwitness-concept-profiles/v1',
        profiles: [profile('synthetic-b', 'Another synthetic scope.')],
      })
    );

    expect(first).toMatchObject({ version: 1, visibility: 'INTERNAL', idempotent: false });
    expect(retry).toMatchObject({ version: 1, digest: first.digest, idempotent: true });
    expect(revision).toMatchObject({ version: 2, idempotent: false });
    expect(divergent).toMatchObject({ profileId: 'mw:concept-profile:synthetic-b', version: 1 });
    expect(await db('knowledge_concept_profile_versions')).toHaveLength(3);
    await expect(
      db('knowledge_concept_profile_versions').where({ id: 1 }).update({ profile_json: '{}' })
    ).rejects.toThrow();
    await expect(
      db('knowledge_concept_profile_versions').where({ id: 1 }).delete()
    ).rejects.toThrow();
  });

  it('reads only active company membership and revalidates integrity and schema', async () => {
    const document = {
      format: 'moonwitness-concept-profiles/v1',
      profiles: [profile('read-synthetic')],
    };
    await storeConceptProfiles(db, input(document));
    const read = await readConceptProfileVersion(db, {
      authenticatedReader: { userId, companyId, role: 'superadmin' },
      corpusRootDirectory,
      profileId: 'mw:concept-profile:read-synthetic',
    });
    expect(read).toMatchObject({ version: 1, visibility: 'INTERNAL', document });
    await expect(
      readConceptProfileVersion(db, {
        authenticatedReader: { userId, companyId: companyId + 1, role: 'superadmin' },
        corpusRootDirectory,
        profileId: 'mw:concept-profile:read-synthetic',
      })
    ).rejects.toThrow(/unavailable in this company context/u);
    await expect(
      db('knowledge_concept_profile_versions')
        .where({ profile_id: 'mw:concept-profile:read-synthetic' })
        .update({ profile_json: '{}' })
    ).rejects.toThrow(/append-only/u);
  });

  it('rejects schema-invalid input and inactive membership', async () => {
    await expect(
      storeConceptProfiles(db, input({ format: 'wrong', profiles: [] }))
    ).rejects.toThrow(/schema check/u);
    await db('company_memberships')
      .where({ user_id: userId, company_id: companyId })
      .update({ active: false });
    await expect(
      storeConceptProfiles(
        db,
        input({ format: 'moonwitness-concept-profiles/v1', profiles: [profile('inactive')] })
      )
    ).rejects.toThrow(/unavailable in this company context/u);
  });

  it('fails closed when an accepted profile lacks an exact profile-digest review binding', async () => {
    const accepted = profile('unreviewed-accepted');
    accepted.interpretations[0] = {
      claim_type: 'human_interpretation',
      text: 'Synthetic accepted claim must be backed by current review.',
      status: 'accepted',
      evidence_ids: ['mw:evidence:synthetic-missing'],
    };
    await expect(
      storeConceptProfiles(
        db,
        input({ format: 'moonwitness-concept-profiles/v1', profiles: [accepted] })
      )
    ).rejects.toThrow(/exact profile-digest review binding/u);
    expect(await db('knowledge_concept_profile_versions')).toHaveLength(0);
  });

  it('rejects duplicate profile IDs before persisting any profile from the document', async () => {
    await expect(
      storeConceptProfiles(
        db,
        input({
          format: 'moonwitness-concept-profiles/v1',
          profiles: [profile('duplicate-id'), profile('duplicate-id', 'Divergent scope.')],
        })
      )
    ).rejects.toThrow(/duplicate profile IDs/u);
    expect(await db('knowledge_concept_profile_versions')).toHaveLength(0);
  });

  it('rejects missing evidence references even on candidate interpretations', async () => {
    const candidate = profile('candidate-missing-evidence');
    candidate.interpretations[0] = {
      claim_type: 'human_interpretation',
      text: 'Synthetic candidate with a dangling citation.',
      status: 'candidate',
      evidence_ids: ['mw:evidence:synthetic-missing-candidate'],
    };
    await expect(
      storeConceptProfiles(
        db,
        input({ format: 'moonwitness-concept-profiles/v1', profiles: [candidate] })
      )
    ).rejects.toThrow(/evidence is missing or unreadable/u);
    expect(await db('knowledge_concept_profile_versions')).toHaveLength(0);
  });
});
