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
import {
  manifest as integrationAddon,
  registerWebhookOutboxConsumer,
} from '@moonwitness/orm-integration';

const db = createDatabase();
const stop = new AbortController();
let workerHealth: Awaited<ReturnType<typeof startWorkerHealthServer>> = null;
let unregisterNotificationConsumer = () => {};
let unregisterWebhookConsumer = () => {};
const stopWorker = () => {
  workerHealth?.setReady(false);
  stop.abort();
};
process.once('SIGINT', stopWorker);
process.once('SIGTERM', stopWorker);

try {
  await installAddons(db, [baseManifest, jobsManifest, notificationAddon, integrationAddon]);
  unregisterNotificationConsumer = registerNotificationOutboxConsumer();
  unregisterWebhookConsumer = registerWebhookOutboxConsumer(async (secretRef, companyId) => {
    if (!secretRef.startsWith(`MW_WEBHOOK_SECRET_C${companyId}_`)) return null;
    if (!/^MW_WEBHOOK_SECRET_C[1-9][0-9]*_[A-Z0-9_]{1,100}$/u.test(secretRef)) return null;
    return process.env[secretRef] ?? null;
  });
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
  unregisterWebhookConsumer();
  await workerHealth?.close();
  await db.destroy();
}
