import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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

test('historical scanner exceptions match only the seven exact false-positive source lines', () => {
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
    [
      '- Add adapter fixtures for API pagination, missing',
      '/',
      'duplicate checks, stale snapshots, revoked permissions, and malformed/untrusted webhook or issue events.',
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

test('MoonWitness custom rule catches random runtime credentials but not weak placeholders', () => {
  const rule = config.match(
    /\[\[rules\]\]\s*id\s*=\s*"moonwitness-runtime-secret"([\s\S]*?)(?=\n\[\[|\s*$)/u
  )?.[1];
  const source = rule?.match(/regex\s*=\s*'''(.*?)'''/su)?.[1];
  assert.ok(source, 'custom rule must define a detector expression');
  const regex = new RegExp(source.replace(/^\(\?i\)/u, ''), 'iu');
  const entropy = (value) => {
    const counts = new Map();
    for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
    return [...counts.values()].reduce((total, count) => {
      const probability = count / value.length;
      return total - probability * Math.log2(probability);
    }, 0);
  };
  const syntheticSecret = randomBytes(48).toString('base64url');
  const match = `JWT_SECRET=${syntheticSecret}`.match(regex);
  assert.equal(match?.[1], syntheticSecret);
  assert.ok(entropy(syntheticSecret) >= 4.2);

  const placeholder = 'ci-only-secret-that-is-at-least-32-characters-long';
  const placeholderMatch = `JWT_SECRET=${placeholder}`.match(regex);
  assert.equal(placeholderMatch?.[1], placeholder);
  assert.ok(entropy(placeholder) < 4.2);
  assert.equal(`DATABASE_URL=${syntheticSecret}`.match(regex), null);
  assert.equal(`const fixture = /^JWT_SECRET=${syntheticSecret}$/u;`.match(regex), null);
});
