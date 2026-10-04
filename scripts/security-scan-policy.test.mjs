import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateScanResult,
  isExceptionActive,
  validateExceptions,
} from './security-scan-policy.mjs';

test('blocks CRITICAL dependency findings', () => {
  const finding = { id: 'fixture-critical', severity: 'CRITICAL' };
  const result = evaluateScanResult({ exitCode: 1, findings: [finding] });
  equal(result.passed, false);
  deepEqual(result.blockingFindings, [finding]);
});

test('scanner errors fail closed rather than reporting a clean scan', () => {
  const result = evaluateScanResult({
    exitCode: 0,
    findings: [],
    scannerError: 'database unavailable',
  });
  equal(result.passed, false);
  equal(result.reason, 'scanner-error');
});

test('only unexpired ISO date exceptions remain active', () => {
  equal(isExceptionActive({ expiresOn: '2026-10-06' }, '2026-10-05'), true);
  equal(isExceptionActive({ expiresOn: '2026-10-04' }, '2026-10-05'), false);
  equal(isExceptionActive({ expiresOn: 'never' }, '2026-10-05'), false);
});

test('exception policy rejects expired or ownerless suppressions', () => {
  deepEqual(
    validateExceptions(
      [
        { id: 'expired', owner: 'security', reason: 'test', expiresOn: '2026-10-04' },
        { id: 'incomplete', expiresOn: '2026-10-06' },
      ],
      '2026-10-05'
    ),
    [
      'exception expired expired on 2026-10-04',
      'exception incomplete requires id, owner, and reason',
    ]
  );
});
