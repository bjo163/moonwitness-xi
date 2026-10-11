import assert from 'node:assert/strict';
import test from 'node:test';
import { collectActionPins, verifyActionPinTargets } from './check-action-tag-pins.mjs';

test('collects external immutable refs with their version comments and ignores local actions', () => {
  assert.deepEqual(
    collectActionPins([
      {
        path: '.github/workflows/ci.yml',
        content: [
          '      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v7.0.1',
          '      - uses: ./.github/actions/setup-pnpm',
          '      - uses: actions/upload-artifact@v6',
        ].join('\n'),
      },
    ]),
    [
      {
        action: 'actions/checkout',
        sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        version: 'v7.0.1',
        path: '.github/workflows/ci.yml',
        line: 1,
      },
    ]
  );
});

test('resolves each upstream tag once for repeated pins', async () => {
  const pins = [
    { action: 'org/action', sha: 'a'.repeat(40), version: 'v1.2.3', path: 'a.yml', line: 2 },
    { action: 'org/action', sha: 'a'.repeat(40), version: 'v1.2.3', path: 'b.yml', line: 8 },
  ];
  let lookups = 0;
  const findings = await verifyActionPinTargets(pins, async () => {
    lookups += 1;
    return 'a'.repeat(40);
  });
  assert.equal(lookups, 1);
  assert.deepEqual(findings, []);
});

test('matches either the exact tag object or the peeled commit selected by the action pin', async () => {
  let lookups = 0;
  const findings = await verifyActionPinTargets(
    [
      { action: 'org/action', sha: 'a'.repeat(40), version: 'v1.2.3', path: 'tag.yml', line: 1 },
      { action: 'org/action', sha: 'b'.repeat(40), version: 'v1.2.3', path: 'commit.yml', line: 1 },
    ],
    async () => {
      lookups += 1;
      return { tagSha: 'a'.repeat(40), peeledSha: 'b'.repeat(40) };
    }
  );
  assert.equal(lookups, 1);
  assert.deepEqual(findings, []);
});

test('reports false version annotations against the actual upstream commit', async () => {
  const findings = await verifyActionPinTargets(
    [{ action: 'org/action', sha: 'a'.repeat(40), version: 'v2.3.1', path: 'a.yml', line: 2 }],
    async () => 'b'.repeat(40)
  );
  assert.equal(findings[0]?.reason, 'SHA does not match the upstream version tag');
  assert.equal(findings[0]?.actualSha, 'b'.repeat(40));
});

test('fails closed when the upstream tag is missing or unreadable', async () => {
  const pin = {
    action: 'org/action',
    sha: 'a'.repeat(40),
    version: 'v1.2.3',
    path: 'a.yml',
    line: 1,
  };
  const missingTag = await verifyActionPinTargets([pin], async () => null);
  assert.equal(missingTag[0]?.reason, 'upstream version tag could not be resolved');

  let attempts = 0;
  const transientFailure = await verifyActionPinTargets([pin], async () => {
    attempts += 1;
    throw new Error('network failure');
  });
  assert.equal(attempts, 3);
  assert.equal(transientFailure[0]?.reason, 'upstream version tag could not be resolved');
});

test('recovers from a transient upstream lookup failure', async () => {
  let attempts = 0;
  const findings = await verifyActionPinTargets(
    [{ action: 'org/action', sha: 'a'.repeat(40), version: 'v1.2.3', path: 'a.yml', line: 1 }],
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary network failure');
      return 'a'.repeat(40);
    }
  );
  assert.equal(attempts, 2);
  assert.deepEqual(findings, []);
});
