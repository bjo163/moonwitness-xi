import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertReportsAreSanitized,
  assertRequiredTestReports,
  shouldScanReports,
} from './scan-test-reports.mjs';

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

test('requires retry diagnostics whenever a Playwright JUnit report exists', () => {
  assert.throws(() => assertRequiredTestReports(['board-e2e.xml']), /retry-diagnostics/u);
  assert.doesNotThrow(() => assertRequiredTestReports(['board-e2e.xml', 'board-e2e-retries.json']));
  assert.throws(() => assertRequiredTestReports(['ui-catalog.xml']), /retry-diagnostics/u);
  assert.doesNotThrow(() =>
    assertRequiredTestReports(['ui-catalog.xml', 'ui-catalog-retries.json'])
  );
  assert.doesNotThrow(() => assertRequiredTestReports(['api.xml']));
});

test('requires the M4.15 performance report whenever PostgreSQL integration JUnit exists', () => {
  assert.throws(
    () => assertRequiredTestReports(['junit/postgres.xml']),
    /M4\.15 performance report/u
  );
  assert.doesNotThrow(() =>
    assertRequiredTestReports(['junit/postgres.xml', 'performance/m4.15.json'])
  );
});

test('skips scanning when no test artifacts were produced', () => {
  assert.equal(shouldScanReports([]), false);
});

test('keeps artifact validation fail-closed when reports are incomplete', () => {
  assert.throws(() => shouldScanReports(['coverage/coverage-final.json']), /no JUnit report/u);
  assert.throws(() => shouldScanReports(['board-e2e.xml']), /retry-diagnostics/u);
  assert.equal(shouldScanReports(['api.xml']), true);
});
