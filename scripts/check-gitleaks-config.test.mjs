import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedAllowlistExpressions, validateGitleaksSetup } from './check-gitleaks-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [workflow, config] = await Promise.all([
  readFile(path.join(root, '.github/workflows/gitleaks.yml'), 'utf8'),
  readFile(path.join(root, '.gitleaks.toml'), 'utf8'),
]);

test('accepts least-privilege full-history scanning with exact reviewed fixtures', () => {
  assert.deepEqual(validateGitleaksSetup(workflow, config), []);
});

test('historical scanner exceptions match only the six exact false-positive source lines', () => {
  const tokenHash = [
    '269a6e000da6fa28',
    '8380cf36ec127df0',
    '9cc86d6a38a1d461',
    '3a975b54d3664d5a',
  ].join('');
  const historicalLines = [
    ['/^', String.raw`\s*`, '"tokensSha256": "', tokenHash, '"$/u,'].join(''),
    ['/^', String.raw`\s*`, 'idempotency', 'Key: ', "'duplicate-", 'vote-0001', "',$/u,"].join(''),
    ['/^', String.raw`\s*`, 'idempotency', 'Key: ', "'reject-", 'decision-0001', "',$/u,"].join(''),
    ["'^", String.raw`\\s*`, '"tokensSha256": "', tokenHash, '"$', "',"].join(''),
    ['"^', String.raw`\\s*`, 'idempotency', 'Key: ', "'duplicate-", 'vote-0001', '\',$"', ','].join(
      ''
    ),
    [
      '"^',
      String.raw`\\s*`,
      'idempotency',
      'Key: ',
      "'reject-",
      'decision-0001',
      '\',$"',
      ',',
    ].join(''),
  ];
  const matchers = expectedAllowlistExpressions.slice(3).map((source) => new RegExp(source, 'u'));

  assert.equal(historicalLines.length, matchers.length);
  for (const [index, line] of historicalLines.entries()) {
    assert.match(line, matchers[index]);
    assert.doesNotMatch(`${line}extra`, matchers[index]);
  }
});

test('rejects workflow trust-boundary and allowlist regressions', () => {
  const invalidWorkflow = workflow.replace('pull_request:', 'pull_request_target:');
  const invalidConfig = config.replace('duplicate-vote-0001', 'altered-fixture');
  assert.ok(
    validateGitleaksSetup(invalidWorkflow, config).some((issue) => /privileged PR/u.test(issue))
  );
  assert.ok(
    validateGitleaksSetup(workflow, invalidConfig).some((issue) => /reviewed fixture/u.test(issue))
  );
  assert.ok(
    validateGitleaksSetup(workflow, config.replace('useDefault = true', 'useDefault = false')).some(
      (issue) => /built-in secret detection rules/u.test(issue)
    )
  );
});
