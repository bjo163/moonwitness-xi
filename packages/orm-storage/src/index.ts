import { createHash, randomUUID } from 'node:crypto';
import { defineAddon } from '@moonwitness/orm';
import {
  mkdir,
  open,
  opendir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface StoredObjectMetadata {
  readonly key: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface AttachmentStorage {
  put(key: string, content: Uint8Array): Promise<StoredObjectMetadata>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  list(): AsyncIterable<StoredObjectMetadata>;
}

function validateKey(key: string): string {
  if (!UUID_PATTERN.test(key)) throw new Error('Invalid attachment storage key');
  return key.toLowerCase();
}

function validateScanOptions(olderThan: Date, limit: number): void {
  if (!Number.isFinite(olderThan.getTime())) throw new Error('olderThan must be a valid date');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
    throw new Error('limit must be an integer from 1 to 10000');
}

function objectMetadata(key: string, content: Uint8Array): StoredObjectMetadata {
  return {
    key: validateKey(key),
    sizeBytes: content.byteLength,
    checksum: createHash('sha256').update(content).digest('hex'),
  };
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Local provider compatible with legacy attachments stored directly under ATTACHMENT_STORAGE_DIR. */
export class LocalFileAttachmentStorage implements AttachmentStorage {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = path.resolve(directory);
  }

  private objectPath(key: string): string {
    return path.join(this.directory, validateKey(key));
  }

  async put(key: string, content: Uint8Array): Promise<StoredObjectMetadata> {
    const target = this.objectPath(key);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return objectMetadata(key, content);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.objectPath(key));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async getWithMetadata(key: string): Promise<StoredObjectMetadata | null> {
    const content = await this.get(key);
    return content ? objectMetadata(key, content) : null;
  }

  async delete(key: string): Promise<void> {
    await rm(this.objectPath(key), { force: true });
  }

  async *list(): AsyncIterable<StoredObjectMetadata> {
    let entries;
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !UUID_PATTERN.test(entry.name)) continue;
      const key = entry.name.toLowerCase();
      const objectPath = this.objectPath(key);
      const [content, details] = await Promise.all([readFile(objectPath), stat(objectPath)]);
      yield { ...objectMetadata(key, content), sizeBytes: details.size };
    }
  }

  async scanStale(olderThan: Date, limit: number): Promise<StaleObjectScan> {
    validateScanOptions(olderThan, limit);
    const objects: StoredObjectMetadata[] = [];
    let directory;
    try {
      directory = await opendir(this.directory);
    } catch (error) {
      if (isMissing(error)) return { objects, scannedEntries: 0, truncated: false };
      throw error;
    }

    let scannedEntries = 0;
    let truncated = false;
    const entries = directory[Symbol.asyncIterator]();
    try {
      while (scannedEntries < limit) {
        const next = await entries.next();
        if (next.done) break;
        scannedEntries += 1;
        const entry = next.value;
        if (!entry.isFile() || !UUID_PATTERN.test(entry.name)) continue;
        const key = entry.name.toLowerCase();
        const objectPath = this.objectPath(key);
        const details = await stat(objectPath);
        if (details.mtimeMs > olderThan.getTime()) continue;

        const file = await open(objectPath, 'r');
        const hash = createHash('sha256');
        try {
          for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
        } finally {
          await file.close();
        }
        objects.push({ key, sizeBytes: details.size, checksum: hash.digest('hex') });
      }

      if (scannedEntries === limit) truncated = !(await entries.next()).done;
    } finally {
      await directory.close().catch(() => undefined);
    }

    return { objects, scannedEntries, truncated };
  }
}

export interface AttachmentReference {
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly checksum?: string | null;
}

export interface StaleObjectScan {
  readonly objects: readonly StoredObjectMetadata[];
  readonly scannedEntries: number;
  readonly truncated: boolean;
}

export interface ReconcileResult {
  readonly checked: number;
  readonly scannedEntries: number;
  readonly scanTruncated: boolean;
  readonly missing: readonly string[];
  readonly corrupt: readonly string[];
  readonly orphaned: readonly string[];
  readonly deleted: readonly string[];
  readonly failures: readonly string[];
}

export interface ReconcileOptions {
  readonly apply: boolean;
  readonly olderThan: Date;
  readonly limit?: number;
}

/** Provider primitives are independent of the optional base attachment model. */
export const manifest = defineAddon({
  name: 'orm-storage',
  version: '1.0.0',
  models: [],
});

export const storageManifest = manifest;

/** Read-only by default; only the local provider supports guarded stale-object cleanup. */
export async function reconcileLocalAttachmentStorage(
  storage: LocalFileAttachmentStorage,
  references: AsyncIterable<AttachmentReference>,
  options: ReconcileOptions
): Promise<ReconcileResult> {
  const limit = options.limit ?? 1000;
  validateScanOptions(options.olderThan, limit);

  const byKey = new Map<string, AttachmentReference>();
  for await (const reference of references) byKey.set(validateKey(reference.storageKey), reference);
  const missing: string[] = [];
  const corrupt: string[] = [];
  let referenceCount = 0;
  for (const reference of byKey.values()) {
    referenceCount += 1;
    if (referenceCount > limit * 100)
      throw new Error('Attachment reconciliation reference snapshot exceeds the safe bound');
    const object = await storage.getWithMetadata(reference.storageKey);
    if (!object) {
      missing.push(reference.storageKey);
    } else if (
      object.sizeBytes !== reference.sizeBytes ||
      (reference.checksum && object.checksum.toLowerCase() !== reference.checksum.toLowerCase())
    ) {
      corrupt.push(reference.storageKey);
    }
  }

  const orphaned: string[] = [];
  const deleted: string[] = [];
  const failures: string[] = [];
  const scan = await storage.scanStale(options.olderThan, limit);
  const checked = scan.objects.length;
  for (const object of scan.objects) {
    const reference = byKey.get(object.key);
    if (reference) {
      continue;
    }
    orphaned.push(object.key);
    if (!options.apply) continue;
    try {
      await storage.delete(object.key);
      deleted.push(object.key);
    } catch {
      failures.push(object.key);
    }
  }
  return {
    checked,
    scannedEntries: scan.scannedEntries,
    scanTruncated: scan.truncated,
    missing,
    corrupt,
    orphaned,
    deleted,
    failures,
  };
}
