import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createDatabase } from '../database/knex.js';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import {
  manifest as storageManifest,
  LocalFileAttachmentStorage,
  reconcileLocalAttachmentStorage,
  type AttachmentReference,
} from '@moonwitness/orm-storage';
import { config } from '../config/env.js';

export interface AttachmentReconcileOptions {
  readonly apply: boolean;
  readonly olderThan: Date;
  readonly limit: number;
}

export async function reconcileAttachments(options: AttachmentReconcileOptions) {
  const db = createDatabase();
  try {
    await installAddons(db, [baseManifest, storageManifest]);
    async function* references(): AsyncIterable<AttachmentReference> {
      const rows = await db('attachments').select('storage_key', 'size_bytes', 'checksum');
      for (const row of rows) {
        if (typeof row.storage_key !== 'string' || typeof row.size_bytes !== 'number') continue;
        yield {
          storageKey: row.storage_key,
          sizeBytes: row.size_bytes,
          ...(typeof row.checksum === 'string' ? { checksum: row.checksum } : {}),
        };
      }
    }
    return await reconcileLocalAttachmentStorage(
      new LocalFileAttachmentStorage(config.attachmentStorageDirectory),
      references(),
      options
    );
  } finally {
    await db.destroy();
  }
}

function parseOptions(args: readonly string[]): AttachmentReconcileOptions {
  const apply = args.includes('--apply');
  const cutoffArgument = args.find((argument) => argument.startsWith('--older-than='));
  const limitArgument = args.find((argument) => argument.startsWith('--limit='));
  const cutoff = cutoffArgument?.slice('--older-than='.length);
  if (apply && !cutoff) throw new Error('--apply requires an explicit --older-than ISO timestamp');
  const olderThan = cutoff ? new Date(cutoff) : new Date(0);
  if (!Number.isFinite(olderThan.getTime()))
    throw new Error('--older-than must be a valid ISO timestamp');
  const rawLimit = limitArgument?.slice('--limit='.length);
  const limit = rawLimit ? Number(rawLimit) : 1000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
    throw new Error('--limit must be an integer from 1 to 10000');
  return { apply, olderThan, limit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await reconcileAttachments(parseOptions(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Attachment reconciliation failed'}\n`
    );
    process.exitCode = 1;
  }
}
