import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activateDatasetRelease,
  createDatasetRelease,
  readActiveDatasetRelease,
  type DatasetReleaseInput,
} from '../src/index.js';

const roots: string[] = [];

async function storeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'moonwitness-dataset-release-'));
  roots.push(root);
  return root;
}

function release(version: string, digest: string): DatasetReleaseInput {
  return {
    datasetId: 'synthetic-corpus',
    version,
    createdAt: '2026-10-16T10:00:00.000Z',
    ontologyVersion: '1.0.0',
    corpusVersion: '1.0.0',
    snapshot: {
      format: 'moonwitness-knowledge-snapshot/v1',
      canonicalization: 'RFC8785',
      hashAlgorithm: 'sha256',
      sha256: digest.repeat(64),
    },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('immutable dataset releases and active pointers', () => {
  it('stores deterministic immutable release manifests without activating them', async () => {
    const root = await storeRoot();
    const input = release('1.0.0', 'a');
    const first = await createDatasetRelease(root, input);
    const repeated = await createDatasetRelease(root, input);

    expect(repeated).toEqual(first);
    expect(first.previousReleaseId).toBeNull();
    expect(await readActiveDatasetRelease(root, input.datasetId)).toBeNull();
    expect(await readdir(path.join(root, 'datasets', input.datasetId, 'releases'))).toEqual([
      `${first.releaseId}.json`,
    ]);
  });

  it('activates only an existing intact release and can roll back to an earlier release', async () => {
    const root = await storeRoot();
    const first = await createDatasetRelease(root, release('1.0.0', 'a'));
    const activeFirst = await activateDatasetRelease(
      root,
      first.datasetId,
      first.releaseId,
      '2026-10-16T10:01:00.000Z'
    );
    const second = await createDatasetRelease(root, release('1.1.0', 'b'));
    expect(second.previousReleaseId).toBe(first.releaseId);
    await activateDatasetRelease(
      root,
      second.datasetId,
      second.releaseId,
      '2026-10-16T10:02:00.000Z'
    );

    const rolledBack = await activateDatasetRelease(
      root,
      first.datasetId,
      first.releaseId,
      '2026-10-16T10:03:00.000Z'
    );
    expect(rolledBack.releaseId).toBe(activeFirst.releaseId);
    expect(await readActiveDatasetRelease(root, first.datasetId)).toEqual(rolledBack);
    expect(
      JSON.parse(
        await readFile(
          path.join(root, 'datasets', first.datasetId, 'releases', `${first.releaseId}.json`),
          'utf8'
        )
      )
    ).toEqual(first);
  });

  it('leaves the active pointer unchanged when an activation target is missing', async () => {
    const root = await storeRoot();
    const first = await createDatasetRelease(root, release('1.0.0', 'a'));
    const active = await activateDatasetRelease(
      root,
      first.datasetId,
      first.releaseId,
      '2026-10-16T10:01:00.000Z'
    );
    await expect(
      activateDatasetRelease(root, first.datasetId, 'f'.repeat(64), '2026-10-16T10:02:00.000Z')
    ).rejects.toThrow();
    expect(await readActiveDatasetRelease(root, first.datasetId)).toEqual(active);
  });

  it('rejects invalid versions and malformed snapshot digests before writing files', async () => {
    const root = await storeRoot();
    await expect(createDatasetRelease(root, { ...release('1.0', 'a') })).rejects.toThrow(
      /semantic/
    );
    await expect(
      createDatasetRelease(root, {
        ...release('1.0.0', 'a'),
        snapshot: { ...release('1.0.0', 'a').snapshot, sha256: 'bad' },
      })
    ).rejects.toThrow(/snapshot/);
    expect(await readdir(root)).toEqual([]);
  });
});
