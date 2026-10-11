import assert from 'node:assert/strict';
import test from 'node:test';
import { createReleasePlan } from './release-plan.mjs';

const tags = [{ tag: 'v1.0.0-rc.1' }, { tag: 'v0.9.5' }];
const headSha = 'f'.repeat(40);

test('plans a prerelease increment from the latest prerelease baseline', () => {
  const plan = createReleasePlan({
    tags,
    headSha,
    commits: [{ sha: 'a'.repeat(40), parents: ['p'], subject: 'feat(board): add saved search' }],
  });

  assert.equal(plan.status, 'planned');
  assert.equal(plan.currentVersion, 'v1.0.0-rc.1');
  assert.equal(plan.nextVersion, 'v1.1.0-rc.1');
  assert.equal(plan.source.headSha, headSha);
  assert.equal(plan.writesPerformed, false);
});

test('returns a no-release plan for docs and generator commits', () => {
  const plan = createReleasePlan({
    tags,
    headSha,
    commits: [
      {
        sha: 'b'.repeat(40),
        parents: ['p'],
        subject: 'docs(ci): record workflow coverage gate evidence',
      },
      { sha: 'c'.repeat(40), parents: ['p'], subject: 'chore: regenerate API reference' },
    ],
  });

  assert.equal(plan.status, 'no-release');
  assert.equal(plan.changeKind, 'none');
  assert.equal(plan.nextVersion, null);
  assert.equal(plan.releasableCommitShas.length, 0);
  assert.equal(plan.ignoredCommitShas.length, 2);
});

test('keeps merge commits out of version calculation and identifies invalid commits', () => {
  const plan = createReleasePlan({
    tags,
    headSha,
    commits: [
      { sha: 'd'.repeat(40), parents: ['p1', 'p2'], subject: 'Merge pull request #10' },
      { sha: 'e'.repeat(40), parents: ['p'], subject: 'ordinary unclassified message' },
    ],
  });

  assert.equal(plan.status, 'invalid');
  assert.equal(plan.changeKind, 'invalid');
  assert.deepEqual(plan.skippedMergeShas, ['d'.repeat(40)]);
  assert.equal(plan.invalidCommits.length, 1);
  assert.equal(plan.nextVersion, null);
});

test('fails closed when no explicit release baseline exists', () => {
  assert.throws(
    () => createReleasePlan({ tags: [], headSha, commits: [] }),
    /first-stable baseline explicitly/
  );
});
