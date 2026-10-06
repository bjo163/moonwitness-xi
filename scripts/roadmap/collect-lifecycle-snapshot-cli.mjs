import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectLifecycleSnapshot } from './collect-lifecycle-snapshot.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const execFileAsync = promisify(execFile);

function git(args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}

async function ghJson(args) {
  const { stdout } = await execFileAsync('gh', ['api', '--paginate', '--slurp', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function isAncestor(sourceSha, branchHeadSha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sourceSha, branchHeadSha], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw new Error('Unable to verify local Git ancestry for lifecycle snapshot.', {
      cause: error,
    });
  }
}

function hasCommit(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    if (error.status === 1 || error.status === 128) return false;
    throw new Error('Unable to resolve evidence source commit.', { cause: error });
  }
}

function resolveReleaseCommit(tag) {
  if (!/^v?(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/u.test(tag))
    return undefined;
  try {
    return git(['rev-parse', `refs/tags/${tag}^{commit}`]);
  } catch {
    return undefined;
  }
}

function flattenPages(pages, property) {
  if (!Array.isArray(pages)) throw new Error('GitHub API pagination returned an invalid response.');
  return pages.flatMap((page) => {
    const values = property ? page?.[property] : page;
    if (!Array.isArray(values)) throw new Error('GitHub API pagination page has an invalid shape.');
    return values;
  });
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const repositoryId = process.env.GITHUB_REPOSITORY_ID;
  const eventSha = process.env.GITHUB_SHA;
  if (!repository || !repositoryId || !eventSha)
    throw new Error('GITHUB_REPOSITORY, GITHUB_REPOSITORY_ID and GITHUB_SHA are required.');
  execFileSync(
    process.execPath,
    [path.join(repositoryRoot, 'scripts/roadmap/validate-roadmap.mjs')],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
    }
  );
  const currentSha = git(['rev-parse', 'HEAD']);
  if (currentSha !== eventSha)
    throw new Error('Checkout HEAD does not match the workflow event SHA.');
  const index = JSON.parse(
    await readFile(path.join(repositoryRoot, 'docs/roadmap/tasks.json'), 'utf8')
  );
  const roadmap = await readFile(path.join(repositoryRoot, 'ROADMAP.md'), 'utf8');
  const branchHeads = {
    dev: git(['rev-parse', 'refs/remotes/origin/dev']),
    main: git(['rev-parse', 'refs/remotes/origin/main']),
  };
  const [checkPages, releasePages] = await Promise.all([
    ghJson([`repos/${repository}/commits/${branchHeads.dev}/check-runs?per_page=100`]),
    ghJson([`repos/${repository}/releases?per_page=100`]),
  ]);
  const checkRuns = flattenPages(checkPages, 'check_runs');
  const releases = flattenPages(releasePages);
  const snapshot = await collectLifecycleSnapshot({
    tasks: index.tasks,
    roadmap,
    readEvidence: async (relativePath) => {
      const absolutePath = path.resolve(repositoryRoot, relativePath);
      if (!absolutePath.startsWith(`${repositoryRoot}${path.sep}`))
        throw new Error('Evidence path escapes the repository.');
      try {
        return await readFile(absolutePath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return '';
        throw error;
      }
    },
    repositoryId,
    sourceSha: eventSha,
    branchHeads,
    checkRuns,
    releases,
    resolveReleaseCommit,
    commitExists: hasCommit,
    isAncestor,
  });
  const outputPath = path.join(repositoryRoot, '.roadmap-lifecycle-snapshot.json');
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `Collected read-only lifecycle snapshot for ${snapshot.tasks.length} tasks at ${snapshot.sourceSha}.\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
