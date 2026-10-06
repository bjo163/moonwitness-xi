import { equal } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checker = path.join(root, 'scripts', 'check-trivy-sarif.mjs');

function runGate(reports, outcomes = reports.map(() => 'success')) {
  const directory = mkdtempSync(path.join(tmpdir(), 'moonwitness-trivy-'));
  try {
    const files = reports.map((report, index) => {
      const file = path.join(directory, `scan-${index}.sarif`);
      writeFileSync(file, JSON.stringify(report));
      return file;
    });
    return spawnSync(process.execPath, [checker, ...files], {
      encoding: 'utf8',
      env: { ...process.env, TRIVY_SCAN_OUTCOMES: JSON.stringify(outcomes) },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function report(severity, id = 'fixture') {
  return {
    runs: [
      {
        tool: {
          driver: {
            rules: [{ id, properties: { tags: [severity, 'security', 'vulnerability'] } }],
          },
        },
        results: [{ ruleId: id }],
      },
    ],
  };
}

test('SARIF gate reports all levels while allowing HIGH under critical-only blocking', () => {
  const result = runGate([report('HIGH'), report('MEDIUM')]);
  equal(result.status, 0);
  equal(result.stdout.includes('2 finding(s)'), true);
});

test('SARIF gate blocks CRITICAL findings', () => {
  const result = runGate([report('CRITICAL')]);
  equal(result.status, 1);
  equal(result.stderr.includes('1 CRITICAL vulnerability'), true);
  equal(result.stdout.includes('::error title=Trivy CRITICAL findings::fixture'), true);
  equal(result.stdout.includes('scan-0.sarif'), false);
});

test('SARIF annotations sanitize untrusted finding IDs', () => {
  const result = runGate([report('CRITICAL', 'CVE-TEST\n::notice title=forged::')]);
  equal(result.status, 1);
  equal(result.stdout.includes('::error title=Trivy CRITICAL findings::unrecognized-id'), true);
  equal(result.stdout.includes('forged'), false);
});

test('SARIF gate blocks scanner errors even when a report is otherwise clean', () => {
  const result = runGate([report('HIGH')], ['failure']);
  equal(result.status, 1);
  equal(result.stderr.includes('scanners failed'), true);
});

test('SARIF gate fails closed for malformed scanner output', () => {
  const result = runGate([{ runs: [] }]);
  equal(result.status, 1);
  equal(result.stderr.includes('Trivy SARIF validation failed'), true);
  equal(result.stderr.includes('SARIF must contain at least one run'), false);
});
