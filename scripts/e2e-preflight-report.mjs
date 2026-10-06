import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const preflightStages = new Set([
  'flaky-policy',
  'build-api',
  'build-ui',
  'reset-superadmin-password',
  'start-playwright',
  'pnpm-invocation',
]);

export async function writeE2EPreflightFailure(directory, stage, exitCode) {
  if (!preflightStages.has(stage)) throw new Error('Unknown Board E2E preflight stage.');
  if (!Number.isInteger(exitCode) || exitCode === 0) {
    throw new Error('A failed Board E2E preflight requires a non-zero exit code.');
  }

  await mkdir(directory, { recursive: true });
  const junit = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites tests="1" failures="1" errors="0" skipped="0" time="0">',
    '  <testsuite name="Board E2E preflight" tests="1" failures="1" errors="0" skipped="0" time="0">',
    `    <testcase classname="preflight" name="${stage}" time="0">`,
    `      <failure message="Preflight failed with exit code ${exitCode}">The E2E harness stopped before Playwright started.</failure>`,
    '    </testcase>',
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');

  await Promise.all([
    writeFile(path.join(directory, 'board-e2e.xml'), junit, 'utf8'),
    writeFile(
      path.join(directory, 'board-e2e-retries.json'),
      `${JSON.stringify({ version: 1, runStatus: 'failed', retries: [] }, null, 2)}\n`,
      'utf8'
    ),
  ]);
}
