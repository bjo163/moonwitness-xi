import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeJunitFailures } from './summarize-junit-failures.mjs';

test('summarizes only named failed JUnit cases', () => {
  const report = `
    <testsuite name="api">
      <testcase classname="auth" name="login works" />
      <testcase classname="tenant" name="filters foreign data"><failure message="secret=do-not-print">private details</failure></testcase>
      <testcase classname="db" name="connection"><error message="failed" /></testcase>
    </testsuite>`;

  assert.deepEqual(summarizeJunitFailures(report), [
    'tenant :: filters foreign data',
    'db :: connection',
  ]);
});

test('redacts credential-shaped values and database connection strings in dynamic names', () => {
  const report = `<testsuite><testcase name="password=hunter2 token=abc postgresql://user:pass@host/db"><failure /></testcase></testsuite>`;

  assert.deepEqual(summarizeJunitFailures(report), [
    'password=[redacted] token=[redacted] postgresql://[redacted]',
  ]);
});

test('ignores skipped and passing cases', () => {
  const report = `<testsuite><testcase name="skipped"><skipped /></testcase><testcase name="passed" /></testsuite>`;

  assert.deepEqual(summarizeJunitFailures(report), []);
});
