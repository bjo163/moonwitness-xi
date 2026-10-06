import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateCoverage(thresholds, summaries) {
  assert.equal(thresholds.version, 1, 'Unsupported coverage threshold policy version');
  assert.equal(
    thresholds.metric,
    'branches',
    'Critical coverage policy must measure branch behavior'
  );
  const failures = [];
  for (const [relativePath, minimum] of Object.entries(thresholds.files)) {
    const summary = summaries.get(relativePath);
    if (!summary) {
      failures.push(`${relativePath}: coverage report is missing`);
      continue;
    }
    const actual = summary.branches?.pct;
    if (typeof actual !== 'number' || actual < minimum) {
      failures.push(`${relativePath}: branch coverage ${String(actual)}% is below ${minimum}%`);
    }
  }
  if (failures.length)
    throw new Error(`Critical branch coverage check failed:\n- ${failures.join('\n- ')}`);
  return Object.keys(thresholds.files).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const policyPath = path.join(root, 'docs/testing/coverage-thresholds.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  const summaries = new Map();
  for (const directory of [
    'api',
    'auth',
    'jobs',
    'orm',
    'orm-base',
    'orm-workflow',
    'orm-integration',
    'orm-organization',
  ]) {
    const file = path.join(root, 'test-results/coverage', directory, 'coverage-summary.json');
    const report = JSON.parse(await readFile(file, 'utf8'));
    for (const [absolutePath, value] of Object.entries(report)) {
      if (absolutePath === 'total') continue;
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      summaries.set(relativePath, value);
    }
  }
  const count = validateCoverage(policy, summaries);
  process.stdout.write(`Critical branch coverage thresholds passed for ${count} files.\n`);
}
