import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(root, 'test-results');
const forbidden = [
  /MW_REPORT_SECRET_FIXTURE_[A-Z0-9]+/u,
  /(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\s<]+/iu,
  /(?:password|secret|token)\s*[:=]\s*[^\s<]+/iu,
  /postgres(?:ql)?:\/\/[^\s<]+:[^\s<]+@/iu,
];

export function assertReportsAreSanitized(contents) {
  for (const pattern of forbidden) assert.doesNotMatch(contents, pattern);
}

export function assertRequiredTestReports(files) {
  if (files.includes('board-e2e.xml') && !files.includes('board-e2e-retries.json')) {
    throw new Error('Playwright JUnit exists but its retry-diagnostics report is missing.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  async function listReports(directory) {
    const reports = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) reports.push(...(await listReports(file)));
      else if (/\.(?:xml|json)$/u.test(entry.name)) reports.push(file);
    }
    return reports;
  }
  const files = await listReports(artifactDirectory);
  const junitFiles = files.filter((file) => file.endsWith('.xml'));
  if (junitFiles.length === 0) throw new Error('No JUnit reports were generated.');
  assertRequiredTestReports(files.map((file) => path.basename(file)));
  for (const file of files) assertReportsAreSanitized(await readFile(file, 'utf8'));
  process.stdout.write(
    `Scanned ${files.length} JUnit/coverage reports; no credential patterns found.\n`
  );
}
