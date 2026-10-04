import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCommits, parseConventionalCommit } from './release-classification.mjs';

test('maps features, fixes, and non-release commits to the documented version level', () => {
  assert.equal(
    parseConventionalCommit({ subject: 'feat(board): add saved filters' }).changeKind,
    'minor'
  );
  assert.equal(
    parseConventionalCommit({ subject: 'fix(api): reject invalid relations' }).changeKind,
    'patch'
  );
  assert.equal(
    parseConventionalCommit({ subject: 'docs: explain local setup' }).changeKind,
    'none'
  );
  assert.equal(parseConventionalCommit({ subject: 'chore: refresh lockfile' }).changeKind, 'none');
});

test('maps ! and BREAKING CHANGE trailers to major', () => {
  assert.equal(
    parseConventionalCommit({ subject: 'feat(api)!: replace the auth contract' }).changeKind,
    'major'
  );
  assert.equal(
    parseConventionalCommit({
      subject: 'fix(orm): change field semantics',
      body: 'BREAKING CHANGE: update addon data before restart',
    }).changeKind,
    'major'
  );
});

test('selects the highest release level in the unique non-merge source commits', () => {
  const result = classifyCommits([
    { sha: 'a1', parents: ['p1', 'p2'], subject: 'Merge pull request #8' },
    { sha: 'b2', parents: ['p1'], subject: 'fix(api): handle null relation' },
    { sha: 'c3', parents: ['p1'], subject: 'feat(board): add import preview' },
    { sha: 'b2', parents: ['p1'], subject: 'fix(api): duplicate source commit' },
  ]);

  assert.equal(result.changeKind, 'minor');
  assert.deepEqual(result.skippedMergeCommits, ['a1']);
  assert.deepEqual(
    result.commits.map((commit) => commit.sha),
    ['b2', 'c3']
  );
  assert.deepEqual(result.invalidCommits, []);
});

test('fails closed for unsupported or non-conventional subjects', () => {
  const result = classifyCommits([
    { sha: 'd4', parents: ['p1'], subject: 'improve login security' },
    { sha: 'e5', parents: ['p1'], subject: 'unknown: change behavior' },
  ]);

  assert.equal(result.changeKind, 'invalid');
  assert.equal(result.invalidCommits.length, 2);
});

test('breaking changes take precedence over compatible features and fixes', () => {
  const result = classifyCommits([
    { sha: 'f6', parents: ['p1'], subject: 'feat: add partner search' },
    { sha: 'g7', parents: ['p1'], subject: 'fix: prevent duplicate seed' },
    { sha: 'h8', parents: ['p1'], subject: 'refactor(orm)!: remove legacy field behavior' },
  ]);

  assert.equal(result.changeKind, 'major');
});
