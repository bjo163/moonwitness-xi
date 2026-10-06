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
  const basenames = files.map((file) => path.basename(file));
  if (basenames.includes('board-e2e.xml') && !basenames.includes('board-e2e-retries.json')) {
    throw new Error('Playwright JUnit exists but its retry-diagnostics report is missing.');
  }
  if (
    basenames.includes('postgres.xml') &&
    !files.some((file) => file.replaceAll('\\', '/').endsWith('performance/m4.15.json'))
  ) {
    throw new Error('PostgreSQL JUnit exists but the M4.15 performance report is missing.');
  }
}

export function shouldScanReports(files) {
  if (files.length === 0) return false;
  if (!files.some((file) => file.endsWith('.xml'))) {
    throw new Error('Test artifacts exist but no JUnit report was generated.');
  }
  assertRequiredTestReports(files);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  async function listReports(directory, allowMissing = false) {
    const reports = [];
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (
        allowMissing &&
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return reports;
      }
      throw error;
    }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) reports.push(...(await listReports(file)));
      else if (/\.(?:xml|json)$/u.test(entry.name)) reports.push(file);
    }
    return reports;
  }
  const files = await listReports(artifactDirectory, true);
  const relativeFiles = files.map((file) =>
    path.relative(artifactDirectory, file).replaceAll('\\', '/')
  );
  if (!shouldScanReports(relativeFiles)) {
    process.stdout.write('No test reports were generated; nothing to scan.\n');
    process.exit(0);
  }
  for (const file of files) assertReportsAreSanitized(await readFile(file, 'utf8'));
  process.stdout.write(
    `Scanned ${files.length} JUnit/coverage reports; no credential patterns found.\n`
  );
}
