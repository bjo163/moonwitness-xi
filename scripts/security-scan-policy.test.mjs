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

test('exceptions apply only to the exact SARIF rule ID and scan target', () => {
  const findings = [
    { id: 'CVE-2026-0001', severity: 'CRITICAL', target: 'workspace' },
    { id: 'CVE-2026-0001', severity: 'CRITICAL', target: 'api-image' },
    { id: 'CVE-2026-0002', severity: 'CRITICAL', target: 'api-image' },
  ];
  const result = evaluateScanResult({
    exitCode: 0,
    findings,
    exceptions: [{ id: 'CVE-2026-0001', target: 'api-image' }],
  });
  equal(result.passed, false);
  deepEqual(result.blockingFindings, [findings[0], findings[2]]);
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
  const findings = extractSarifFindings(sarif, 'workspace');
  deepEqual(findings, [
    { id: 'critical-fixture', severity: 'CRITICAL', target: 'workspace' },
    { id: 'high-fixture', severity: 'HIGH', target: 'workspace' },
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
  equal(isExceptionActive({ expiresOn: '2026-99-99' }, '2026-10-05'), false);
  equal(isExceptionActive({ expiresOn: '2026-02-30' }, '2026-01-01'), false);
  equal(isExceptionActive({ expiresOn: '2024-02-29' }, '2024-02-28'), true);
  equal(isExceptionActive({ expiresOn: '2023-02-29' }, '2023-01-01'), false);
});

test('exception policy rejects expired or ownerless suppressions', () => {
  deepEqual(
    validateExceptions(
      [
        {
          id: 'expired',
          target: 'api-image',
          owner: 'security',
          reason: 'test',
          expiresOn: '2026-10-04',
        },
        { id: 'incomplete', target: 'api-image', expiresOn: '2026-10-06' },
        {
          id: 'impossible',
          target: 'api-image',
          owner: 'security',
          reason: 'test',
          expiresOn: '2026-99-99',
        },
        null,
      ],
      '2026-10-05'
    ),
    [
      'exception expired expired on 2026-10-04',
      'exception incomplete requires id, owner, and reason',
      'exception impossible requires a real ISO calendar expiry date',
      'exception 4 requires id, owner, and reason',
      'exception 4 requires a real ISO calendar expiry date',
    ]
  );
  deepEqual(validateExceptions({}, '2026-10-05'), ['exceptions must be an array']);
});

test('exception policy rejects unknown targets and duplicate scoped identities', () => {
  const item = {
    id: 'CVE-2026-0001',
    target: 'api-image',
    owner: 'security',
    reason: 'upstream fix unavailable',
    expiresOn: '2026-10-06',
  };
  deepEqual(
    validateExceptions(
      [item, { ...item, owner: 'another owner' }, { ...item, id: 'unknown', target: 'all' }],
      '2026-10-05'
    ),
    [
      'exception CVE-2026-0001 duplicates api-image:CVE-2026-0001',
      'exception unknown requires a target from workspace, api-image, board-image',
    ]
  );
  deepEqual(
    validateExceptions(
      [
        {
          id: 'CVE-2026-0001\n::notice::',
          target: 'workspace',
          owner: 'security',
          reason: 'test',
          expiresOn: '2026-10-06',
        },
      ],
      '2026-10-05'
    ),
    ['exception CVE-2026-0001\n::notice:: requires an exact SARIF rule ID']
  );
});
