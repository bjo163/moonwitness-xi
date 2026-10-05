import assert from 'node:assert/strict';
import test from 'node:test';
import { renderChangelogSection } from './render-changelog.mjs';

const repo = 'https://github.com/acme/moonwitness.git';
const headSha = 'a'.repeat(40);
const baselineSha = 'b'.repeat(40);

function fixture(overrides = {}) {
  const commit = {
    sha: 'c'.repeat(40),
    subject: 'feat(board): add saved filters (#42)',
    body: '',
    ...overrides.commit,
  };
  const classified = {
    sha: commit.sha,
    type: 'feat',
    description: 'add saved filters',
    isBreaking: false,
    ...overrides.classified,
  };
  return {
    plan: {
      status: 'planned',
      nextVersion: 'v1.2.0-rc.1',
      source: { baselineSha, headSha },
      releasableCommitShas: [commit.sha],
      commits: [classified],
      ...overrides.plan,
    },
    commits: [commit],
  };
}

test('groups notes and links the source commit, associated PR, version, and SHA', () => {
  const { plan, commits } = fixture();
  const output = renderChangelogSection({
    plan,
    commits,
    repositoryUrl: repo,
    date: '2026-10-05',
  });

  assert.match(output, /^## \[v1\.2\.0-rc\.1\] - 2026-10-05/m);
  assert.match(output, /release-source-sha: [a]{40}; baseline: [b]{40}/);
  assert.match(output, /### Added/);
  assert.match(output, /add saved filters/);
  assert.match(output, /https:\/\/github\.com\/acme\/moonwitness\/commit\/[c]{40}/);
  assert.match(output, /https:\/\/github\.com\/acme\/moonwitness\/pull\/42/);
});

test('requires an upgrade trailer and emits upgrade notes for breaking changes', () => {
  const missing = fixture({
    classified: { type: 'feat', isBreaking: true },
  });
  assert.throws(
    () =>
      renderChangelogSection({
        ...missing,
        repositoryUrl: repo,
        date: '2026-10-05',
      }),
    /requires a non-empty UPGRADE/
  );

  const complete = fixture({
    commit: {
      body: 'BREAKING CHANGE: auth response changed\nUPGRADE: update the client token parser',
    },
    classified: { isBreaking: true },
  });
  const output = renderChangelogSection({
    ...complete,
    repositoryUrl: repo,
    date: '2026-10-05',
  });
  assert.match(output, /### Breaking Changes/);
  assert.match(output, /### Upgrade Notes/);
  assert.match(output, /update the client token parser/);
});

test('fails closed for invalid plans, incomplete source metadata, and invalid repository URLs', () => {
  const { plan, commits } = fixture();
  assert.throws(
    () =>
      renderChangelogSection({
        plan: { ...plan, status: 'no-release' },
        commits,
        repositoryUrl: repo,
        date: '2026-10-05',
      }),
    /Only a planned release/
  );
  assert.throws(
    () => renderChangelogSection({ plan, commits: [], repositoryUrl: repo, date: '2026-10-05' }),
    /missing from the source range/
  );
  assert.throws(
    () =>
      renderChangelogSection({
        plan,
        commits,
        repositoryUrl: 'https://example.com/acme/repo',
        date: '2026-10-05',
      }),
    /HTTPS GitHub repository URL/
  );
});

test('rejects invalid dates and public entries without a mapped release category', () => {
  const { plan, commits } = fixture();
  assert.throws(
    () => renderChangelogSection({ plan, commits, repositoryUrl: repo, date: 'yesterday' }),
    /valid UTC release date/
  );
  const unknown = fixture({ classified: { type: 'build', description: 'change build output' } });
  assert.throws(
    () => renderChangelogSection({ ...unknown, repositoryUrl: repo, date: '2026-10-05' }),
    /No public changelog section/
  );
});

test('does not expose security commit details or body text in public notes', () => {
  const secure = fixture({
    commit: {
      subject: 'security(api): prevent access using leaked internal token',
      body: 'Internal advisory details that are not approved for publication.',
    },
    classified: {
      type: 'security',
      description: 'prevent access using leaked internal token',
    },
  });
  const output = renderChangelogSection({
    ...secure,
    repositoryUrl: repo,
    date: '2026-10-05',
  });
  assert.match(output, /### Security/);
  assert.match(output, /Security improvement/);
  assert.doesNotMatch(output, /leaked internal token|Internal advisory details/);
});
