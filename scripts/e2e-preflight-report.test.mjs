import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertReportsAreSanitized, assertRequiredTestReports } from './scan-test-reports.mjs';
import { summarizeFailedTests } from './summarize-playwright-failures.mjs';
import { writeE2EPreflightFailure } from './e2e-preflight-report.mjs';

test('preflight failure creates sanitized JUnit and retry diagnostics for the failing stage', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'moonwitness-e2e-preflight-'));
  try {
    await writeE2EPreflightFailure(directory, 'reset-superadmin-password', 1);
    const junit = await readFile(path.join(directory, 'board-e2e.xml'), 'utf8');
    const retries = await readFile(path.join(directory, 'board-e2e-retries.json'), 'utf8');

    assert.deepEqual(summarizeFailedTests(junit), ['preflight :: reset-superadmin-password']);
    assert.equal(JSON.parse(retries).runStatus, 'failed');
    assert.doesNotThrow(() => assertReportsAreSanitized(junit + retries));
    assert.doesNotThrow(() =>
      assertRequiredTestReports(['board-e2e.xml', 'board-e2e-retries.json'])
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preflight reports reject unknown stages and successful exit codes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'moonwitness-e2e-invalid-'));
  try {
    await assert.rejects(writeE2EPreflightFailure(directory, 'arbitrary-input', 1));
    await assert.rejects(writeE2EPreflightFailure(directory, 'build-api', 0));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
