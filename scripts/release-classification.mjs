const commitTypes = new Set([
  'build',
  'chore',
  'ci',
  'deps',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'release',
  'revert',
  'security',
  'style',
  'test',
]);

const releaseKinds = Object.freeze({
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  revert: 'patch',
  security: 'patch',
});

const severity = Object.freeze({ none: 0, patch: 1, minor: 2, major: 3 });
const breakingFooter = /(?:^|\n)(?:BREAKING CHANGE|BREAKING-CHANGE):\s*\S/im;

export function parseConventionalCommit(commit) {
  const subject = commit.subject?.trim() ?? '';
  const match =
    /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^()\r\n]+)\))?(?<breaking>!)?: (?<description>\S.*)$/.exec(
      subject
    );
  if (!match?.groups || !commitTypes.has(match.groups.type)) {
    return {
      valid: false,
      reason: 'subject must use a supported Conventional Commit type and format',
    };
  }

  const isBreaking = match.groups.breaking === '!' || breakingFooter.test(commit.body ?? '');
  return {
    valid: true,
    type: match.groups.type,
    scope: match.groups.scope ?? null,
    description: match.groups.description,
    isBreaking,
    changeKind: isBreaking ? 'major' : (releaseKinds[match.groups.type] ?? 'none'),
  };
}

export function classifyCommits(commits) {
  const seen = new Set();
  const classified = [];
  const invalidCommits = [];
  const skippedMergeCommits = [];

  for (const commit of commits) {
    const sha = commit.sha?.toLowerCase();
    if (!sha) {
      invalidCommits.push({
        sha: '',
        subject: commit.subject ?? '',
        reason: 'commit SHA is required',
      });
      continue;
    }
    if (seen.has(sha)) continue;
    seen.add(sha);

    if (Array.isArray(commit.parents) && commit.parents.length > 1) {
      skippedMergeCommits.push(sha);
      continue;
    }

    const result = parseConventionalCommit(commit);
    if (!result.valid) {
      invalidCommits.push({ sha, subject: commit.subject ?? '', reason: result.reason });
      continue;
    }
    classified.push({ sha, subject: commit.subject, ...result });
  }

  const changeKind = invalidCommits.length
    ? 'invalid'
    : classified.reduce(
        (highest, commit) =>
          severity[commit.changeKind] > severity[highest] ? commit.changeKind : highest,
        'none'
      );

  return { changeKind, commits: classified, invalidCommits, skippedMergeCommits };
}
