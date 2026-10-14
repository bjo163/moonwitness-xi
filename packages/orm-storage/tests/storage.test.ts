import { mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LocalFileAttachmentStorage,
  reconcileLocalAttachmentStorage,
  type AttachmentReference,
} from '../src/index.js';

const keyA = '11111111-1111-4111-8111-111111111111';
const keyB = '22222222-2222-4222-8222-222222222222';
const keyC = '33333333-3333-4333-8333-333333333333';
const directories: string[] = [];

async function storageFixture(): Promise<LocalFileAttachmentStorage> {
  const directory = await mkdtemp(path.join(tmpdir(), 'moonwitness-storage-'));
  directories.push(directory);
  return new LocalFileAttachmentStorage(directory);
}

async function* references(
  items: readonly AttachmentReference[]
): AsyncIterable<AttachmentReference> {
  yield* items;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('LocalFileAttachmentStorage', () => {
  it('writes atomically with generated-safe keys and reads legacy UUID files', async () => {
    const storage = await storageFixture();
    const content = Buffer.from('example bytes');
    await expect(storage.put(keyA, content)).resolves.toMatchObject({
      key: keyA,
      sizeBytes: content.length,
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    await expect(storage.get(keyA)).resolves.toEqual(content);
    await expect(storage.get('../unsafe')).rejects.toThrow('Invalid attachment storage key');
    const listed: string[] = [];
    for await (const object of storage.list()) listed.push(object.key);
    expect(listed).toEqual([keyA]);
  });

  it.skipIf(process.platform === 'win32')(
    'refuses UUID symlinks instead of exposing files outside the attachment directory',
    async () => {
      const storage = await storageFixture();
      const outside = path.join(path.dirname(storage.directory), 'private-target');
      const content = Buffer.from('outside attachment directory');
      await writeFile(outside, content);
      directories.push(outside);
      await symlink(outside, path.join(storage.directory, keyA));

      await expect(storage.get(keyA)).rejects.toThrow('Attachment object must be a regular file');
      await expect(storage.getWithMetadata(keyA)).rejects.toThrow(
        'Attachment object must be a regular file'
      );
      expect(await readdir(storage.directory)).toContain(keyA);
      await expect(readFile(outside)).resolves.toEqual(content);
    }
  );

  it('reconciles metadata snapshots read-only and requires a stale grace period for deletion', async () => {
    const storage = await storageFixture();
    const referenced = Buffer.from('present object');
    await storage.put(keyA, referenced);
    await storage.put(keyB, Buffer.from('unreferenced object'));
    await utimes(path.join(storage.directory, keyA), new Date(0), new Date(0));
    await utimes(path.join(storage.directory, keyB), new Date(0), new Date(0));
    const result = await reconcileLocalAttachmentStorage(
      storage,
      references([
        {
          storageKey: keyA,
          sizeBytes: referenced.length,
          checksum: '0'.repeat(64),
        },
        { storageKey: keyC, sizeBytes: 12 },
      ]),
      { apply: false, olderThan: new Date() }
    );
    expect(result).toMatchObject({
      checked: 2,
      missing: [keyC],
      corrupt: [keyA],
      orphaned: [keyB],
      deleted: [],
      failures: [],
    });
    await expect(storage.get(keyB)).resolves.toEqual(Buffer.from('unreferenced object'));

    const damaged = await storage.get(keyA);
    if (!damaged) throw new Error('Expected an existing attachment object');
    await writeFile(path.join(storage.directory, keyA), Buffer.from('damaged bytes'));
    const integrityReport = await reconcileLocalAttachmentStorage(
      storage,
      references([{ storageKey: keyA, sizeBytes: damaged.length }]),
      { apply: false, olderThan: new Date() }
    );
    expect(integrityReport.corrupt).toContain(keyA);

    const staleKey = keyB;
    await expect(
      reconcileLocalAttachmentStorage(storage, references([]), {
        apply: true,
        olderThan: new Date(Date.now() - 60_000),
        limit: 1,
      })
    ).resolves.toMatchObject({ checked: 1, deleted: [staleKey], orphaned: [staleKey] });
    await expect(storage.get(staleKey)).resolves.toBeNull();
    await expect(storage.get(keyA)).resolves.toEqual(Buffer.from('damaged bytes'));
  });

  it('ignores temporary and unknown files when enumerating legacy directory contents', async () => {
    const storage = await storageFixture();
    await writeFile(path.join(storage.directory, 'keep.tmp'), 'temp');
    await writeFile(path.join(storage.directory, 'not-a-uuid'), 'unknown');
    await storage.put(keyA, Buffer.from('managed'));
    await utimes(path.join(storage.directory, keyA), new Date(0), new Date(0));
    const names = await readdir(storage.directory);
    expect(names).toEqual([keyA, 'keep.tmp', 'not-a-uuid']);
    const stale = new Date(Date.now() - 60_000);
    expect(stale.getTime()).toBeGreaterThan(0);
    await expect(storage.get(keyA)).resolves.toEqual(Buffer.from('managed'));
  });

  it('bounds directory traversal and reports when reconciliation needs another batch', async () => {
    const storage = await storageFixture();
    for (const key of [keyA, keyB, keyC]) {
      await storage.put(key, Buffer.from(key));
      await utimes(path.join(storage.directory, key), new Date(0), new Date(0));
    }

    const firstBatch = await reconcileLocalAttachmentStorage(storage, references([]), {
      apply: true,
      olderThan: new Date(),
      limit: 2,
    });
    expect(firstBatch).toMatchObject({
      scannedEntries: 3,
      scanTruncated: true,
      checked: 2,
    });
    expect(firstBatch.deleted).toHaveLength(2);
    const remainingAfterFirstBatch: string[] = [];
    for await (const object of storage.list()) remainingAfterFirstBatch.push(object.key);
    expect(remainingAfterFirstBatch).toHaveLength(1);

    const secondBatch = await reconcileLocalAttachmentStorage(storage, references([]), {
      apply: true,
      olderThan: new Date(),
      limit: 2,
    });
    expect(secondBatch).toMatchObject({
      scannedEntries: 1,
      scanTruncated: false,
      checked: 1,
    });
    expect(secondBatch.deleted).toEqual(remainingAfterFirstBatch);
  });

  it('rejects invalid reconciliation cutoffs and unbounded limits', async () => {
    const storage = await storageFixture();
    await expect(
      reconcileLocalAttachmentStorage(storage, references([]), {
        apply: false,
        olderThan: new Date(Number.NaN),
      })
    ).rejects.toThrow('olderThan must be a valid date');
    await expect(
      reconcileLocalAttachmentStorage(storage, references([]), {
        apply: false,
        olderThan: new Date(),
        limit: 10001,
      })
    ).rejects.toThrow('limit must be an integer from 1 to 10000');
  });

  it('refuses destructive reconciliation with a future cutoff', async () => {
    const storage = await storageFixture();
    await storage.put(keyA, Buffer.from('fresh object'));

    await expect(
      reconcileLocalAttachmentStorage(storage, references([]), {
        apply: true,
        olderThan: new Date(Date.now() + 60_000),
      })
    ).rejects.toThrow('olderThan must not be in the future when apply is enabled');
    await expect(storage.get(keyA)).resolves.toEqual(Buffer.from('fresh object'));
  });
});
