import { stderr, env, argv } from 'node:process';
import { exit } from 'node:process';
import { URL } from 'node:url';

const requiredJobs = ['quality', 'integration', 'containers', 'automation'];

export const isCiGatePassing = (results) => requiredJobs.every((job) => results[job] === 'success');

const isDirectExecution =
  argv[1] !== undefined &&
  new URL(import.meta.url).pathname === new URL(`file://${argv[1]}`).pathname;

if (isDirectExecution) {
  const results = Object.fromEntries(
    requiredJobs.map((job) => [job, env[`${job.toUpperCase()}_RESULT`]])
  );

  if (!isCiGatePassing(results)) {
    for (const job of requiredJobs) {
      if (results[job] !== 'success') {
        stderr.write(`Required CI job '${job}' result was '${results[job] ?? 'missing'}'\n`);
      }
    }
    exit(1);
  }
}
