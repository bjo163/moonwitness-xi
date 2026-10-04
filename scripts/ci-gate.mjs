import { stderr, env, argv } from 'node:process';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const requiredJobs = ['quality', 'integration', 'browser', 'containers', 'automation'];

export const isCiGatePassing = (results) => requiredJobs.every((job) => results[job] === 'success');

const isDirectExecution =
  argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(argv[1]);

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
