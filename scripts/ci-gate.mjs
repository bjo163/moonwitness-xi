import { stderr, env, argv } from 'node:process';
import { appendFile } from 'node:fs/promises';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const requiredJobs = ['quality', 'integration', 'browser', 'containers', 'automation'];

export const isCiGatePassing = (results, selectedJobs = requiredJobs, planResult = 'success') =>
  planResult === 'success' &&
  Array.isArray(selectedJobs) &&
  selectedJobs.includes('automation') &&
  selectedJobs.every((job) => requiredJobs.includes(job)) &&
  requiredJobs.every((job) =>
    selectedJobs.includes(job)
      ? results[job] === 'success'
      : results[job] === 'skipped' || results[job] === 'success'
  );

export function renderCiJobSummary(results, selectedJobs = requiredJobs, planResult = 'missing') {
  const rows = [
    ['plan', planResult],
    ...requiredJobs.map((job) => [job, results[job] ?? 'missing']),
  ];
  const normalized = rows.map(([job, result]) => {
    const status =
      job !== 'plan' && !selectedJobs.includes(job) && result === 'skipped'
        ? 'not selected'
        : result;
    return `| ${job} | ${status} |`;
  });
  const passed = isCiGatePassing(results, selectedJobs, planResult);
  return [
    '## CI result',
    '',
    `Overall: **${passed ? 'passed' : 'failed'}**`,
    '',
    '| Job | Result |',
    '| --- | --- |',
    ...normalized,
    '',
  ].join('\n');
}

const isDirectExecution =
  argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(argv[1]);

if (isDirectExecution) {
  const results = Object.fromEntries(
    requiredJobs.map((job) => [job, env[`${job.toUpperCase()}_RESULT`]])
  );
  let selectedJobs;
  try {
    selectedJobs = JSON.parse(env.SELECTED_JOBS ?? '[]');
  } catch {
    selectedJobs = [];
  }
  const planResult = env.PLAN_RESULT ?? 'missing';
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      renderCiJobSummary(results, selectedJobs, planResult)
    );
  }

  if (!isCiGatePassing(results, selectedJobs, planResult)) {
    if (planResult !== 'success') stderr.write(`CI plan result was '${planResult}'\n`);
    for (const job of requiredJobs) {
      if (
        (selectedJobs.includes(job) && results[job] !== 'success') ||
        (!selectedJobs.includes(job) && !['skipped', 'success'].includes(results[job]))
      ) {
        stderr.write(`Required CI job '${job}' result was '${results[job] ?? 'missing'}'\n`);
      }
    }
    exit(1);
  }
}
