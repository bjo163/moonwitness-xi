import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../database/knex.js';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest, registerJobHandler, runWorkerLoop } from '@moonwitness/jobs';
import { readWorkerHealthPort, startWorkerHealthServer } from './worker-health.js';

const db = createDatabase();
const stop = new AbortController();
let workerHealth: Awaited<ReturnType<typeof startWorkerHealthServer>> = null;
const stopWorker = () => {
  workerHealth?.setReady(false);
  stop.abort();
};
process.once('SIGINT', stopWorker);
process.once('SIGTERM', stopWorker);

try {
  await installAddons(db, [baseManifest, jobsManifest]);
  const handlerModule = process.env.JOB_HANDLERS_MODULE;
  if (handlerModule) await import(pathToFileURL(path.resolve(handlerModule)).href);
  if (!stop.signal.aborted) {
    workerHealth = await startWorkerHealthServer({
      db,
      host: process.env.WORKER_HEALTH_HOST || '127.0.0.1',
      name: 'jobs-worker',
      port: readWorkerHealthPort(process.env.JOBS_WORKER_HEALTH_PORT, 'JOBS_WORKER_HEALTH_PORT'),
    });
  }
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
  await workerHealth?.close();
  await db.destroy();
}
