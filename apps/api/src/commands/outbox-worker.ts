import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../database/knex.js';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest, runOutboxLoop } from '@moonwitness/jobs';
import {
  manifest as notificationAddon,
  registerNotificationOutboxConsumer,
} from '@moonwitness/orm-notification';
import { readWorkerHealthPort, startWorkerHealthServer } from './worker-health.js';

const db = createDatabase();
const stop = new AbortController();
let workerHealth: Awaited<ReturnType<typeof startWorkerHealthServer>> = null;
let unregisterNotificationConsumer = () => {};
const stopWorker = () => {
  workerHealth?.setReady(false);
  stop.abort();
};
process.once('SIGINT', stopWorker);
process.once('SIGTERM', stopWorker);

try {
  await installAddons(db, [baseManifest, jobsManifest, notificationAddon]);
  unregisterNotificationConsumer = registerNotificationOutboxConsumer();
  const consumerModule = process.env.OUTBOX_HANDLERS_MODULE;
  if (consumerModule) await import(pathToFileURL(path.resolve(consumerModule)).href);
  if (!stop.signal.aborted) {
    workerHealth = await startWorkerHealthServer({
      db,
      host: process.env.WORKER_HEALTH_HOST || '127.0.0.1',
      name: 'outbox-worker',
      port: readWorkerHealthPort(
        process.env.OUTBOX_WORKER_HEALTH_PORT,
        'OUTBOX_WORKER_HEALTH_PORT'
      ),
    });
  }
  await runOutboxLoop(`moonwitness-outbox-${randomUUID()}`, stop.signal);
} finally {
  unregisterNotificationConsumer();
  await workerHealth?.close();
  await db.destroy();
}
