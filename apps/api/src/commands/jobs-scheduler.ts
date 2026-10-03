import { createDatabase } from '../database/knex.js';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest, runSchedulerLoop } from '@moonwitness/jobs';

const db = createDatabase();
const stop = new AbortController();
const stopScheduler = () => stop.abort();
process.once('SIGINT', stopScheduler);
process.once('SIGTERM', stopScheduler);

try {
  await installAddons(db, [baseManifest, jobsManifest]);
  await runSchedulerLoop(stop.signal);
} finally {
  await db.destroy();
}
