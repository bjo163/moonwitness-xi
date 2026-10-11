import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const helperPath = fileURLToPath(new URL('./push-expected-ref.mjs', import.meta.url));

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function configureIdentity(cwd, name) {
  git(cwd, ['config', 'user.name', name]);
  git(cwd, ['config', 'user.email', `${name}@example.test`]);
}

function createRepositories() {
  const root = mkdtempSync(join(tmpdir(), 'moonwitness-expected-ref-'));
  const remote = join(root, 'remote.git');
  const bot = join(root, 'bot');
  const human = join(root, 'human');
  git(root, ['init', '--bare', remote]);
  git(root, ['clone', remote, bot]);
  configureIdentity(bot, 'bot');
  git(bot, ['checkout', '-b', 'dev']);
  git(bot, ['commit', '--allow-empty', '-m', 'initial dev']);
  git(bot, ['push', 'origin', 'HEAD:refs/heads/dev']);
  const expectedSha = git(bot, ['rev-parse', 'HEAD']);
  return { root, remote, bot, human, expectedSha };
}

test('expected-head push preserves remote changes made before publication', () => {
  const repos = createRepositories();
  try {
    git(repos.bot, ['commit', '--allow-empty', '-m', 'candidate update']);
    git(repos.root, ['clone', '--branch', 'dev', repos.remote, repos.human]);
    configureIdentity(repos.human, 'human');
    git(repos.human, ['commit', '--allow-empty', '-m', 'human change']);
    git(repos.human, ['push', 'origin', 'HEAD:refs/heads/dev']);
    const humanSha = git(repos.human, ['rev-parse', 'HEAD']);

    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [helperPath, 'origin', 'HEAD', 'refs/heads/dev', repos.expectedSha],
          { cwd: repos.bot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        ),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /Refusing stale write/);
        return true;
      }
    );
    assert.equal(git(repos.remote, ['rev-parse', 'refs/heads/dev']), humanSha);
  } finally {
    rmSync(repos.root, { recursive: true, force: true });
  }
});

test('expected-head push publishes a fast-forward when the target is unchanged', () => {
  const repos = createRepositories();
  try {
    git(repos.bot, ['commit', '--allow-empty', '-m', 'candidate update']);
    const candidateSha = git(repos.bot, ['rev-parse', 'HEAD']);
    execFileSync(
      process.execPath,
      [helperPath, 'origin', 'HEAD', 'refs/heads/dev', repos.expectedSha],
      { cwd: repos.bot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    assert.equal(git(repos.remote, ['rev-parse', 'refs/heads/dev']), candidateSha);
  } finally {
    rmSync(repos.root, { recursive: true, force: true });
  }
});

test('rejects abbreviated SHAs and non-branch/tag target refs', async () => {
  const { pushExpectedRef } = await import('./push-expected-ref.mjs');
  assert.throws(() => pushExpectedRef('origin', 'HEAD', 'dev', '1234'), /fully qualified/);
  assert.throws(
    () => pushExpectedRef('origin', 'HEAD', 'refs/heads/dev', '1234'),
    /full hexadecimal object ID/
  );
});
