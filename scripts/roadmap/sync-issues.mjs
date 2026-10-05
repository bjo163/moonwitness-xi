import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const beginMarker = '<!-- BEGIN MOONWITNESS MANAGED -->';
const endMarker = '<!-- END MOONWITNESS MANAGED -->';

/**
 * @typedef {{ number: number, title: string, body: string, state: 'open'|'closed', pull_request?: unknown }} RemoteIssue
 * @typedef {{ taskId: string, operation: 'create'|'update'|'noop'|'conflict', issueNumber?: number, reason?: string, title: string, body: string }} IssueOperation
 */

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function replaceManagedBlock(body, block) {
  const currentBlock = readManagedBlock(body);
  if (currentBlock === undefined) {
    const notes = body.trim();
    return [block, notes].filter(Boolean).join('\n\n');
  }
  const start = body.indexOf(beginMarker);
  const end = body.indexOf(endMarker, start) + endMarker.length;
  const blockStart = start;
  const blockEnd = end;
  if (blockStart < 0 || blockEnd <= blockStart)
    throw new Error('Issue body has malformed managed-block boundaries.');
  return `${body.slice(0, blockStart)}${block}${body.slice(blockEnd)}`.trim();
}

function readManagedBlock(body) {
  const start = body.indexOf(beginMarker);
  const end = body.indexOf(endMarker);
  const hasBegin = start >= 0;
  const hasEnd = end >= 0;
  if (!hasBegin && !hasEnd) return undefined;
  if (
    !hasBegin ||
    !hasEnd ||
    end <= start ||
    body.indexOf(beginMarker, start + beginMarker.length) >= 0 ||
    body.indexOf(endMarker, end + endMarker.length) >= 0
  ) {
    throw new Error('Issue body has malformed or duplicate managed-block boundaries.');
  }
  const after = end + endMarker.length;
  return body.slice(start, after);
}

function generatedBlock(task, repositoryId, sourceSha) {
  const dependencies = task.dependsOn.length ? task.dependsOn.join(', ') : 'None';
  return [
    beginMarker,
    `Task: ${task.id}`,
    `Milestone: ${task.milestone}`,
    `Source SHA: ${sourceSha}`,
    `Card: ${task.detailFile}`,
    `Dependencies: ${dependencies}`,
    '',
    '## Scope',
    task.title,
    '',
    '## Deliverable',
    task.output,
    endMarker,
  ].join('\n');
}

/**
 * Pure deterministic planner. It never writes files or calls a remote API.
 * @param {{ tasks: Array<{id: string, title: string, milestone: string, dependsOn: string[], detailFile: string, output: string}>, issues: RemoteIssue[], repositoryId: string, sourceSha: string }} input
 * @returns {{ repositoryId: string, sourceSha: string, inputHash: string, operations: IssueOperation[] }}
 */
export function planIssueSync({ tasks, issues, repositoryId, sourceSha }) {
  if (!/^[1-9][0-9]*$/u.test(repositoryId))
    throw new Error('repositoryId must be a numeric GitHub repository ID.');
  if (!/^[a-f0-9]{40}$/u.test(sourceSha))
    throw new Error('sourceSha must be a full lowercase Git commit SHA.');
  const byTask = new Map();
  for (const issue of issues) {
    if (issue.pull_request || (issue.state !== 'open' && issue.state !== 'closed')) continue;
    const markers = [
      ...issue.body.matchAll(
        /^<!-- moonwitness-task: ([1-9][0-9]*):(M(?:0|[1-9][0-9]*)\.[0-9]{2}) -->$/gmu
      ),
    ];
    for (const [, repoId, taskId] of markers) {
      if (repoId !== repositoryId) continue;
      const matches = byTask.get(taskId) ?? [];
      matches.push(issue);
      byTask.set(taskId, matches);
    }
  }

  const operations = tasks.map((task) => {
    const matches = byTask.get(task.id) ?? [];
    const block = generatedBlock(task, repositoryId, sourceSha);
    if (matches.length > 1)
      return {
        taskId: task.id,
        operation: 'conflict',
        reason: `Duplicate managed identity on issues ${matches.map((issue) => issue.number).join(', ')}.`,
        title: `[${task.id}] ${task.title}`,
        body: '',
      };
    const marker = `<!-- moonwitness-task: ${repositoryId}:${task.id} -->`;
    const title = `[${task.id}] ${task.title}`;
    if (matches.length === 0)
      return { taskId: task.id, operation: 'create', title, body: `${marker}\n${block}\n` };
    const issue = matches[0];
    let body;
    let currentBlock;
    try {
      currentBlock = readManagedBlock(issue.body);
      body = replaceManagedBlock(issue.body, block);
    } catch (error) {
      return {
        taskId: task.id,
        operation: 'conflict',
        issueNumber: issue.number,
        reason: error.message,
        title,
        body: '',
      };
    }
    if (issue.title === title && currentBlock === block)
      return {
        taskId: task.id,
        operation: 'noop',
        issueNumber: issue.number,
        title,
        body: issue.body,
      };
    return { taskId: task.id, operation: 'update', issueNumber: issue.number, title, body };
  });
  const inputHash = sha256(
    JSON.stringify({
      repositoryId,
      sourceSha,
      tasks,
      issues: issues
        .map(({ number, title, body, state, pull_request }) => ({
          number,
          title,
          body,
          state,
          pull_request: Boolean(pull_request),
        }))
        .sort((a, b) => a.number - b.number),
    })
  );
  return { repositoryId, sourceSha, inputHash, operations };
}

/** GitHub REST adapter; list-all follows pagination and retains closed issues. */
export function createGitHubIssuesClient({ token, owner, repo, fetchImpl = globalThis.fetch }) {
  if (!token) throw new Error('GITHUB_TOKEN is required for GitHub API access.');
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  async function request(url, init = {}) {
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok)
      throw new Error(`GitHub Issues API ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }
  return {
    async listAll() {
      const result = [];
      for (const state of ['open', 'closed']) {
        let page = 1;
        while (true) {
          const batch = await request(`${base}?state=${state}&per_page=100&page=${page}`);
          result.push(...batch);
          if (batch.length < 100) break;
          page += 1;
        }
      }
      return result;
    },
    async create(operation) {
      return request(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: operation.title, body: operation.body }),
      });
    },
    async update(operation) {
      return request(`${base}/${operation.issueNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: operation.title, body: operation.body }),
      });
    },
  };
}

/** Apply only when explicitly requested; reload and re-plan before serial writes. */
export async function applyIssuePlan({ plan, client, tasks, repositoryId, sourceSha }) {
  const freshIssues = await client.listAll();
  const fresh = planIssueSync({ tasks, issues: freshIssues, repositoryId, sourceSha });
  if (fresh.inputHash !== plan.inputHash)
    throw new Error('Remote issues changed after planning; refresh the plan before applying.');
  const conflict = fresh.operations.find((operation) => operation.operation === 'conflict');
  if (conflict) throw new Error(`Cannot apply ${conflict.taskId}: ${conflict.reason}`);
  const results = [];
  for (const operation of fresh.operations) {
    if (operation.operation === 'create') {
      // On ambiguous create failure, re-read the stable marker before retrying.
      try {
        results.push({ taskId: operation.taskId, issue: await client.create(operation) });
      } catch (error) {
        const retryPlan = planIssueSync({
          tasks: [tasks.find(({ id }) => id === operation.taskId)],
          issues: await client.listAll(),
          repositoryId,
          sourceSha,
        });
        const found = retryPlan.operations[0];
        if (found.operation === 'update' || found.operation === 'noop')
          results.push({
            taskId: operation.taskId,
            issueNumber: found.issueNumber,
            recovered: true,
          });
        else throw error;
      }
    } else if (operation.operation === 'update')
      results.push({ taskId: operation.taskId, issue: await client.update(operation) });
  }
  return results;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const owner = process.env.GITHUB_REPOSITORY?.split('/')[0];
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const repositoryId = process.env.GITHUB_REPOSITORY_ID;
  if (!owner || !repo || !repositoryId)
    throw new Error('Set GITHUB_REPOSITORY and GITHUB_REPOSITORY_ID.');
  const index = JSON.parse(
    await readFile(path.join(repositoryRoot, 'docs/roadmap/tasks.json'), 'utf8')
  );
  execFileSync(
    process.execPath,
    [path.join(repositoryRoot, 'scripts/roadmap/validate-roadmap.mjs')],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
    }
  );
  const sha = process.env.GITHUB_SHA ?? process.env.SOURCE_SHA;
  const sourceSha =
    sha ??
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const token = process.env.GITHUB_TOKEN;
  const client = createGitHubIssuesClient({ token, owner, repo });
  const issues = await client.listAll();
  const plan = planIssueSync({ tasks: index.tasks, issues, repositoryId, sourceSha });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!apply) return;
  const results = await applyIssuePlan({
    plan,
    client,
    tasks: index.tasks,
    repositoryId,
    sourceSha,
  });
  process.stdout.write(`Applied ${results.length} create/update operations.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
