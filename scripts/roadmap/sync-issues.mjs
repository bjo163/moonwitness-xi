import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const beginMarker = '<!-- BEGIN MOONWITNESS MANAGED -->';
const endMarker = '<!-- END MOONWITNESS MANAGED -->';

/**
 * @typedef {{ number: number, title: string, body: string, state: 'open'|'closed', labels?: Array<{name: string}>, milestone?: {number: number, title: string}|null, assignees?: Array<{login: string}>, pull_request?: unknown }} RemoteIssue
 * @typedef {{ taskId: string, operation: 'create'|'update'|'noop'|'conflict', issueNumber?: number, reason?: string, title: string, body: string, labels?: string[], assignees?: string[], managedLabels?: string[], managedAssignees?: string[], milestoneTitle?: string, expectedTitle?: string, expectedManagedBlock?: string, expectedMilestoneTitle?: string }} IssueOperation
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

function taskCardSection(markdown, taskId) {
  const lines = markdown.split(/\r?\n/u);
  const start = lines.findIndex((line) =>
    new RegExp(`^##\\s+${taskId.replace('.', '\\.')}\\b`, 'u').test(line)
  );
  if (start < 0) throw new Error(`Roadmap card is missing the ${taskId} section.`);
  const end = lines.findIndex((line, index) => index > start && /^##\s/u.test(line));
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

function subsection(markdown, heading) {
  const lines = markdown.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === `### ${heading}`);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^#{1,3}\s/u.test(line));
  return lines
    .slice(start + 1, end < 0 ? lines.length : end)
    .join('\n')
    .trim();
}

export function renderTaskCardDetails(markdown, taskId) {
  const card = taskCardSection(markdown, taskId);
  return {
    steps: subsection(card, 'Langkah pelaksanaan'),
    acceptance: subsection(card, 'Verifikasi dan syarat selesai'),
  };
}

function generatedBlock(task, sourceSha, options) {
  const dependencies = task.dependsOn.length
    ? task.dependsOn
        .map((dependencyId) => {
          const issueNumber = options.issueNumbersByTask.get(dependencyId);
          return issueNumber
            ? options.repositoryUrl
              ? `[${dependencyId}](${options.repositoryUrl}/issues/${issueNumber})`
              : `#${issueNumber}`
            : `\`${dependencyId}\` (issue not created yet)`;
        })
        .join(', ')
    : 'None';
  const cardUrl = options.repositoryUrl
    ? `${options.repositoryUrl}/blob/${sourceSha}/${task.detailFile}`
    : undefined;
  const evidenceUrl =
    task.evidence && options.repositoryUrl
      ? `${options.repositoryUrl}/blob/${sourceSha}/${task.evidence}`
      : undefined;
  const details = options.cardDetailsByTask.get(task.id);
  return [
    beginMarker,
    `Task: ${task.id}`,
    `Milestone: ${task.milestone}`,
    `Source SHA: ${sourceSha}`,
    `Card: ${cardUrl ? `[${task.detailFile}](${cardUrl})` : task.detailFile}`,
    ...(evidenceUrl ? [`Evidence: [${task.evidence}](${evidenceUrl})`] : []),
    ...(!evidenceUrl ? ['Evidence: not recorded yet'] : []),
    `Dependencies: ${dependencies}`,
    '',
    '## Scope',
    task.title,
    '',
    '## Deliverable',
    task.output,
    ...(details?.steps ? ['', '## Implementation steps', details.steps] : []),
    ...(details?.acceptance ? ['', '## Acceptance criteria', details.acceptance] : []),
    endMarker,
  ].join('\n');
}

/**
 * Pure deterministic planner. It never writes files or calls a remote API.
 * @param {{ tasks: Array<{id: string, title: string, milestone: string, dependsOn: string[], detailFile: string, output: string, evidence?: string, labels?: string[], priority?: string, assignee?: string}>, issues: RemoteIssue[], repositoryId: string, sourceSha: string, repositoryUrl?: string, cardDetailsByTask?: Map<string, {steps: string, acceptance: string}> }} input
 * @returns {{ repositoryId: string, sourceSha: string, inputHash: string, operations: IssueOperation[] }}
 */
export function planIssueSync({
  tasks,
  issues,
  repositoryId,
  sourceSha,
  repositoryUrl,
  cardDetailsByTask = new Map(),
}) {
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

  const issueNumbersByTask = new Map(
    [...byTask].flatMap(([taskId, matches]) =>
      matches.length === 1 ? [[taskId, matches[0].number]] : []
    )
  );
  const renderOptions = { repositoryUrl, cardDetailsByTask, issueNumbersByTask };
  const operations = tasks.map((task) => {
    const matches = byTask.get(task.id) ?? [];
    const block = generatedBlock(task, sourceSha, renderOptions);
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
    const managedLabels = [
      'roadmap',
      `milestone:${task.milestone.toLowerCase()}`,
      ...(task.priority ? [`priority:${task.priority}`] : []),
      ...(task.labels ?? []),
    ];
    const assignees = [
      ...new Set([
        ...(matches[0]?.assignees ?? []).map(({ login }) => login),
        ...(task.assignee ? [task.assignee] : []),
      ]),
    ].sort();
    const managedAssignees = task.assignee ? [task.assignee] : [];
    if (matches.length === 0)
      return {
        taskId: task.id,
        operation: 'create',
        title,
        body: `${marker}\n${block}\n`,
        labels: [...new Set(managedLabels)].sort(),
        assignees,
        managedLabels: [...new Set(managedLabels)].sort(),
        managedAssignees,
        milestoneTitle: task.milestone,
      };
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
    const labelsByName = new Map(
      (issue.labels ?? []).map(({ name }) => [name.toLowerCase(), name])
    );
    for (const label of managedLabels) {
      if (!labelsByName.has(label.toLowerCase())) labelsByName.set(label.toLowerCase(), label);
    }
    const desiredLabels = [...labelsByName.values()].sort();
    if (
      issue.title === title &&
      currentBlock === block &&
      issue.milestone?.title === task.milestone &&
      JSON.stringify((issue.labels ?? []).map(({ name }) => name).sort()) ===
        JSON.stringify(desiredLabels) &&
      JSON.stringify((issue.assignees ?? []).map(({ login }) => login).sort()) ===
        JSON.stringify(assignees)
    )
      return {
        taskId: task.id,
        operation: 'noop',
        issueNumber: issue.number,
        title,
        body: issue.body,
        labels: desiredLabels,
        assignees,
        managedLabels: [...new Set(managedLabels)].sort(),
        managedAssignees,
        milestoneTitle: task.milestone,
      };
    return {
      taskId: task.id,
      operation: 'update',
      issueNumber: issue.number,
      title,
      body,
      labels: desiredLabels,
      assignees,
      managedLabels: [...new Set(managedLabels)].sort(),
      managedAssignees,
      milestoneTitle: task.milestone,
      expectedTitle: issue.title,
      expectedManagedBlock: currentBlock,
      expectedMilestoneTitle: issue.milestone?.title,
    };
  });
  const inputHash = sha256(
    JSON.stringify({
      repositoryId,
      sourceSha,
      tasks,
      issues: issues
        .map(({ number, title, body, state, labels, milestone, assignees, pull_request }) => ({
          number,
          title,
          body,
          state,
          labels: (labels ?? []).map(({ name }) => name).sort(),
          milestone: milestone ? { number: milestone.number, title: milestone.title } : null,
          assignees: (assignees ?? []).map(({ login }) => login).sort(),
          pull_request: Boolean(pull_request),
        }))
        .sort((a, b) => a.number - b.number),
    })
  );
  return { repositoryId, sourceSha, inputHash, operations };
}

/** GitHub REST adapter; list-all follows pagination and retains closed issues. */
export function createGitHubIssuesClient({
  token,
  owner,
  repo,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  now = Date.now,
  maxRetryDelayMs = 60_000,
}) {
  if (!token) throw new Error('GITHUB_TOKEN is required for GitHub API access.');
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  async function request(url, init = {}) {
    const method = init.method ?? 'GET';
    const canRetry = method === 'GET';
    for (let attempt = 0; ; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, {
          ...init,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(init.headers ?? {}),
          },
        });
      } catch (error) {
        if (!canRetry || attempt >= 3)
          throw new Error(`GitHub Issues API request failed: ${error.message}`, { cause: error });
        await sleepImpl(Math.min(500 * 2 ** attempt, maxRetryDelayMs));
        continue;
      }
      if (response.ok) return response.status === 204 ? null : response.json();

      const message = await response.text();
      const retryAfter = response.headers?.get('retry-after');
      const resetAt = Number(response.headers?.get('x-ratelimit-reset'));
      const remaining = response.headers?.get('x-ratelimit-remaining');
      const rateLimited =
        response.status === 429 ||
        (response.status === 403 && (remaining === '0' || /rate limit/iu.test(message)));
      const transient = [500, 502, 503, 504].includes(response.status);
      if (!canRetry || attempt >= 3 || (!rateLimited && !transient))
        throw new Error(`GitHub Issues API ${response.status}: ${message}`);

      let delayMs;
      if (retryAfter !== null && retryAfter !== undefined) {
        const seconds = Number(retryAfter);
        const retryDate = Date.parse(retryAfter);
        delayMs = Number.isFinite(seconds)
          ? seconds * 1000
          : Number.isFinite(retryDate)
            ? Math.max(0, retryDate - now())
            : undefined;
      }
      if (delayMs === undefined && rateLimited && Number.isFinite(resetAt) && resetAt > 0)
        delayMs = Math.max(0, resetAt * 1000 - now());
      delayMs ??= Math.min(500 * 2 ** attempt, maxRetryDelayMs);
      if (delayMs > maxRetryDelayMs)
        throw new Error(
          `GitHub Issues API ${response.status} retry delay ${delayMs}ms exceeds the configured ${maxRetryDelayMs}ms bound: ${message}`
        );
      await sleepImpl(delayMs);
    }
  }
  async function listPages(url) {
    const result = [];
    for (let page = 1; ; page += 1) {
      const batch = await request(`${url}?per_page=100&page=${page}`);
      result.push(...batch);
      if (batch.length < 100) return result;
    }
  }
  async function listMilestones() {
    const result = [];
    for (let page = 1; ; page += 1) {
      const batch = await request(
        `${base.replace(/\/issues$/u, '/milestones')}?state=all&per_page=100&page=${page}`
      );
      result.push(...batch);
      if (batch.length < 100) return result;
    }
  }
  async function listLabels() {
    return listPages(base.replace(/\/issues$/u, '/labels'));
  }
  async function validateAssignees(tasks) {
    const logins = [...new Set(tasks.flatMap((task) => (task.assignee ? [task.assignee] : [])))];
    for (const login of logins) {
      const user = await request(`https://api.github.com/users/${encodeURIComponent(login)}`);
      if (user.login.toLowerCase() !== login.toLowerCase())
        throw new Error(`GitHub did not resolve the requested assignee ${login}.`);
    }
    return logins;
  }
  async function ensureMetadata(tasks) {
    const milestones = await listMilestones();
    const labels = await listLabels();
    const milestoneNumbers = new Map(milestones.map(({ title, number }) => [title, number]));
    const labelNames = new Set(labels.map(({ name }) => name.toLowerCase()));
    const requiredMilestones = [...new Set(tasks.map(({ milestone }) => milestone))].sort();
    const requiredLabels = [
      ...new Set(
        tasks.flatMap((task) => [
          'roadmap',
          `milestone:${task.milestone.toLowerCase()}`,
          ...(task.priority ? [`priority:${task.priority}`] : []),
          ...(task.labels ?? []),
        ])
      ),
    ].sort();
    for (const title of requiredMilestones) {
      if (milestoneNumbers.has(title)) continue;
      const created = await request(base.replace(/\/issues$/u, '/milestones'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: `MoonWitness roadmap milestone ${title}.`,
          state: 'open',
        }),
      });
      milestoneNumbers.set(created.title, created.number);
    }
    for (const name of requiredLabels) {
      if (labelNames.has(name.toLowerCase())) continue;
      const color =
        name === 'roadmap' ? '1d76db' : name.startsWith('priority:') ? 'd93f0b' : 'c5def5';
      const created = await request(base.replace(/\/issues$/u, '/labels'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, description: 'Managed by MoonWitness roadmap sync.' }),
      });
      labelNames.add(created.name.toLowerCase());
    }
    return milestoneNumbers;
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
    async getIssue(issueNumber) {
      return request(`${base}/${issueNumber}`);
    },
    async listMetadata() {
      return { milestones: await listMilestones(), labels: await listLabels() };
    },
    validateAssignees,
    ensureMetadata,
    async create(operation) {
      return request(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: operation.title,
          body: operation.body,
          ...(operation.labels ? { labels: operation.labels } : {}),
          ...(operation.assignees?.length ? { assignees: operation.assignees } : {}),
          ...(operation.milestoneNumber ? { milestone: operation.milestoneNumber } : {}),
        }),
      });
    },
    async update(operation) {
      return request(`${base}/${operation.issueNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: operation.title,
          body: operation.body,
          ...(operation.labels ? { labels: operation.labels } : {}),
          ...(operation.assignees?.length ? { assignees: operation.assignees } : {}),
          ...(operation.milestoneNumber ? { milestone: operation.milestoneNumber } : {}),
        }),
      });
    },
  };
}

/** Apply only when explicitly requested; reload and re-plan before serial writes. */
export async function applyIssuePlan({
  plan,
  client,
  tasks,
  repositoryId,
  sourceSha,
  repositoryUrl,
  cardDetailsByTask,
}) {
  const freshIssues = await client.listAll();
  const fresh = planIssueSync({
    tasks,
    issues: freshIssues,
    repositoryId,
    sourceSha,
    repositoryUrl,
    cardDetailsByTask,
  });
  if (fresh.inputHash !== plan.inputHash)
    throw new Error('Remote issues changed after planning; refresh the plan before applying.');
  const conflict = fresh.operations.find((operation) => operation.operation === 'conflict');
  if (conflict) throw new Error(`Cannot apply ${conflict.taskId}: ${conflict.reason}`);
  const milestoneNumbers = client.ensureMetadata ? await client.ensureMetadata(tasks) : new Map();
  const operations = fresh.operations.map((operation) => ({
    ...operation,
    milestoneNumber: milestoneNumbers.get(operation.milestoneTitle),
  }));
  const results = [];
  for (const operation of operations) {
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
          repositoryUrl,
          cardDetailsByTask,
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
    } else if (operation.operation === 'update') {
      if (!client.getIssue)
        throw new Error('Issue client must support getIssue for safe concurrent updates.');
      const latest = await client.getIssue(operation.issueNumber);
      let latestBlock;
      try {
        latestBlock = readManagedBlock(latest.body);
      } catch (error) {
        throw new Error(`Cannot update #${operation.issueNumber}: ${error.message}`, {
          cause: error,
        });
      }
      const desiredBlock = readManagedBlock(operation.body);
      if (
        (latest.title !== operation.expectedTitle && latest.title !== operation.title) ||
        (latestBlock !== operation.expectedManagedBlock && latestBlock !== desiredBlock) ||
        (latest.milestone?.title !== operation.expectedMilestoneTitle &&
          latest.milestone?.title !== operation.milestoneTitle)
      )
        throw new Error(
          `Issue #${operation.issueNumber} changed in a managed field after planning; refresh the plan and review the conflict.`
        );
      const currentLabels = new Set((latest.labels ?? []).map(({ name }) => name.toLowerCase()));
      const currentAssignees = new Set(
        (latest.assignees ?? []).map(({ login }) => login.toLowerCase())
      );
      const metadataAlreadyCurrent =
        latest.milestone?.title === operation.milestoneTitle &&
        (operation.managedLabels ?? []).every((label) => currentLabels.has(label.toLowerCase())) &&
        (operation.managedAssignees ?? []).every((login) =>
          currentAssignees.has(login.toLowerCase())
        );
      if (
        latestBlock === desiredBlock &&
        latest.title === operation.title &&
        metadataAlreadyCurrent
      ) {
        results.push({
          taskId: operation.taskId,
          issueNumber: operation.issueNumber,
          unchanged: true,
        });
        continue;
      }
      const mergedLabels = new Map(
        (latest.labels ?? []).map(({ name }) => [name.toLowerCase(), name])
      );
      for (const label of operation.managedLabels ?? [])
        if (!mergedLabels.has(label.toLowerCase())) mergedLabels.set(label.toLowerCase(), label);
      const mergedAssignees = new Set([
        ...(latest.assignees ?? []).map(({ login }) => login),
        ...(operation.managedAssignees ?? []),
      ]);
      const reconciled = {
        ...operation,
        body: replaceManagedBlock(latest.body, desiredBlock),
        labels: [...mergedLabels.values()].sort(),
        assignees: [...mergedAssignees].sort(),
      };
      results.push({ taskId: operation.taskId, issue: await client.update(reconciled) });
    }
  }
  return results;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const quiet = process.argv.includes('--quiet');
  const outputIndex = process.argv.indexOf('--output');
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && (!outputPath || outputPath.startsWith('--')))
    throw new Error('--output requires a repository-relative file path.');
  const resolvedOutput = outputPath ? path.resolve(repositoryRoot, outputPath) : undefined;
  if (
    resolvedOutput &&
    resolvedOutput !== repositoryRoot &&
    !resolvedOutput.startsWith(`${repositoryRoot}${path.sep}`)
  )
    throw new Error('--output must stay inside the repository.');
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
  const validAssignees = await client.validateAssignees(index.tasks);
  const repositoryUrl = `https://github.com/${owner}/${repo}`;
  const cardContents = new Map();
  const cardDetailsByTask = new Map();
  for (const task of index.tasks) {
    let markdown = cardContents.get(task.detailFile);
    if (markdown === undefined) {
      markdown = await readFile(path.join(repositoryRoot, task.detailFile), 'utf8');
      cardContents.set(task.detailFile, markdown);
    }
    cardDetailsByTask.set(task.id, renderTaskCardDetails(markdown, task.id));
  }
  const plan = planIssueSync({
    tasks: index.tasks,
    issues,
    repositoryId,
    sourceSha,
    repositoryUrl,
    cardDetailsByTask,
  });
  const metadata = await client.listMetadata();
  plan.metadata = {
    validAssignees,
    milestonesToCreate: [...new Set(index.tasks.map(({ milestone }) => milestone))].filter(
      (title) => !metadata.milestones.some((milestone) => milestone.title === title)
    ),
    labelsToCreate: [
      ...new Set(
        index.tasks.flatMap((task) => [
          'roadmap',
          `milestone:${task.milestone.toLowerCase()}`,
          ...(task.priority ? [`priority:${task.priority}`] : []),
          ...(task.labels ?? []),
        ])
      ),
    ].filter(
      (name) => !metadata.labels.some((label) => label.name.toLowerCase() === name.toLowerCase())
    ),
  };
  const renderedPlan = `${JSON.stringify(plan, null, 2)}\n`;
  if (resolvedOutput) await writeFile(resolvedOutput, renderedPlan, 'utf8');
  if (quiet) {
    const counts = Object.groupBy(plan.operations, ({ operation }) => operation);
    process.stdout.write(
      `Planned ${plan.operations.length} task(s): ${['create', 'update', 'noop', 'conflict']
        .map((operation) => `${operation}=${counts[operation]?.length ?? 0}`)
        .join(', ')}.\n`
    );
  } else process.stdout.write(renderedPlan);
  if (!apply) return;
  const results = await applyIssuePlan({
    plan,
    client,
    tasks: index.tasks,
    repositoryId,
    sourceSha,
    repositoryUrl,
    cardDetailsByTask,
  });
  process.stdout.write(`Applied ${results.length} create/update operations.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
