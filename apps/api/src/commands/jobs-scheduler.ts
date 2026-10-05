import { createDatabase } from '../database/knex.js';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest, runSchedulerLoop } from '@moonwitness/jobs';
import { readWorkerHealthPort, startWorkerHealthServer } from './worker-health.js';
import { manifest as workflowAddon } from '@moonwitness/orm-workflow';

const db = createDatabase();
const stop = new AbortController();
let workerHealth: Awaited<ReturnType<typeof startWorkerHealthServer>> = null;
const stopScheduler = () => {
  workerHealth?.setReady(false);
  stop.abort();
};
process.once('SIGINT', stopScheduler);
process.once('SIGTERM', stopScheduler);

try {
  await installAddons(db, [baseManifest, jobsManifest, workflowAddon]);
  if (!stop.signal.aborted) {
    workerHealth = await startWorkerHealthServer({
      db,
      host: process.env.WORKER_HEALTH_HOST || '127.0.0.1',
      name: 'jobs-scheduler',
      port: readWorkerHealthPort(
        process.env.JOBS_SCHEDULER_HEALTH_PORT,
        'JOBS_SCHEDULER_HEALTH_PORT'
      ),
    });
  }
  await runSchedulerLoop(stop.signal);
} finally {
  await workerHealth?.close();
  await db.destroy();
}
