import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReportsAreSanitized } from './scan-test-reports.mjs';

test('accepts sanitized reports', () => {
  assert.doesNotThrow(() => assertReportsAreSanitized('<testsuite tests="2" failures="0"/>'));
});

test('rejects a secret fixture in report output', () => {
  assert.throws(() =>
    assertReportsAreSanitized('<failure>MW_REPORT_SECRET_FIXTURE_DO_NOT_UPLOAD</failure>')
  );
});

test('rejects credentials, cookies, and connection-string passwords', () => {
  for (const report of [
    '<failure>Authorization: Bearer abc123</failure>',
    '<failure>Set-Cookie: session=abc123</failure>',
    '<failure>postgresql://user:pass@localhost/db</failure>',
  ]) {
    assert.throws(() => assertReportsAreSanitized(report));
  }
});
