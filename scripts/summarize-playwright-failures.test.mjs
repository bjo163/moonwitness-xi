import { equal, match } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reporter = path.join(root, 'scripts', 'summarize-playwright-failures.mjs');

function runReporter(xml) {
  const directory = mkdtempSync(path.join(tmpdir(), 'moonwitness-playwright-report-'));
  try {
    const reportPath = path.join(directory, 'junit.xml');
    writeFileSync(reportPath, xml);
    return spawnSync(process.execPath, [reporter, reportPath], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('annotates failed testcase names without exposing failure messages', () => {
  const result = runReporter(
    '<testsuite><testcase classname="account-settings.spec.ts" name="changes own profile"><failure message="private payload">token=value</failure></testcase><testcase name="passing case"/></testsuite>'
  );
  equal(result.status, 0);
  match(result.stdout, /account-settings\.spec\.ts :: changes own profile/u);
  equal(result.stdout.includes('private payload'), false);
  equal(result.stdout.includes('token=value'), false);
});

test('escapes workflow-command newlines from XML attributes', () => {
  const result = runReporter(
    '<testsuite><testcase name="first&#10;::notice title=fake::second"><failure/></testcase></testsuite>'
  );
  equal(result.status, 0);
  match(result.stdout, /first%0A::notice title=fake::second/u);
  equal(result.stdout.includes('\n::notice'), false);
});

test('does not fail the original browser job when JUnit is missing', () => {
  const result = spawnSync(
    process.execPath,
    [reporter, path.join(tmpdir(), 'missing-board-junit.xml')],
    {
      encoding: 'utf8',
    }
  );
  equal(result.status, 0);
  match(result.stdout, /did not produce a JUnit report/u);
});
