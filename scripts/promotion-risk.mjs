import { classifyCommits } from './release-classification.mjs';

const sensitivePaths = [
  /^\.github\//,
  /^apps\/api\/src\//,
  /^packages\/(auth|orm|orm-base|jobs)\//,
  /^packages\/[^/]+\/(?:.*\/)?(?:models|addons|manifest)(\/|\.|$)/,
  /^apps\/[^/]+\/package\.json$/,
  /^packages\/[^/]+\/package\.json$/,
  /^(Dockerfile|docker-compose\.production\.yml|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/,
  /^scripts\//,
];

function normalizedPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isSensitiveChange(change) {
  const filePath = normalizedPath(change.path ?? '').toLowerCase();
  const previousPath = normalizedPath(change.previousPath ?? '').toLowerCase();
  return [filePath, previousPath].some((candidate) =>
    sensitivePaths.some((pattern) => pattern.test(candidate))
  );
}

export function classifyPromotionRisk({ commits, changes }) {
  const release = classifyCommits(commits);
  const reasons = new Set();

  if (release.changeKind === 'invalid') reasons.add('invalid-commit-message');
  if (release.changeKind === 'major') reasons.add('breaking-change');

  for (const commit of release.commits) {
    const scope = commit.scope?.toLowerCase() ?? '';
    if (
      commit.type === 'security' ||
      /(^|[-/])(auth|access|permission|policy|security|schema|database|orm)([-/]|$)/.test(scope)
    ) {
      reasons.add(`sensitive-commit:${commit.sha}`);
    }
  }

  for (const change of changes) {
    if (change.status === 'D') reasons.add(`file-deletion:${normalizedPath(change.path)}`);
    if (isSensitiveChange(change)) reasons.add(`sensitive-path:${normalizedPath(change.path)}`);
  }

  return {
    changeKind: release.changeKind,
    requiresApproval: reasons.size > 0,
    reasons: [...reasons].sort(),
    invalidCommits: release.invalidCommits,
    sourceCommitCount: release.commits.length,
    skippedMergeCount: release.skippedMergeCommits.length,
  };
}
