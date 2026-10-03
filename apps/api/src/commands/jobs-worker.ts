import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../database/knex.js';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest, registerJobHandler, runWorkerLoop } from '@moonwitness/jobs';

const db = createDatabase();
const stop = new AbortController();
const stopWorker = () => stop.abort();
process.once('SIGINT', stopWorker);
process.once('SIGTERM', stopWorker);

try {
  await installAddons(db, [baseManifest, jobsManifest]);
  const handlerModule = process.env.JOB_HANDLERS_MODULE;
  if (handlerModule) await import(pathToFileURL(path.resolve(handlerModule)).href);
  const unregister = registerJobHandler({
    name: 'example.noop',
    version: 1,
    parse(payload: unknown): unknown {
      return payload;
    },
    async run() {
      return { completed: true };
    },
  });
  try {
    await runWorkerLoop({ workerId: `moonwitness-${randomUUID()}` }, stop.signal);
  } finally {
    unregister();
  }
} finally {
  await db.destroy();
}
