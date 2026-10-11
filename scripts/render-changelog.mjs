import { createHash } from 'node:crypto';

const sectionTitles = Object.freeze({
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Performance',
  revert: 'Fixed',
  security: 'Security',
});

const repoPattern =
  /^https:\/\/github\.com\/(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const breakingUpgrade = /^UPGRADE:\s*(\S.*(?:\n[ \t]+\S.*)*)$/im;
export const releaseNotesBegin = '<!-- BEGIN MOONWITNESS GENERATED RELEASE NOTES -->';
export const releaseNotesEnd = '<!-- END MOONWITNESS GENERATED RELEASE NOTES -->';

function normalizeRepoUrl(value) {
  const match = repoPattern.exec(value ?? '');
  if (!match?.groups) throw new Error('Repository URL must be an HTTPS GitHub repository URL.');
  return `https://github.com/${match.groups.owner}/${match.groups.repo.replace(/\.git$/, '')}`;
}

function safeInlineText(value) {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function renderChangelogSection({ plan, commits, repositoryUrl, date }) {
  if (plan?.status !== 'planned' || !plan.nextVersion) {
    throw new Error('Only a planned release with a next version can render changelog notes.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error('A valid UTC release date is required in YYYY-MM-DD format.');
  }
  const repoUrl = normalizeRepoUrl(repositoryUrl);
  const releaseInputSha = computeReleaseInputSha(plan);
  const bySha = new Map(commits.map((commit) => [commit.sha.toLowerCase(), commit]));
  const releaseCommits = plan.releasableCommitShas.map((sha) => {
    const commit = bySha.get(sha.toLowerCase());
    if (!commit) throw new Error(`Planned commit ${sha} is missing from the source range.`);
    return commit;
  });
  const sections = new Map();
  const breakingNotes = [];

  for (const commit of releaseCommits) {
    const sha = commit.sha.toLowerCase();
    const classified = plan.commits?.find((item) => item.sha.toLowerCase() === sha);
    if (!classified) throw new Error(`Planned commit ${sha} has no classified metadata.`);
    const title = classified.isBreaking ? 'Breaking Changes' : sectionTitles[classified.type];
    if (!title) throw new Error(`No public changelog section is defined for ${classified.type}.`);
    const prMatch = /\(#(?<number>[1-9]\d*)\)\s*$/.exec(commit.subject);
    const links = [`[${sha.slice(0, 7)}](${repoUrl}/commit/${sha})`];
    if (prMatch?.groups)
      links.push(`[PR #${prMatch.groups.number}](${repoUrl}/pull/${prMatch.groups.number})`);
    const description =
      classified.type === 'security'
        ? 'Security improvement'
        : safeInlineText(classified.description);
    const entry = `- ${description} (${links.join(', ')})`;
    if (!sections.has(title)) sections.set(title, []);
    sections.get(title).push(entry);

    if (classified.isBreaking) {
      const upgrade = breakingUpgrade.exec(commit.body ?? '')?.[1];
      if (!upgrade) {
        throw new Error(
          `Breaking commit ${sha.slice(0, 7)} requires a non-empty UPGRADE: trailer before changelog generation.`
        );
      }
      breakingNotes.push(`  - **Upgrade:** ${safeInlineText(upgrade)}`);
    }
  }

  const orderedTitles = ['Breaking Changes', 'Security', 'Added', 'Fixed', 'Performance'];
  const blocks = [];
  for (const title of orderedTitles) {
    const entries = sections.get(title);
    if (!entries) continue;
    blocks.push(`### ${title}\n\n${entries.join('\n')}`);
    if (title === 'Breaking Changes' && breakingNotes.length > 0) {
      blocks.push(`### Upgrade Notes\n\n${breakingNotes.join('\n')}`);
    }
  }

  if (blocks.length === 0) throw new Error('Release plan contains no public changelog entries.');
  return [
    `## [${plan.nextVersion.replace(/^v/u, '')}] - ${date}`,
    releaseNotesBegin,
    `<!-- release-source-sha: ${plan.source.headSha}; baseline: ${plan.source.baselineSha}; input: ${releaseInputSha} -->`,
    '',
    blocks.join('\n\n'),
    releaseNotesEnd,
    '',
  ].join('\n');
}

export function computeReleaseInputSha(plan) {
  if (!plan?.source?.baselineSha || !plan.nextVersion || !Array.isArray(plan.releasableCommitShas))
    throw new Error('Release input fingerprint requires baseline, version and source commits.');
  return createHash('sha256')
    .update(
      JSON.stringify({
        baselineSha: plan.source.baselineSha,
        version: plan.nextVersion,
        releasableCommitShas: [...plan.releasableCommitShas].sort(),
      })
    )
    .digest('hex');
}
