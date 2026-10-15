import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readCommitRange, resolveCommit } from './git-range.mjs';
import { renderChangelogSection } from './render-changelog.mjs';

function repositoryUrlFromGit() {
  const origin = execFileSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const ssh =
    /^git@github\.com:(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(origin);
  if (ssh?.groups) return `https://github.com/${ssh.groups.owner}/${ssh.groups.repo}`;
  return origin.replace(/\.git$/, '');
}

async function main(args) {
  const [planPath, date] = args;
  if (!planPath || !date || args.length !== 2) {
    throw new Error('Usage: pnpm release:changelog <plan.json> <YYYY-MM-DD>');
  }
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const baselineSha = resolveCommit(plan.source?.baselineSha ?? '');
  const headSha = resolveCommit(plan.source?.headSha ?? '');
  if (baselineSha !== plan.source.baselineSha || headSha !== plan.source.headSha) {
    throw new Error('Release plan source references must be full, resolved commit SHAs.');
  }
  const commits = readCommitRange(baselineSha, headSha);
  process.stdout.write(
    renderChangelogSection({
      plan,
      commits,
      repositoryUrl: repositoryUrlFromGit(),
      date,
    })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
