import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalizeJson,
  createKnowledgeSnapshot,
  hashCanonicalJson,
} from '@moonwitness/knowledge';
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

async function release(
  root: string,
  version: string,
  marker: string
): Promise<DatasetReleaseInput> {
  const records = [{ marker }];
  const snapshot = createKnowledgeSnapshot({ records, aliases: [], sourceArtifacts: [] });
  const snapshotPath = `snapshots/${version}-${marker}`;
  const directory = path.join(root, snapshotPath);
  await mkdir(path.join(directory, 'records'), { recursive: true });
  await mkdir(path.join(directory, 'aliases'), { recursive: true });
  await mkdir(path.join(directory, 'source-artifacts'), { recursive: true });
  await writeFile(path.join(directory, 'snapshot.json'), `${canonicalizeJson(snapshot)}\n`);
  await writeFile(
    path.join(directory, 'records', `${hashCanonicalJson(records[0])}.json`),
    `${canonicalizeJson(records[0])}\n`
  );
  return {
    datasetId: 'synthetic-corpus',
    version,
    createdAt: '2026-10-16T10:00:00.000Z',
    ontologyVersion: '1.0.0',
    corpusVersion: '1.0.0',
    snapshotPath,
    snapshot,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('immutable dataset releases and active pointers', () => {
  it('stores deterministic immutable release manifests without activating them', async () => {
    const root = await storeRoot();
    const input = await release(root, '1.0.0', 'a');
    const first = await createDatasetRelease(root, input);
    const repeated = await createDatasetRelease(root, input);

    expect(repeated).toEqual(first);
    expect(first.previousReleaseId).toBeNull();
    expect(await readActiveDatasetRelease(root, input.datasetId)).toBeNull();
    expect(await readdir(path.join(root, 'datasets', input.datasetId, 'releases'))).toEqual([
      `${first.releaseId}.json`,
    ]);
  });

  it('does not let a semantic dataset version be rebound to different content', async () => {
    const root = await storeRoot();
    await createDatasetRelease(root, await release(root, '1.0.0', 'a'));
    await expect(createDatasetRelease(root, await release(root, '1.0.0', 'b'))).rejects.toThrow(
      /immutable/
    );
  });

  it('activates only an existing intact release and can roll back to an earlier release', async () => {
    const root = await storeRoot();
    const first = await createDatasetRelease(root, await release(root, '1.0.0', 'a'));
    const activeFirst = await activateDatasetRelease(
      root,
      first.datasetId,
      first.releaseId,
      '2026-10-16T10:01:00.000Z'
    );
    const second = await createDatasetRelease(root, await release(root, '1.1.0', 'b'));
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
    const first = await createDatasetRelease(root, await release(root, '1.0.0', 'a'));
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
    const invalidVersion = await release(root, '1.0.0', 'a');
    await expect(createDatasetRelease(root, { ...invalidVersion, version: '1.0' })).rejects.toThrow(
      /semantic/
    );
    await expect(
      createDatasetRelease(root, {
        ...invalidVersion,
        snapshot: { ...invalidVersion.snapshot, sha256: 'bad' },
      })
    ).rejects.toThrow(/snapshot/);
    await expect(readdir(path.join(root, 'datasets'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
