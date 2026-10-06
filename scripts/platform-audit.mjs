import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const protectedArtifactName =
  /release|sbom|provenance|attestation|evidence|audit|backup|restore|recovery|migration|package|registry/iu;
const disposableArtifactName =
  /^(?:board-[a-z0-9-]+-\d+-\d+|ui-catalog-playwright-\d+-\d+|dependency-update-plan-\d+|docs-preview-[a-f0-9]{40}|test-junit-\d+-\d+)$/u;

const scheduledWorkflowExpectations = [
  { name: 'Scheduled browser matrix', maximumAgeDays: 8 },
  { name: 'Deep scheduled regression', maximumAgeDays: 8 },
  { name: 'CodeQL', maximumAgeDays: 8 },
  { name: 'Gitleaks', maximumAgeDays: 8 },
  { name: 'Monthly platform audit', maximumAgeDays: 38 },
];

function knownApiFailure(error) {
  const output = `${error.stderr ?? ''} ${error.message ?? ''}`;
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

  return scheduledWorkflowExpectations.map(({ name, maximumAgeDays }) => {
    const scheduledRuns = workflowRuns
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
    const status =
      lastSuccessAgeDays === null
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
    if (protectedArtifactName.test(name)) {
      protectedArtifacts.push({ id: artifact.id, name, reason: 'protected-name-policy' });
      continue;
    }
    const createdAt = Date.parse(artifact.created_at ?? '');
    if (
      !artifact.expired &&
      disposableArtifactName.test(name) &&
      Number.isFinite(createdAt) &&
      createdAt <= cutoff
    ) {
      candidates.push({ id: artifact.id, name, createdAt: artifact.created_at });
      continue;
    }
    if (!disposableArtifactName.test(name)) {
      unclassified.push({ id: artifact.id, name });
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
  const activeArtifacts = artifacts.filter((artifact) => artifact.expired !== true);
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
  for (const run of workflowRuns) {
    const conclusion = run.conclusion ?? run.status ?? 'unknown';
    conclusions[conclusion] = (conclusions[conclusion] ?? 0) + 1;
  }
  const nodeMajor = 'v22';
  const nodeSupport = nodeSchedule?.[nodeMajor];
  const nodeEnd = nodeSupport?.end ? Date.parse(`${nodeSupport.end}T00:00:00Z`) : NaN;
  const cleanup = planArtifactCleanup(artifacts, generatedAt);
  const previousArtifacts = previous?.inventory?.artifacts;
  const previousRuns = previous?.inventory?.workflowRuns;
  const scheduledWorkflows = auditScheduledWorkflows(workflowRuns, generatedAt);
  const supportReviews = evaluateRuntimeSupportReviews(supportReviewPolicy, generatedAt);

  return {
    schemaVersion: 1,
    mode: 'read-only-monthly-audit',
    generatedAt,
    source: { repository: repo, sha: sourceSha, dirty: sourceDirty },
    coverage: {
      workflowRunWindowDays: 90,
      workflowRunsScanned: workflowRuns.length,
      workflowRunResultLimit: 1000,
      workflowRunHistoryMayBeTruncated: workflowRuns.length >= 1000,
    },
    inventory: {
      artifacts: {
        count: activeArtifacts.length,
        bytes: artifactBytes,
        expiredCount: artifacts.filter((artifact) => artifact.expired === true).length,
        expiringWithinSevenDays: nearExpiry.length,
        earliestExpiry:
          activeArtifacts
            .map((artifact) => artifact.expires_at)
            .filter((value) => typeof value === 'string')
            .sort()[0] ?? null,
      },
      workflowRuns: { count: workflowRuns.length, conclusions, scheduledWorkflows },
      packages,
      billing,
      permissions: {
        defaultWorkflowPermissions: workflowPermissions?.default_workflow_permissions ?? null,
        canApprovePullRequestReviews: workflowPermissions?.can_approve_pull_request_reviews ?? null,
        actionsEnabled: actionPermissions?.enabled ?? null,
        allowedActions: actionPermissions?.allowed_actions ?? null,
        shaPinningRequired: actionPermissions?.sha_pinning_required ?? null,
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
      artifactCountDelta: compareCounts(activeArtifacts.length, previousArtifacts?.count),
      artifactBytesDelta: compareCounts(artifactBytes, previousArtifacts?.bytes),
      workflowRunCountDelta: compareCounts(workflowRuns.length, previousRuns?.count),
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
      ...(workflowRuns.length >= 1000
        ? ['Workflow run inventory reached the GitHub API result limit.']
        : []),
      ...scheduledWorkflows
        .filter((workflow) => workflow.status !== 'healthy')
        .map((workflow) => `Scheduled workflow ${workflow.name} is ${workflow.status}.`),
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

function readOptionalApi(endpoint, mapPages = (pages) => pages[0]) {
  try {
    const value = mapPages(runGhApi(endpoint));
    if (Array.isArray(value)) return { status: 'available', count: value.length };
    if (value && typeof value === 'object') return { status: 'available', ...value };
    return { status: 'available', value };
  } catch (error) {
    return { status: 'unknown', reason: knownApiFailure(error) };
  }
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
  const repository = runGhApi(`repos/${repo}`)[0];
  const supportReviewPolicy = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'docs/engineering/runtime-support-review.json'),
      'utf8'
    )
  );
  const artifacts = runGhApi(`repos/${repo}/actions/artifacts?per_page=100`).flatMap(
    (page) => page.artifacts ?? []
  );
  const runPages = runGhApi(
    `repos/${repo}/actions/runs?per_page=100&created=%3E%3D${encodedWindowStart}`
  );
  const workflowRuns = runPages.flatMap((page) => page.workflow_runs ?? []);
  const workflowPermissions = readOptionalApi(`repos/${repo}/actions/permissions/workflow`);
  const actionPermissions = readOptionalApi(`repos/${repo}/actions/permissions`);
  const packages = readOptionalApi(
    `${repository.owner?.type === 'Organization' ? 'orgs' : 'users'}/${repoParts[0]}/packages?package_type=container&per_page=100`,
    (pages) => pages.flatMap((page) => (Array.isArray(page) ? page : []))
  );
  const billing = readOptionalApi(`repos/${repo}/actions/billing/usage`);
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
    workflowPermissions: workflowPermissions.status === 'available' ? workflowPermissions : null,
    actionPermissions: actionPermissions.status === 'available' ? actionPermissions : null,
    artifacts,
    workflowRuns,
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
