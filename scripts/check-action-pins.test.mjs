import assert from 'node:assert/strict';
import test from 'node:test';
import { findUnpinnedActions, pnpmSetupOrderValid } from './check-action-pins.mjs';

test('installs pnpm 11 with a Node runtime and required frozen lockfile', () => {
  assert.equal(
    pnpmSetupOrderValid(
      [
        '- uses: pnpm/setup@pnpm-sha # v3',
        '  with:',
        '    runtime: node@${{ inputs.node-version }}',
        '    install: false',
        '- run: pnpm install --frozen-lockfile',
      ].join('\n')
    ),
    true
  );
  assert.equal(
    pnpmSetupOrderValid(
      ['- uses: actions/setup-node@node-sha # v7', '- uses: pnpm/action-setup@pnpm-sha # v6'].join(
        '\n'
      )
    ),
    true
  );
  assert.equal(
    pnpmSetupOrderValid(
      ['- uses: pnpm/action-setup@pnpm-sha # v6', '- uses: actions/setup-node@node-sha # v7'].join(
        '\n'
      )
    ),
    false
  );
});

test('accepts immutable external actions with version comments and local actions', () => {
  const findings = findUnpinnedActions([
    {
      path: '.github/workflows/ci.yml',
      content: [
        '      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4',
        '        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2',
        '      - uses: ./.github/actions/setup-pnpm',
      ].join('\n'),
    },
  ]);
  assert.deepEqual(findings, []);
});

test('rejects mutable tags, short SHAs, and missing version comments', () => {
  const findings = findUnpinnedActions([
    {
      path: '.github/workflows/example.yml',
      content: [
        '      - uses: actions/checkout@v4',
        '      - uses: actions/setup-node@11d5960a326750d5838078e36cf38b85af67726 # v4',
        '      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
      ].join('\n'),
    },
  ]);
  assert.equal(findings.length, 3);
  assert.match(findings[0].reason, /full 40-character commit SHA/);
  assert.match(findings[1].reason, /full 40-character commit SHA/);
  assert.match(findings[2].reason, /human-readable action version/);
});

test('rejects expressions and malformed external action references', () => {
  const findings = findUnpinnedActions([
    {
      path: '.github/actions/composite/action.yml',
      content: ['    - uses: actions/checkout@${{ inputs.ref }} # v4', '    - uses: checkout'].join(
        '\n'
      ),
    },
  ]);
  assert.equal(findings.length, 2);
});
