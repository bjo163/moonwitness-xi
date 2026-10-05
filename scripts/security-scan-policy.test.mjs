import { deepEqual, equal, throws } from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateScanResult,
  extractSarifFindings,
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

test('extracts severities from SARIF and allows high findings under a critical-only gate', () => {
  const sarif = {
    runs: [
      {
        tool: {
          driver: {
            rules: [
              { id: 'critical-fixture', properties: { tags: ['CRITICAL', 'security'] } },
              { id: 'high-fixture', properties: { tags: ['HIGH', 'security'] } },
            ],
          },
        },
        results: [{ ruleId: 'critical-fixture' }, { ruleId: 'high-fixture' }],
      },
    ],
  };
  const findings = extractSarifFindings(sarif);
  deepEqual(findings, [
    { id: 'critical-fixture', severity: 'CRITICAL' },
    { id: 'high-fixture', severity: 'HIGH' },
  ]);
  equal(evaluateScanResult({ exitCode: 0, findings }).passed, false);
  equal(evaluateScanResult({ exitCode: 0, findings: findings.slice(1) }).passed, true);
});

test('rejects malformed SARIF and dangling result rule references', () => {
  throws(() => extractSarifFindings({ runs: [] }), /at least one run/);
  throws(
    () =>
      extractSarifFindings({
        runs: [{ tool: { driver: { rules: [] } }, results: [{ ruleId: 'missing' }] }],
      }),
    /missing vulnerability rule/
  );
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
