import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import PlaywrightFlakeReporter from './playwright-flake-reporter.mjs';

test('records a first-attempt failure when the retry passes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mw-flake-report-'));
  try {
    const outputFile = path.join(directory, 'retries.json');
    const reporter = new PlaywrightFlakeReporter({ outputFile });
    const testCase = {
      id: 'browser-login',
      titlePath: () => ['chromium', 'login form works'],
      location: { file: 'apps/board/e2e/auth.spec.ts' },
    };
    const firstFailure = {
      retry: 0,
      status: 'failed',
      error: { name: 'Error', message: 'locator timed out' },
    };
    testCase.results = [firstFailure];
    reporter.onTestEnd(testCase, firstFailure);
    reporter.onTestEnd(testCase, { retry: 1, status: 'passed' });
    await reporter.onEnd({ status: 'passed' });

    const report = JSON.parse(await readFile(outputFile, 'utf8'));
    assert.equal(report.runStatus, 'passed');
    assert.deepEqual(report.retries, [
      {
        title: 'chromium › login form works',
        file: 'apps/board/e2e/auth.spec.ts',
        firstAttemptStatus: 'failed',
        firstAttemptError: { name: 'Error', message: 'locator timed out' },
        retryStatus: 'passed',
        retryNumber: 1,
      },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('does not label an initially passing test as flaky', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mw-flake-report-'));
  try {
    const outputFile = path.join(directory, 'retries.json');
    const reporter = new PlaywrightFlakeReporter({ outputFile });
    const testCase = {
      id: 'stable',
      titlePath: () => ['stable test'],
      location: { file: 'apps/board/e2e/auth.spec.ts' },
    };
    reporter.onTestEnd(testCase, { retry: 0, status: 'passed' });
    await reporter.onEnd({ status: 'passed' });

    assert.deepEqual(JSON.parse(await readFile(outputFile, 'utf8')).retries, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
