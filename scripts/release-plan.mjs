import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { classifyCommits } from './release-classification.mjs';
import { readCommitRange, resolveCommit } from './git-range.mjs';

const semverPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/;

function parseVersion(value) {
  const match = semverPattern.exec(value ?? '');
  if (!match) throw new Error(`Invalid supported release version: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? null : Number(match[4]),
  };
}

function formatVersion(version) {
  const suffix = version.prerelease === null ? '' : `-rc.${version.prerelease}`;
  return `v${version.major}.${version.minor}.${version.patch}${suffix}`;
}

function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease - right.prerelease;
}

function listReleaseTags() {
  const output = execFileSync('git', ['tag', '--list', 'v[0-9]*'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output
    .split(/\r?\n/)
    .filter((tag) => semverPattern.test(tag))
    .map((tag) => ({ tag, version: parseVersion(tag) }))
    .sort((left, right) => compareVersions(right.version, left.version));
}

function parseArguments(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') {
      options.set(argument, true);
    } else if (['--head', '--baseline-tag', '--baseline-sha'].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      options.set(argument, value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.has('--baseline-tag') && options.has('--baseline-sha')) {
    throw new Error('Choose either --baseline-tag or --baseline-sha');
  }
  return options;
}

export function createReleasePlan({ tags, headSha, commits }) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('No valid release tag exists; establish the first-stable baseline explicitly.');
  }
  const sortedTags = tags
    .map((tag) => ({ tag: tag.tag, version: parseVersion(tag.tag) }))
    .sort((left, right) => compareVersions(right.version, left.version));
  const baseline = sortedTags[0];
  const classification = classifyCommits(commits);
  const result = {
    schemaVersion: 1,
    source: { baselineTag: baseline.tag, baselineSha: null, headSha },
    status: classification.changeKind === 'invalid' ? 'invalid' : 'planned',
    changeKind: classification.changeKind,
    commits: classification.commits.map(
      ({ sha, subject, type, scope, description, isBreaking, changeKind }) => ({
        sha,
        subject,
        type,
        scope,
        description,
        isBreaking,
        changeKind,
      })
    ),
    currentVersion: formatVersion(baseline.version),
    nextVersion: null,
    releasableCommitShas: classification.commits
      .filter((commit) => commit.changeKind !== 'none')
      .map((commit) => commit.sha),
    ignoredCommitShas: classification.commits
      .filter((commit) => commit.changeKind === 'none')
      .map((commit) => commit.sha),
    skippedMergeShas: classification.skippedMergeCommits,
    invalidCommits: classification.invalidCommits,
    writesPerformed: false,
  };

  if (classification.changeKind === 'invalid') return result;
  if (classification.changeKind === 'none') {
    result.status = 'no-release';
    return result;
  }

  const next = { ...baseline.version };
  if (classification.changeKind === 'major') {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
  } else if (classification.changeKind === 'minor') {
    next.minor += 1;
    next.patch = 0;
  } else {
    next.patch += 1;
  }
  next.prerelease = 1;
  result.nextVersion = formatVersion(next);
  return result;
}

function resolvePlan(options) {
  const allTags = listReleaseTags();
  const selectedTag = options.get('--baseline-tag');
  let baselineTag;
  let baselineSha;

  if (selectedTag) {
    baselineTag = allTags.find(({ tag }) => tag === selectedTag)?.tag;
    if (!baselineTag)
      throw new Error(`Baseline tag is not a valid local release tag: ${selectedTag}`);
    baselineSha = resolveCommit(baselineTag);
  } else if (options.has('--baseline-sha')) {
    baselineSha = resolveCommit(options.get('--baseline-sha'));
    baselineTag = allTags.find(({ tag }) => resolveCommit(tag) === baselineSha)?.tag ?? null;
    if (!baselineTag) throw new Error('Baseline SHA must resolve to an existing release tag.');
  } else {
    baselineTag = allTags[0]?.tag;
    if (!baselineTag)
      throw new Error(
        'No valid release tag exists; establish the first-stable baseline explicitly.'
      );
    baselineSha = resolveCommit(baselineTag);
  }

  const headSha = resolveCommit(options.get('--head') ?? 'HEAD');
  const commits = readCommitRange(baselineSha, headSha);
  const plan = createReleasePlan({ tags: [{ tag: baselineTag }], headSha, commits });
  plan.source.baselineSha = baselineSha;
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const plan = resolvePlan(options);
    process.stdout.write(`${JSON.stringify(plan, null, options.has('--json') ? 0 : 2)}\n`);
    if (plan.status === 'invalid') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write(
      'Usage: pnpm release:plan [--head <ref>] [--baseline-tag <tag> | --baseline-sha <sha>] [--json]\n'
    );
    process.exitCode = 2;
  }
}
