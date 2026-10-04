import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoverage } from './check-coverage.mjs';

const policy = { version: 1, metric: 'branches', files: { 'apps/api/src/auth/policy.ts': 80 } };
const report = (pct) => new Map([['apps/api/src/auth/policy.ts', { branches: { pct } }]]);

test('accepts coverage at the per-file branch threshold', () => {
  assert.equal(validateCoverage(policy, report(80)), 1);
});

test('fails coverage below threshold and when required files are missing', () => {
  assert.throws(() => validateCoverage(policy, report(79.99)), /below 80%/);
  assert.throws(() => validateCoverage(policy, new Map()), /report is missing/);
});

test('rejects an unsupported or statement-only policy', () => {
  assert.throws(() => validateCoverage({ ...policy, version: 2 }, report(100)), /version/);
  assert.throws(
    () => validateCoverage({ ...policy, metric: 'statements' }, report(100)),
    /branch behavior/
  );
});
