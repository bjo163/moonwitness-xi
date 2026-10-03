import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../database/knex.js';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest, runOutboxLoop } from '@moonwitness/jobs';

const db = createDatabase();
const stop = new AbortController();
const stopWorker = () => stop.abort();
process.once('SIGINT', stopWorker);
process.once('SIGTERM', stopWorker);

try {
  await installAddons(db, [baseManifest, jobsManifest]);
  const consumerModule = process.env.OUTBOX_HANDLERS_MODULE;
  if (consumerModule) await import(pathToFileURL(path.resolve(consumerModule)).href);
  await runOutboxLoop(`moonwitness-outbox-${randomUUID()}`, stop.signal);
} finally {
  await db.destroy();
}
