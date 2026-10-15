import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPrivateArchiveImportManifest,
  validatePrivateArchiveImportManifest,
  type PrivateArchiveImportConsent,
  type PrivateArchiveImportRequest,
} from '../src/index.js';

const temporaryRoots: string[] = [];
const sourceBytes = Buffer.from('synthetic private archive; no user data', 'utf8');
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');

async function rootFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moonwitness-private-archive-'));
  temporaryRoots.push(root);
  await writeFile(path.join(root, 'archive.json'), sourceBytes);
  return root;
}

function consent(
  overrides: Partial<PrivateArchiveImportConsent> = {}
): PrivateArchiveImportConsent {
  return {
    state: 'granted',
    sourceKind: 'account_export',
    sourcePath: 'archive.json',
    sourceSha256,
    subjectRef: 'urn:synthetic:subject:1',
    authorizedByRef: 'urn:synthetic:owner:1',
    authorizedAt: '2026-10-15T10:00:00.000Z',
    dataCategories: ['conversation_text'],
    purposes: ['private_research'],
    authorizedReviewers: ['urn:synthetic:reviewer:1'],
    intendedDerivedUses: ['local_review'],
    publicationScope: 'none',
    withdrawalPath: 'urn:synthetic:withdrawal:1',
    correctionPath: 'urn:synthetic:correction:1',
    decisionRef: 'urn:synthetic:consent-decision:1',
    ...overrides,
  };
}

function request(rootDirectory: string, overrides: Partial<PrivateArchiveImportRequest> = {}) {
  return {
    rootDirectory,
    sourcePath: 'archive.json',
    manifestPath: 'manifests/intake.json',
    manifestId: 'synthetic-intake-v1',
    sourceKind: 'account_export',
    exportedAt: '2026-10-14T09:00:00.000Z',
    recordedAt: '2026-10-15T10:30:00.000Z',
    consent: consent(),
    ...overrides,
  } satisfies PrivateArchiveImportRequest;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('private archive import manifest', () => {
  it('records only source metadata and scoped consent for a local synthetic archive', async () => {
    const root = await rootFixture();
    const manifest = await createPrivateArchiveImportManifest(request(root));
    const serialized = await readFile(path.join(root, 'manifests/intake.json'), 'utf8');

    expect(manifest.source).toEqual({
      kind: 'account_export',
      path: 'archive.json',
      exportedAt: '2026-10-14T09:00:00.000Z',
      sha256: sourceSha256,
      byteLength: sourceBytes.byteLength,
    });
    expect(manifest.consent.sourceSha256).toBe(sourceSha256);
    expect(serialized).not.toContain(sourceBytes.toString('utf8'));
    expect(JSON.parse(serialized)).toEqual(manifest);
    expect(validatePrivateArchiveImportManifest(manifest)).toEqual({ valid: true, issues: [] });
  });

  it('denies missing, denied, or withdrawn consent before opening the source', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'moonwitness-private-denial-'));
    temporaryRoots.push(root);
    await expect(
      createPrivateArchiveImportManifest(
        request(root, { consent: undefined as unknown as PrivateArchiveImportConsent })
      )
    ).rejects.toThrow('granted');
    for (const state of ['denied', 'withdrawn'] as const) {
      await expect(
        createPrivateArchiveImportManifest(request(root, { consent: consent({ state }) }))
      ).rejects.toThrow('granted');
    }
    await expect(readdir(path.join(root, 'manifests'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('denies source path and checksum mismatches without creating a manifest', async () => {
    const root = await rootFixture();
    await expect(
      createPrivateArchiveImportManifest(
        request(root, { consent: consent({ sourcePath: 'other.json' }) })
      )
    ).rejects.toThrow('exact local source path and kind');
    await expect(
      createPrivateArchiveImportManifest(
        request(root, { consent: consent({ sourceSha256: '0'.repeat(64) }) })
      )
    ).rejects.toThrow('checksum');
    await expect(readdir(path.join(root, 'manifests'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects remote, absolute, and parent source paths', async () => {
    const root = await rootFixture();
    for (const sourcePath of [
      'https://example.test/export.json',
      '../outside.json',
      'C:/private.json',
    ]) {
      await expect(
        createPrivateArchiveImportManifest(
          request(root, { sourcePath, consent: consent({ sourcePath }) })
        )
      ).rejects.toThrow();
    }
    await expect(readdir(path.join(root, 'manifests'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never overwrites an existing manifest', async () => {
    const root = await rootFixture();
    const first = await createPrivateArchiveImportManifest(request(root));
    const before = await readFile(path.join(root, 'manifests/intake.json'), 'utf8');
    await expect(createPrivateArchiveImportManifest(request(root))).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(await readFile(path.join(root, 'manifests/intake.json'), 'utf8')).toBe(before);
    expect(first.manifestId).toBe('synthetic-intake-v1');
  });

  it('rejects unbound manifest declarations and unknown fields', () => {
    const value = {
      format: 'moonwitness-private-archive-import/v1',
      manifestId: 'fixture',
      recordedAt: '2026-10-15T10:30:00.000Z',
      source: {
        kind: 'account_export',
        path: 'archive.json',
        exportedAt: '2026-10-14T09:00:00.000Z',
        sha256: sourceSha256,
        byteLength: sourceBytes.byteLength,
      },
      consent: consent({ sourceSha256: '0'.repeat(64) }),
      unexpected: true,
    };
    const result = validatePrivateArchiveImportManifest(value);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain('/unexpected');
    expect(result.issues.map((issue) => issue.path)).toContain('/consent/sourceSha256');
  });
});
