import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const protectedArtifactName =
  /release|sbom|provenance|attestation|evidence|audit|backup|restore|recovery|migration|package|registry/iu;
const disposableArtifactName =
  /^(?:board-[a-z0-9-]+-\d+-\d+|ui-catalog-playwright-\d+-\d+|dependency-update-plan-\d+|docs-preview-[a-f0-9]{40}|test-junit-\d+-\d+|roadmap-progress-\d+|roadmap-issue-plan-[a-f0-9]{40})$/u;

const scheduledWorkflowExpectations = [
  { name: 'Scheduled browser matrix', workflowFile: 'browser-matrix.yml', maximumAgeDays: 8 },
  { name: 'Deep scheduled regression', workflowFile: 'deep-regression.yml', maximumAgeDays: 8 },
  { name: 'CodeQL', workflowFile: 'codeql.yml', maximumAgeDays: 8 },
  { name: 'Gitleaks', workflowFile: 'gitleaks.yml', maximumAgeDays: 8 },
  { name: 'Monthly platform audit', workflowFile: 'platform-audit.yml', maximumAgeDays: 38 },
];

function knownApiFailure(error) {
  const output = `${error.stderr ?? ''} ${error.message ?? ''}`;
  const invalidCollection = /GitHub API response did not contain a ([a-z_]+) collection\./u.exec(
    output
  )?.[1];
  if (invalidCollection) {
    return `GitHub API response did not contain a ${invalidCollection} collection.`;
  }
  const resetAt = /rate limit exhausted; resets at (\d{4}-\d{2}-\d{2}T[^\s]+)\.?/iu.exec(
    output
  )?.[1];
  if (resetAt) return `Public GitHub API rate limit exhausted; resets at ${resetAt}.`;
  if (/API rate limit exceeded|rate limit exhausted/iu.test(output)) {
    return 'GitHub API rate limit exhausted.';
  }
  const status = /HTTP (\d{3})/u.exec(output)?.[1];
  return status ? `GitHub API returned HTTP ${status}.` : 'GitHub API request unavailable.';
}

function compareCounts(current, previous) {
  if (typeof current !== 'number' || typeof previous !== 'number') return null;
  return current - previous;
}

export function evaluateRuntimeSupportReviews(policy, generatedAt) {
  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(generatedTime)) {
    throw new Error('Runtime support review requires a valid audit timestamp.');
  }
  if (
    !policy ||
    typeof policy !== 'object' ||
    policy.schemaVersion !== 1 ||
    !Array.isArray(policy.items) ||
    policy.items.length === 0
  ) {
    throw new Error(
      'Runtime support review policy must define schemaVersion 1 and non-empty items.'
    );
  }

  const seen = new Set();
  return policy.items.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !/^[a-z0-9-]+$/u.test(item.id) ||
      seen.has(item.id) ||
      typeof item.component !== 'string' ||
      typeof item.configured !== 'string' ||
      typeof item.owner !== 'string' ||
      !item.owner.trim() ||
      typeof item.source !== 'string' ||
      !item.source.startsWith('https://') ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(item.reviewedAt) ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(item.reviewBy)
    ) {
      throw new Error(
        'Runtime support review items require unique IDs, owner, source and ISO dates.'
      );
    }
    seen.add(item.id);
    const reviewedTime = Date.parse(`${item.reviewedAt}T00:00:00Z`);
    const reviewByTime = Date.parse(`${item.reviewBy}T00:00:00Z`);
    const auditDate = new Date(generatedTime).toISOString().slice(0, 10);
    if (
      !Number.isFinite(reviewedTime) ||
      !Number.isFinite(reviewByTime) ||
      item.reviewBy <= item.reviewedAt ||
      item.reviewedAt > auditDate
    ) {
      throw new Error(`Runtime support review '${item.id}' has an invalid review window.`);
    }
    const reviewStatus =
      auditDate > item.reviewBy ? 'overdue' : auditDate === item.reviewBy ? 'due' : 'current';
    return {
      id: item.id,
      component: item.component,
      configured: item.configured,
      owner: item.owner,
      reviewedAt: item.reviewedAt,
      reviewBy: item.reviewBy,
      source: item.source,
      reviewStatus,
    };
  });
}

export function auditScheduledWorkflows(workflowRuns, generatedAt) {
  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(generatedTime)) {
    throw new Error('Scheduled workflow audit requires a valid timestamp.');
  }

  return scheduledWorkflowExpectations.map(({ name, workflowFile, maximumAgeDays }) => {
    const workflowSource = Array.isArray(workflowRuns) ? workflowRuns : workflowRuns[workflowFile];
    const unavailableReason =
      workflowSource && !Array.isArray(workflowSource) && workflowSource.status === 'unknown'
        ? workflowSource.reason
        : null;
    const sourceRuns = Array.isArray(workflowSource)
      ? workflowSource
      : (workflowSource?.runs ?? []);
    const scheduledRuns = sourceRuns
      .filter((run) => run.name === name && run.event === 'schedule')
      .sort(
        (left, right) => Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? '')
      );
    const latestRun = scheduledRuns[0];
    const lastSuccess = scheduledRuns.find((run) => run.conclusion === 'success');
    const lastRunTime = Date.parse(latestRun?.created_at ?? '');
    const lastSuccessTime = Date.parse(lastSuccess?.created_at ?? '');
    const lastSuccessAgeDays = Number.isFinite(lastSuccessTime)
      ? Math.floor((generatedTime - lastSuccessTime) / (24 * 60 * 60 * 1000))
      : null;
    const lastRunAgeDays = Number.isFinite(lastRunTime)
      ? Math.floor((generatedTime - lastRunTime) / (24 * 60 * 60 * 1000))
      : null;
    const status = unavailableReason
      ? 'unknown'
      : lastSuccessAgeDays === null
        ? 'missing-success'
        : lastSuccessAgeDays > maximumAgeDays
          ? 'stale'
          : latestRun?.conclusion !== 'success' && latestRun?.status !== 'in_progress'
            ? 'failing'
            : 'healthy';

    return {
      name,
      event: 'schedule',
      maximumAgeDays,
      status,
      reason: unavailableReason ?? null,
      lastRunAt: latestRun?.created_at ?? null,
      lastRunConclusion: latestRun?.conclusion ?? latestRun?.status ?? null,
      lastRunAgeDays,
      lastSuccessAt: lastSuccess?.created_at ?? null,
      lastSuccessAgeDays,
    };
  });
}

export function planArtifactCleanup(artifacts, generatedAt, minimumAgeDays = 90) {
  const now = Date.parse(generatedAt);
  if (!Number.isFinite(now) || !Number.isFinite(minimumAgeDays) || minimumAgeDays < 1) {
    throw new Error('Cleanup planning requires a valid timestamp and positive minimum age.');
  }
  const cutoff = now - minimumAgeDays * 24 * 60 * 60 * 1000;
  const candidates = [];
  const protectedArtifacts = [];
  const unclassified = [];
  for (const artifact of artifacts) {
    const name = typeof artifact.name === 'string' ? artifact.name : '';
    const createdAt = Date.parse(artifact.created_at ?? '');
    const ageDays = Number.isFinite(createdAt)
      ? Math.floor((now - createdAt) / (24 * 60 * 60 * 1000))
      : null;
    if (protectedArtifactName.test(name)) {
      protectedArtifacts.push({
        id: artifact.id,
        name,
        classification: 'protected',
        ageDays,
        reason: 'protected-name-policy',
      });
      continue;
    }
    if (
      !artifact.expired &&
      disposableArtifactName.test(name) &&
      Number.isFinite(createdAt) &&
      createdAt <= cutoff
    ) {
      candidates.push({
        id: artifact.id,
        name,
        classification: 'disposable',
        ageDays,
        createdAt: artifact.created_at,
        reason: 'allowlisted-name-exceeds-minimum-age',
      });
      continue;
    }
    if (!disposableArtifactName.test(name)) {
      unclassified.push({
        id: artifact.id,
        name,
        classification: 'unclassified',
        ageDays,
        reason: 'name-not-allowlisted',
      });
    }
  }
  return {
    mode: 'dry-run-only',
    deletionSupported: false,
    minimumAgeDays,
    candidates,
    protectedArtifacts,
    unclassified,
  };
}

export function buildPlatformAudit(input) {
  const {
    repo,
    sourceSha,
    sourceDirty = false,
    generatedAt,
    repository,
    workflowPermissions,
    actionPermissions,
    artifacts,
    workflowRuns,
    scheduledWorkflowRuns = workflowRuns,
    packages,
    billing,
    previous,
    nodeSchedule,
    supportReviewPolicy,
  } = input;
  const generatedTime = Date.parse(generatedAt);
  if (!repo || !/^[a-f0-9]{40}$/u.test(sourceSha) || !Number.isFinite(generatedTime)) {
    throw new Error('Audit metadata requires a repository, full source SHA, and timestamp.');
  }
  const artifactInventory = Array.isArray(artifacts)
    ? { status: 'available', items: artifacts }
    : (artifacts ?? {
        status: 'unknown',
        reason: 'Artifact inventory was not supplied.',
        items: [],
      });
  const artifactRows = artifactInventory.items ?? [];
  const workflowInventory = Array.isArray(workflowRuns)
    ? { status: 'available', items: workflowRuns }
    : (workflowRuns ?? {
        status: 'unknown',
        reason: 'Workflow inventory was not supplied.',
        items: [],
      });
  const workflowRows = workflowInventory.items ?? [];
  const activeArtifacts = artifactRows.filter((artifact) => artifact.expired !== true);
  const unknownArtifactSizeCount = activeArtifacts.filter(
    (artifact) => !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 0
  ).length;
  const artifactBytes = activeArtifacts.reduce(
    (total, artifact) =>
      total + (Number.isSafeInteger(artifact.size_in_bytes) ? artifact.size_in_bytes : 0),
    0
  );
  const nearExpiry = activeArtifacts.filter((artifact) => {
    const expiresAt = Date.parse(artifact.expires_at ?? '');
    return Number.isFinite(expiresAt) && expiresAt <= generatedTime + 7 * 24 * 60 * 60 * 1000;
  });
  const conclusions = {};
  for (const run of workflowRows) {
    const conclusion = run.conclusion ?? run.status ?? 'unknown';
    conclusions[conclusion] = (conclusions[conclusion] ?? 0) + 1;
  }
  const nodeMajor = 'v22';
  const nodeSupport = nodeSchedule?.[nodeMajor];
  const workflowPermissionStatus =
    workflowPermissions?.status ?? (workflowPermissions ? 'available' : 'unknown');
  const actionPermissionStatus =
    actionPermissions?.status ?? (actionPermissions ? 'available' : 'unknown');
  const nodeEnd = nodeSupport?.end ? Date.parse(`${nodeSupport.end}T00:00:00Z`) : NaN;
  const cleanup =
    artifactInventory.status === 'available'
      ? { status: 'available', ...planArtifactCleanup(artifactRows, generatedAt) }
      : {
          status: 'unknown',
          mode: 'dry-run-only',
          deletionSupported: false,
          minimumAgeDays: 90,
          candidates: null,
          protectedArtifacts: null,
          unclassified: null,
          reason: artifactInventory.reason ?? 'Artifact inventory is unavailable.',
        };
  const previousArtifacts = previous?.inventory?.artifacts;
  const previousRuns = previous?.inventory?.workflowRuns;
  const scheduledWorkflows = auditScheduledWorkflows(scheduledWorkflowRuns, generatedAt);
  const scheduledWorkflowSources = Array.isArray(scheduledWorkflowRuns)
    ? []
    : Object.values(scheduledWorkflowRuns);
  const scheduledWorkflowInventoryUnknown = scheduledWorkflowSources.some(
    (source) => source && !Array.isArray(source) && source.status === 'unknown'
  );
  const scheduledWorkflowRunsScanned = Array.isArray(scheduledWorkflowRuns)
    ? null
    : scheduledWorkflowInventoryUnknown
      ? null
      : scheduledWorkflowSources.reduce(
          (count, source) =>
            count + (Array.isArray(source) ? source.length : (source?.runs?.length ?? 0)),
          0
        );
  const supportReviews = evaluateRuntimeSupportReviews(supportReviewPolicy, generatedAt);

  return {
    schemaVersion: 1,
    mode: 'read-only-monthly-audit',
    status:
      repository &&
      artifactInventory.status === 'available' &&
      unknownArtifactSizeCount === 0 &&
      workflowInventory.status === 'available' &&
      !scheduledWorkflowInventoryUnknown &&
      workflowPermissionStatus === 'available' &&
      actionPermissionStatus === 'available' &&
      packages?.status === 'available' &&
      billing?.status === 'available' &&
      nodeSupport?.end
        ? 'complete'
        : 'partial',
    generatedAt,
    source: { repository: repo, sha: sourceSha, dirty: sourceDirty },
    coverage: {
      workflowRunWindowDays: 90,
      artifactInventoryStatus: artifactInventory.status,
      workflowRunInventoryStatus: workflowInventory.status,
      repositoryMetadataStatus: repository ? 'available' : 'unknown',
      workflowRunsScanned: workflowInventory.status === 'available' ? workflowRows.length : null,
      scheduledWorkflowRunInventoryStatus: scheduledWorkflowInventoryUnknown
        ? 'unknown'
        : 'available',
      workflowRunResultLimit: 1000,
      workflowRunHistoryMayBeTruncated:
        workflowInventory.status === 'available' ? workflowRows.length >= 1000 : null,
      scheduledWorkflowRunsScanned,
    },
    inventory: {
      artifacts: {
        status: artifactInventory.status,
        reason: artifactInventory.status === 'unknown' ? artifactInventory.reason : null,
        count: artifactInventory.status === 'available' ? activeArtifacts.length : null,
        bytesStatus:
          artifactInventory.status !== 'available'
            ? 'unknown'
            : unknownArtifactSizeCount > 0
              ? 'partial'
              : 'available',
        bytes:
          artifactInventory.status === 'available' && unknownArtifactSizeCount === 0
            ? artifactBytes
            : null,
        unknownSizeCount:
          artifactInventory.status === 'available' ? unknownArtifactSizeCount : null,
        expiredCount:
          artifactInventory.status === 'available'
            ? artifactRows.filter((artifact) => artifact.expired === true).length
            : null,
        expiringWithinSevenDays:
          artifactInventory.status === 'available' ? nearExpiry.length : null,
        earliestExpiry:
          artifactInventory.status === 'available'
            ? (activeArtifacts
                .map((artifact) => artifact.expires_at)
                .filter((value) => typeof value === 'string')
                .sort()[0] ?? null)
            : null,
      },
      workflowRuns: {
        status: workflowInventory.status,
        reason: workflowInventory.status === 'unknown' ? workflowInventory.reason : null,
        count: workflowInventory.status === 'available' ? workflowRows.length : null,
        conclusions: workflowInventory.status === 'available' ? conclusions : null,
        scheduledWorkflows,
      },
      packages,
      billing,
      permissions: {
        workflowStatus: workflowPermissionStatus,
        workflowReason:
          workflowPermissions?.status === 'unknown' ? workflowPermissions.reason : null,
        defaultWorkflowPermissions: workflowPermissions?.default_workflow_permissions ?? null,
        canApprovePullRequestReviews: workflowPermissions?.can_approve_pull_request_reviews ?? null,
        actionsStatus: actionPermissionStatus,
        actionsReason: actionPermissions?.status === 'unknown' ? actionPermissions.reason : null,
        actionsEnabled: actionPermissions?.enabled ?? null,
        allowedActions: actionPermissions?.allowed_actions ?? null,
        shaPinningRequired: actionPermissions?.sha_pinning_required ?? null,
        retentionStatus: repository ? 'available' : 'unknown',
        artifactAndLogRetentionDays: repository?.artifact_and_log_retention_days ?? null,
      },
    },
    runtimeSupport: {
      node: {
        major: 22,
        scheduleSource: 'https://github.com/nodejs/Release/blob/main/schedule.json',
        endOfLife: nodeSupport?.end ?? null,
        status:
          Number.isFinite(nodeEnd) && nodeEnd > generatedTime
            ? 'supported-on-audit-date'
            : nodeSupport?.end
              ? 'end-of-life-on-or-before-audit-date'
              : 'unknown',
      },
      otherRuntimePolicy:
        'See docs/engineering/support-policy.md; compare each upstream schedule during monthly review.',
      reviews: supportReviews,
    },
    trends: {
      previousGeneratedAt: previous?.generatedAt ?? null,
      artifactCountDelta: compareCounts(
        artifactInventory.status === 'available' ? activeArtifacts.length : null,
        previousArtifacts?.count
      ),
      artifactBytesDelta: compareCounts(
        artifactInventory.status === 'available' && unknownArtifactSizeCount === 0
          ? artifactBytes
          : null,
        previousArtifacts?.bytes
      ),
      workflowRunCountDelta: compareCounts(
        workflowInventory.status === 'available' ? workflowRows.length : null,
        previousRuns?.count
      ),
    },
    cleanupPlan: cleanup,
    limitations: [
      ...(packages?.status === 'unknown'
        ? [
            `Registry inventory unknown: ${packages.reason} Owner: repository administrator; follow-up: grant read:packages to the audit identity or record the access restriction and registry owner.`,
          ]
        : []),
      ...(billing?.status === 'unknown'
        ? [
            `Actions billing unknown: ${billing.reason} Owner: organization/repository billing administrator; follow-up: review billing through the account UI or grant an authorized billing read capability.`,
          ]
        : []),
      ...(artifactInventory.status === 'unknown'
        ? [
            `Artifact inventory unknown: ${artifactInventory.reason ?? 'GitHub API access unavailable.'}`,
          ]
        : []),
      ...(artifactInventory.status === 'available' && unknownArtifactSizeCount > 0
        ? [
            `Artifact byte total is partial: ${unknownArtifactSizeCount} active artifact row(s) have no valid size_in_bytes.`,
          ]
        : []),
      ...(workflowInventory.status === 'unknown'
        ? [
            `Workflow run inventory unknown: ${workflowInventory.reason ?? 'GitHub API access unavailable.'}`,
          ]
        : []),
      ...(workflowPermissions?.status === 'unknown' || actionPermissions?.status === 'unknown'
        ? [
            'Actions permission settings are unknown because one or more settings endpoints were unavailable.',
          ]
        : []),
      ...(!repository
        ? [
            'Repository metadata and retention settings are unknown because the repository API was unavailable.',
          ]
        : []),
      ...(workflowInventory.status === 'available' && workflowRows.length >= 1000
        ? ['Workflow run inventory reached the GitHub API result limit.']
        : []),
      ...scheduledWorkflows
        .filter((workflow) => workflow.status !== 'healthy')
        .map(
          (workflow) =>
            `Scheduled workflow ${workflow.name} is ${workflow.status}.${workflow.reason ? ` ${workflow.reason}` : ''}`
        ),
      ...supportReviews
        .filter((review) => review.reviewStatus !== 'current')
        .map(
          (review) =>
            `Runtime support review ${review.component} is ${review.reviewStatus}; owner: ${review.owner}; due: ${review.reviewBy}; source: ${review.source}.`
        ),
      'This command is read-only; cleanupPlan never performs deletion.',
      'Only Node.js end-of-life is checked automatically; other runtime policy rows require maintainer review against upstream sources.',
    ],
  };
}

function runGhApi(endpoint) {
  const response = execFileSync('gh', ['api', '--paginate', '--slurp', endpoint], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pages = JSON.parse(response);
  if (!Array.isArray(pages)) throw new Error('GitHub API pagination returned an invalid response.');
  return pages;
}

function authenticationUnavailable(error) {
  const output = `${error.stderr ?? ''} ${error.message ?? ''}`;
  return /HTTP 401|bad credentials|invalid token|not logged in|ENOENT|command not found/iu.test(
    output
  );
}

function nextPublicPage(linkHeader, currentUrl) {
  if (!linkHeader) return null;
  const nextLink = /<([^>]+)>;\s*rel="next"/u.exec(linkHeader)?.[1];
  if (!nextLink) return null;
  const nextUrl = new URL(nextLink, currentUrl);
  if (nextUrl.origin !== 'https://api.github.com') {
    throw new Error('Public GitHub API pagination returned an unexpected host.');
  }
  return nextUrl.toString();
}

export async function fetchPublicGitHubPages(
  endpoint,
  fetchImpl = globalThis.fetch,
  maximumPages = 100
) {
  let nextUrl = new URL(endpoint, 'https://api.github.com/').toString();
  if (!nextUrl.startsWith('https://api.github.com/')) {
    throw new Error('Public GitHub API requests must use the official API host.');
  }
  const pages = [];
  while (nextUrl && pages.length < maximumPages) {
    const response = await fetchImpl(nextUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      if (response.status === 403 && rateLimitRemaining === '0' && rateLimitReset) {
        const resetTime = Number(rateLimitReset);
        const resetAt = Number.isFinite(resetTime)
          ? new Date(resetTime * 1000).toISOString()
          : null;
        if (resetAt) {
          throw new Error(`Public GitHub API rate limit exhausted; resets at ${resetAt}.`);
        }
      }
      throw new Error(`Public GitHub API returned HTTP ${response.status}.`);
    }
    pages.push(await response.json());
    nextUrl = nextPublicPage(response.headers.get('link'), nextUrl);
  }
  return pages;
}

async function runGitHubApi(endpoint) {
  try {
    return runGhApi(endpoint);
  } catch (error) {
    if (!authenticationUnavailable(error)) throw error;
    const maximumPages = /\/actions\/runs\?/u.test(endpoint) ? 10 : 100;
    return fetchPublicGitHubPages(endpoint, globalThis.fetch, maximumPages);
  }
}

async function readOptionalApi(endpoint, mapPages = (pages) => pages[0]) {
  try {
    const value = mapPages(await runGitHubApi(endpoint));
    if (Array.isArray(value)) return { status: 'available', count: value.length };
    if (value && typeof value === 'object') return { status: 'available', ...value };
    return { status: 'available', value };
  } catch (error) {
    return { status: 'unknown', reason: knownApiFailure(error) };
  }
}

export async function readApiInventory(endpoint, collection, requestPages = runGitHubApi) {
  try {
    const pages = await requestPages(endpoint);
    const items = pages.flatMap((page) => {
      if (!page || !Array.isArray(page[collection])) {
        throw new Error(`GitHub API response did not contain a ${collection} collection.`);
      }
      return page[collection];
    });
    return { status: 'available', items };
  } catch (error) {
    return { status: 'unknown', reason: knownApiFailure(error), items: [] };
  }
}

export async function fetchScheduledWorkflowRuns(repo, windowStart, requestPages = runGitHubApi) {
  const entries = await Promise.all(
    scheduledWorkflowExpectations.map(async ({ workflowFile }) => {
      try {
        const pages = await requestPages(
          `repos/${repo}/actions/workflows/${workflowFile}/runs?per_page=100&event=schedule&created=%3E%3D${windowStart}`
        );
        return [workflowFile, pages.flatMap((page) => page.workflow_runs ?? [])];
      } catch (error) {
        const reason = /HTTP 404/u.test(`${error.stderr ?? ''} ${error.message ?? ''}`)
          ? 'GitHub cannot resolve this workflow from the repository default branch yet.'
          : knownApiFailure(error);
        return [workflowFile, { status: 'unknown', reason, runs: [] }];
      }
    })
  );
  return Object.fromEntries(entries);
}

function unavailableScheduledWorkflowRuns(reason) {
  return Object.fromEntries(
    scheduledWorkflowExpectations.map(({ workflowFile }) => [
      workflowFile,
      { status: 'unknown', reason, runs: [] },
    ])
  );
}

function findRateLimitReason(...sources) {
  return sources
    .flatMap((source) =>
      source && typeof source === 'object'
        ? Array.isArray(source)
          ? source
          : Object.values(source)
        : []
    )
    .find((source) => source?.status === 'unknown' && /rate limit/iu.test(source.reason ?? ''))
    ?.reason;
}

async function fetchNodeSchedule() {
  const response = await globalThis.fetch(
    'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json'
  );
  if (!response.ok) throw new Error(`Node release schedule returned HTTP ${response.status}.`);
  return response.json();
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const repo = argumentValue('--repo') ?? process.env.GITHUB_REPOSITORY;
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)) {
    throw new Error('Pass --repo owner/name or set GITHUB_REPOSITORY.');
  }
  const generatedAt = new Date().toISOString();
  const sourceSha =
    process.env.GITHUB_SHA ??
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const sourceDirty =
    execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
      .length > 0;
  const repoParts = repo.split('/');
  const encodedWindowStart = new Date(Date.parse(generatedAt) - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const repositoryResult = await readOptionalApi(`repos/${repo}`);
  const repository = repositoryResult.status === 'available' ? repositoryResult : null;
  const supportReviewPolicy = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'docs/engineering/runtime-support-review.json'),
      'utf8'
    )
  );
  const [artifacts, workflowRuns] = await Promise.all([
    readApiInventory(`repos/${repo}/actions/artifacts?per_page=100`, 'artifacts'),
    readApiInventory(
      `repos/${repo}/actions/runs?per_page=100&created=%3E%3D${encodedWindowStart}`,
      'workflow_runs'
    ),
  ]);
  let scheduledWorkflowRuns;
  let workflowPermissions;
  let actionPermissions;
  let packages;
  let billing;
  let apiRateLimitReason = findRateLimitReason(repositoryResult, artifacts, workflowRuns);
  if (apiRateLimitReason) {
    scheduledWorkflowRuns = unavailableScheduledWorkflowRuns(apiRateLimitReason);
  } else {
    scheduledWorkflowRuns = await fetchScheduledWorkflowRuns(repo, encodedWindowStart);
    apiRateLimitReason = findRateLimitReason(scheduledWorkflowRuns);
  }
  if (apiRateLimitReason) {
    const unavailable = { status: 'unknown', reason: apiRateLimitReason };
    workflowPermissions = unavailable;
    actionPermissions = unavailable;
    packages = unavailable;
    billing = unavailable;
  } else {
    workflowPermissions = await readOptionalApi(`repos/${repo}/actions/permissions/workflow`);
    actionPermissions = await readOptionalApi(`repos/${repo}/actions/permissions`);
    packages = repository
      ? await readOptionalApi(
          `${repository.owner?.type === 'Organization' ? 'orgs' : 'users'}/${repoParts[0]}/packages?package_type=container&per_page=100`,
          (pages) => pages.flatMap((page) => (Array.isArray(page) ? page : []))
        )
      : { status: 'unknown', reason: 'Repository owner type is unavailable.' };
    billing = await readOptionalApi(`repos/${repo}/actions/billing/usage`);
  }
  const nodeSchedule = await fetchNodeSchedule().catch(() => null);
  const previousPath = argumentValue('--previous');
  const outputPath = argumentValue('--output');
  const previous = previousPath
    ? JSON.parse(await readFile(path.resolve(previousPath), 'utf8'))
    : null;
  const audit = buildPlatformAudit({
    repo,
    sourceSha,
    sourceDirty,
    generatedAt,
    repository,
    workflowPermissions,
    actionPermissions,
    artifacts,
    workflowRuns,
    scheduledWorkflowRuns,
    packages,
    billing,
    previous,
    nodeSchedule,
    supportReviewPolicy,
  });
  if (nodeSchedule === null) {
    audit.runtimeSupport.node.status = 'unknown';
    audit.limitations.push('Official Node.js release schedule could not be fetched.');
  }
  const output = `${JSON.stringify(audit, null, 2)}\n`;
  if (outputPath) await writeFile(path.resolve(outputPath), output, 'utf8');
  process.stdout.write(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
