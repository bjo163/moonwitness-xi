import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  collectLifecycleSnapshot,
  completedExactDevPullRequestTechnicalGate,
  flattenGitHubPages,
  isExactDevMainPullRequest,
  selectExactDevPullRequestCiRun,
} from './collect-lifecycle-snapshot.mjs';

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

async function ghJsonObject(args) {
  const { stdout } = await execFileAsync('gh', ['api', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

export async function waitForCurrentDevPullRequestTechnicalGate({
  repository,
  sourceSha,
  readDevHead,
  readWorkflowRuns,
  readPullRequest,
  readJobs,
  sleep = delay,
  now = Date.now,
  onHeartbeat = () => {},
  timeoutMs = 25 * 60 * 1000,
}) {
  const deadline = now() + timeoutMs;
  let lastHeartbeat = 0;
  while (now() < deadline) {
    if ((await readDevHead()) !== sourceSha) return { status: 'stale' };
    const pages = await readWorkflowRuns();
    const run = selectExactDevPullRequestCiRun(pages, sourceSha);
    if (run) {
      const pullRequest = await readPullRequest(run.pull_request_number);
      if (!isExactDevMainPullRequest(pullRequest, sourceSha, repository, run.pull_request_number)) {
        if ((await readDevHead()) !== sourceSha) return { status: 'stale' };
        throw new Error(
          `The CI run for ${sourceSha} is not tied to a same-repository dev-to-main pull request.`
        );
      }
    }
    if (run?.status === 'completed') {
      const jobPages = await readJobs(run.id);
      return {
        status: 'ready',
        checkRuns: completedExactDevPullRequestTechnicalGate(run, jobPages),
      };
    }
    const currentTime = now();
    if (currentTime - lastHeartbeat >= 60_000) {
      const runStatus = run ? `run ${run.id} is ${run.status}` : 'no exact-source PR run found yet';
      onHeartbeat(
        `Waiting for the exact dev-to-main PR technical gate at ${sourceSha}: ${runStatus}.`
      );
      lastHeartbeat = currentTime;
    }
    await sleep(15_000);
  }
  throw new Error(
    `The exact dev-to-main PR ci-technical-gate did not complete within 25 minutes for ${sourceSha}; no lifecycle snapshot was written.`
  );
}

export async function writeSnapshotIfDevHeadIsCurrent({ sourceSha, readDevHead, writeSnapshot }) {
  if ((await readDevHead()) !== sourceSha) return false;
  await writeSnapshot();
  return true;
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

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const repositoryId = process.env.GITHUB_REPOSITORY_ID;
  const eventSha = process.env.SOURCE_SHA ?? process.env.GITHUB_SHA;
  if (!repository || !repositoryId || !eventSha)
    throw new Error(
      'GITHUB_REPOSITORY, GITHUB_REPOSITORY_ID and a workflow source SHA are required.'
    );
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
  const [gateResult, releasePages] = await Promise.all([
    waitForCurrentDevPullRequestTechnicalGate({
      repository,
      sourceSha: branchHeads.dev,
      readDevHead: async () =>
        (await ghJsonObject([`repos/${repository}/git/ref/heads/dev`])).object?.sha,
      readWorkflowRuns: () =>
        ghJson([
          `repos/${repository}/actions/workflows/ci.yml/runs?branch=dev&event=pull_request&per_page=100`,
        ]),
      readPullRequest: (number) => ghJsonObject([`repos/${repository}/pulls/${number}`]),
      readJobs: (runId) => ghJson([`repos/${repository}/actions/runs/${runId}/jobs?per_page=100`]),
      onHeartbeat: (message) => process.stdout.write(`${message}\n`),
    }),
    ghJson([`repos/${repository}/releases?per_page=100`]),
  ]);
  if (gateResult.status === 'stale') {
    process.stdout.write(
      `Skipping stale issue-sync event: dev advanced beyond ${branchHeads.dev}.\n`
    );
    return;
  }
  const checkRuns = gateResult.checkRuns;
  const releases = flattenGitHubPages(releasePages);
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
  const snapshotWritten = await writeSnapshotIfDevHeadIsCurrent({
    sourceSha: branchHeads.dev,
    readDevHead: async () =>
      (await ghJsonObject([`repos/${repository}/git/ref/heads/dev`])).object?.sha,
    writeSnapshot: async () =>
      writeFile(
        path.join(repositoryRoot, '.roadmap-lifecycle-snapshot.json'),
        `${JSON.stringify(snapshot, null, 2)}\n`,
        'utf8'
      ),
  });
  if (!snapshotWritten) {
    process.stdout.write(
      `Skipping stale issue-sync event: dev advanced beyond ${branchHeads.dev}.\n`
    );
    return;
  }
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
