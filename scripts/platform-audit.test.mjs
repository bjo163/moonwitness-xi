import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  auditScheduledWorkflows,
  buildPlatformAudit,
  evaluateRuntimeSupportReviews,
  fetchScheduledWorkflowRuns,
  fetchPublicGitHubPages,
  readApiInventory,
  planArtifactCleanup,
} from './platform-audit.mjs';
import { renderPlatformAuditSummary } from './write-platform-audit-summary.mjs';

const generatedAt = '2026-10-05T00:00:00.000Z';
const supportReviewPolicy = {
  schemaVersion: 1,
  items: [
    {
      id: 'postgresql',
      component: 'PostgreSQL',
      configured: '16-alpine',
      owner: 'repository maintainer',
      reviewedAt: '2026-10-01',
      reviewBy: '2026-11-01',
      source: 'https://www.postgresql.org/support/versioning/',
    },
  ],
};

test('checked-in support ledger covers every declared platform runtime', async () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ledger = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'docs/engineering/runtime-support-review.json'),
      'utf8'
    )
  );
  const reviews = evaluateRuntimeSupportReviews(ledger, '2026-10-06T00:00:00.000Z');

  assert.deepEqual(
    reviews.map(({ id }) => id),
    ['node', 'pnpm', 'postgresql', 'playwright', 'ubuntu-runner']
  );
  assert.ok(reviews.every(({ owner, source, reviewStatus }) => owner && source && reviewStatus));
  assert.equal(reviews.find(({ id }) => id === 'ubuntu-runner')?.reviewBy, '2026-10-15');
});

test('public audit fallback follows paginated GitHub API links without credentials', async () => {
  const requested = [];
  const pages = await fetchPublicGitHubPages(
    'repos/owner/project/actions/artifacts?per_page=1',
    async (url, options) => {
      requested.push({ url: String(url), options });
      const firstPage = requested.length === 1;
      return {
        ok: true,
        headers: {
          get: (name) =>
            name.toLowerCase() === 'link' && firstPage
              ? '<https://api.github.com/repos/owner/project/actions/artifacts?per_page=1&page=2>; rel="next"'
              : null,
        },
        json: async () => ({ artifacts: [{ id: requested.length }] }),
      };
    }
  );

  assert.deepEqual(pages, [{ artifacts: [{ id: 1 }] }, { artifacts: [{ id: 2 }] }]);
  assert.equal(requested.length, 2);
  assert.ok(requested.every(({ url }) => url.startsWith('https://api.github.com/')));
  assert.ok(
    requested.every(
      ({ options }) => !Object.keys(options.headers).some((key) => /authorization/iu.test(key))
    )
  );
});

test('public audit fallback rejects pagination links outside GitHub API', async () => {
  await assert.rejects(
    fetchPublicGitHubPages('repos/owner/project/actions/artifacts', async () => ({
      ok: true,
      headers: { get: () => '<https://attacker.example/collect>; rel="next"' },
      json: async () => ({ artifacts: [] }),
    })),
    /unexpected host/u
  );
});

test('public audit fallback reports GitHub rate-limit reset without leaking request data', async () => {
  await assert.rejects(
    fetchPublicGitHubPages('repos/owner/project/actions/artifacts', async () => ({
      ok: false,
      status: 403,
      headers: {
        get: (name) =>
          ({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791688222' })[
            name.toLowerCase()
          ] ?? null,
      },
    })),
    /rate limit exhausted; resets at 2026-10-11T03:10:22\.000Z/u
  );
});

test('required API inventories retain explicit unknown coverage on rate-limit and malformed responses', async () => {
  const pages = await readApiInventory(
    'repos/owner/project/actions/artifacts',
    'artifacts',
    async () => [{ artifacts: [{ id: 1 }] }, { artifacts: [{ id: 2 }] }]
  );
  assert.deepEqual(pages, { status: 'available', items: [{ id: 1 }, { id: 2 }] });

  const limited = await readApiInventory(
    'repos/owner/project/actions/runs',
    'workflow_runs',
    async () => {
      throw new Error('GitHub API rate limit exceeded. HTTP 403');
    }
  );
  assert.deepEqual(limited, {
    status: 'unknown',
    reason: 'GitHub API rate limit exhausted.',
    items: [],
  });

  const malformed = await readApiInventory(
    'repos/owner/project/actions/runs',
    'workflow_runs',
    async () => [{ message: 'unexpected response' }]
  );
  assert.equal(malformed.status, 'unknown');
  assert.match(malformed.reason, /did not contain a workflow_runs collection/u);
});

test('audit summarizes paginated inventory and compares a prior baseline', () => {
  const report = buildPlatformAudit({
    repo: 'owner/project',
    sourceSha: 'a'.repeat(40),
    sourceDirty: true,
    generatedAt,
    repository: { artifact_and_log_retention_days: null },
    workflowPermissions: { default_workflow_permissions: 'read' },
    actionPermissions: { enabled: true, allowed_actions: 'all', sha_pinning_required: false },
    artifacts: [
      {
        id: 1,
        name: 'board-chromium-1-1',
        size_in_bytes: 1024,
        expired: false,
        created_at: '2026-10-01T00:00:00.000Z',
        expires_at: '2026-10-07T00:00:00.000Z',
      },
      { id: 2, name: 'old-expired', size_in_bytes: 10, expired: true },
    ],
    workflowRuns: [
      { conclusion: 'success' },
      { conclusion: 'failure' },
      { status: 'in_progress', conclusion: null },
    ],
    packages: { status: 'unknown', reason: 'GitHub API returned HTTP 403.' },
    billing: { status: 'unknown', reason: 'GitHub API returned HTTP 404.' },
    previous: {
      generatedAt: '2026-09-05T00:00:00.000Z',
      inventory: {
        artifacts: { count: 2, bytes: 800 },
        workflowRuns: { count: 5 },
      },
    },
    nodeSchedule: { v22: { end: '2027-04-30' } },
    supportReviewPolicy,
  });

  assert.equal(report.inventory.artifacts.count, 1);
  assert.equal(report.source.dirty, true);
  assert.equal(report.inventory.artifacts.bytes, 1024);
  assert.equal(report.inventory.artifacts.expiringWithinSevenDays, 1);
  assert.deepEqual(report.inventory.workflowRuns.conclusions, {
    success: 1,
    failure: 1,
    in_progress: 1,
  });
  assert.equal(report.trends.artifactBytesDelta, 224);
  assert.equal(report.trends.workflowRunCountDelta, -2);
  assert.equal(report.runtimeSupport.node.status, 'supported-on-audit-date');
  assert.deepEqual(
    report.runtimeSupport.reviews.map(({ component, reviewStatus }) => ({
      component,
      reviewStatus,
    })),
    [{ component: 'PostgreSQL', reviewStatus: 'current' }]
  );
  assert.match(report.limitations.join(' '), /Registry inventory unknown/u);
  assert.match(report.limitations.join(' '), /read:packages/u);
  assert.match(report.limitations.join(' '), /billing administrator/u);
  assert.equal(report.cleanupPlan.deletionSupported, false);
});

test('cleanup dry-run only selects old allowlisted disposable artifacts', () => {
  const plan = planArtifactCleanup(
    [
      {
        id: 1,
        name: 'board-chromium-123-1',
        expired: false,
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 2,
        name: 'release-provenance-123',
        expired: false,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 3,
        name: 'manual-upload',
        expired: false,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 4,
        name: 'ui-catalog-playwright-456-1',
        expired: false,
        created_at: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 5,
        name: `docs-preview-${'a'.repeat(40)}`,
        expired: false,
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 6,
        name: 'test-junit-789-1',
        expired: false,
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 7,
        name: 'roadmap-progress-38115450478',
        expired: false,
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 8,
        name: `roadmap-issue-plan-${'a'.repeat(40)}`,
        expired: false,
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 9,
        name: 'roadmap-progress-not-a-run-id',
        expired: false,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 10,
        name: `roadmap-issue-plan-${'G'.repeat(40)}`,
        expired: false,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 11,
        name: 'roadmap-progress-38115450479',
        expired: false,
        created_at: '2026-10-01T00:00:00.000Z',
      },
    ],
    generatedAt
  );

  assert.deepEqual(
    plan.candidates.map(({ id, classification, ageDays, reason }) => ({
      id,
      classification,
      ageDays,
      reason,
    })),
    [1, 5, 6, 7, 8].map((id) => ({
      id,
      classification: 'disposable',
      ageDays: 126,
      reason: 'allowlisted-name-exceeds-minimum-age',
    }))
  );
  assert.deepEqual(plan.protectedArtifacts, [
    {
      id: 2,
      name: 'release-provenance-123',
      classification: 'protected',
      ageDays: 277,
      reason: 'protected-name-policy',
    },
  ]);
  assert.deepEqual(plan.unclassified, [
    {
      id: 3,
      name: 'manual-upload',
      classification: 'unclassified',
      ageDays: 277,
      reason: 'name-not-allowlisted',
    },
    {
      id: 9,
      name: 'roadmap-progress-not-a-run-id',
      classification: 'unclassified',
      ageDays: 277,
      reason: 'name-not-allowlisted',
    },
    {
      id: 10,
      name: `roadmap-issue-plan-${'G'.repeat(40)}`,
      classification: 'unclassified',
      ageDays: 277,
      reason: 'name-not-allowlisted',
    },
  ]);
  assert.equal(plan.deletionSupported, false);
  assert.throws(() => planArtifactCleanup([], 'invalid', 90), /valid timestamp/u);
});

test('scheduled regression audit detects healthy, missed, stale, and failing schedules', () => {
  const checks = auditScheduledWorkflows(
    [
      {
        name: 'Scheduled browser matrix',
        event: 'schedule',
        created_at: '2026-10-01T00:00:00.000Z',
        conclusion: 'success',
      },
      {
        name: 'Scheduled browser matrix',
        event: 'schedule',
        created_at: '2026-10-04T00:00:00.000Z',
        conclusion: 'failure',
      },
      {
        name: 'CodeQL',
        event: 'schedule',
        created_at: '2026-09-20T00:00:00.000Z',
        conclusion: 'success',
      },
      {
        name: 'Gitleaks',
        event: 'schedule',
        created_at: '2026-10-04T00:00:00.000Z',
        conclusion: 'success',
      },
      {
        name: 'Gitleaks',
        event: 'workflow_dispatch',
        created_at: '2026-10-05T00:00:00.000Z',
        conclusion: 'success',
      },
    ],
    generatedAt
  );

  assert.deepEqual(Object.fromEntries(checks.map(({ name, status }) => [name, status])), {
    'Scheduled browser matrix': 'failing',
    'Deep scheduled regression': 'missing-success',
    CodeQL: 'stale',
    Gitleaks: 'healthy',
    'Monthly platform audit': 'missing-success',
  });
  assert.throws(() => auditScheduledWorkflows([], 'invalid'), /valid timestamp/u);
});

test('scheduled audit uses workflow-scoped runs when the global inventory is truncated', () => {
  const checks = auditScheduledWorkflows(
    {
      'browser-matrix.yml': [
        {
          name: 'Scheduled browser matrix',
          event: 'schedule',
          created_at: '2026-10-04T00:00:00.000Z',
          conclusion: 'success',
        },
      ],
      'deep-regression.yml': [],
      'codeql.yml': [],
      'gitleaks.yml': [],
      'platform-audit.yml': [],
    },
    generatedAt
  );

  assert.equal(checks[0].status, 'healthy');
  assert.equal(checks[0].lastSuccessAt, '2026-10-04T00:00:00.000Z');
  assert.equal(checks[1].status, 'missing-success');
});

test('scheduled audit distinguishes workflows missing from the default branch', () => {
  const checks = auditScheduledWorkflows(
    {
      'browser-matrix.yml': {
        status: 'unknown',
        reason: 'GitHub cannot resolve this workflow from the repository default branch yet.',
        runs: [],
      },
    },
    generatedAt
  );

  assert.equal(checks[0].status, 'unknown');
  assert.match(checks[0].reason, /default branch/u);
  assert.equal(checks[0].lastRunAt, null);
});

test('workflow 404s produce scoped unknown coverage without aborting the audit', async () => {
  const requested = [];
  const scheduled = await fetchScheduledWorkflowRuns('owner/project', '2026-07-01', async (url) => {
    requested.push(url);
    if (url.includes('browser-matrix.yml')) throw new Error('Public GitHub API returned HTTP 404.');
    return [{ workflow_runs: [{ event: 'schedule', conclusion: 'success' }] }];
  });

  assert.equal(requested.length, 5);
  assert.equal(scheduled['browser-matrix.yml'].status, 'unknown');
  assert.match(scheduled['browser-matrix.yml'].reason, /default branch/u);
  assert.equal(scheduled['codeql.yml'].length, 1);
});

test('runtime support reviews become due and overdue without claiming the software is unsupported', () => {
  const current = evaluateRuntimeSupportReviews(supportReviewPolicy, generatedAt);
  const due = evaluateRuntimeSupportReviews(
    {
      ...supportReviewPolicy,
      items: [{ ...supportReviewPolicy.items[0], reviewBy: '2026-10-05' }],
    },
    generatedAt
  );
  const overdue = evaluateRuntimeSupportReviews(
    {
      ...supportReviewPolicy,
      items: [{ ...supportReviewPolicy.items[0], reviewBy: '2026-10-04' }],
    },
    generatedAt
  );

  assert.equal(current[0].reviewStatus, 'current');
  assert.equal(due[0].reviewStatus, 'due');
  assert.equal(overdue[0].reviewStatus, 'overdue');
  assert.equal(overdue[0].configured, '16-alpine');
  assert.throws(
    () => evaluateRuntimeSupportReviews({ schemaVersion: 1, items: [] }, generatedAt),
    /non-empty items/u
  );
  assert.throws(
    () =>
      evaluateRuntimeSupportReviews(
        {
          ...supportReviewPolicy,
          items: [supportReviewPolicy.items[0], supportReviewPolicy.items[0]],
        },
        generatedAt
      ),
    /unique IDs/u
  );
  assert.throws(
    () =>
      evaluateRuntimeSupportReviews(
        {
          ...supportReviewPolicy,
          items: [{ ...supportReviewPolicy.items[0], reviewBy: '2026-09-30' }],
        },
        generatedAt
      ),
    /invalid review window/u
  );
  assert.throws(
    () =>
      evaluateRuntimeSupportReviews(
        {
          ...supportReviewPolicy,
          items: [{ ...supportReviewPolicy.items[0], reviewedAt: '2026-10-06' }],
        },
        generatedAt
      ),
    /invalid review window/u
  );
});

test('audit rejects invalid provenance and never presents missing values as zero', () => {
  assert.throws(
    () =>
      buildPlatformAudit({
        repo: 'owner/project',
        sourceSha: 'not-a-sha',
        generatedAt,
        artifacts: [],
        workflowRuns: [],
      }),
    /full source SHA/u
  );

  const report = buildPlatformAudit({
    repo: 'owner/project',
    sourceSha: 'b'.repeat(40),
    generatedAt,
    artifacts: [],
    workflowRuns: [],
    packages: { status: 'unknown', reason: 'permission unavailable' },
    billing: { status: 'unknown', reason: 'permission unavailable' },
    supportReviewPolicy,
  });
  assert.equal(report.inventory.packages.status, 'unknown');
  assert.equal(report.inventory.billing.status, 'unknown');
  assert.equal(report.status, 'partial');
  assert.match(report.limitations.join(' '), /read:packages/u);
  assert.match(report.limitations.join(' '), /billing administrator/u);
  assert.equal(report.inventory.permissions.artifactAndLogRetentionDays, null);
  assert.equal(report.coverage.workflowRunHistoryMayBeTruncated, false);
});

test('partial audit marks unavailable inventories unknown instead of reporting zero', () => {
  const report = buildPlatformAudit({
    repo: 'owner/project',
    sourceSha: 'd'.repeat(40),
    generatedAt,
    repository: null,
    artifacts: { status: 'unknown', reason: 'GitHub API rate limit exhausted.', items: [] },
    workflowRuns: { status: 'unknown', reason: 'GitHub API rate limit exhausted.', items: [] },
    scheduledWorkflowRuns: {
      'browser-matrix.yml': {
        status: 'unknown',
        reason: 'GitHub API rate limit exhausted.',
        runs: [],
      },
    },
    packages: { status: 'unknown', reason: 'GitHub API rate limit exhausted.' },
    billing: { status: 'unknown', reason: 'GitHub API rate limit exhausted.' },
    supportReviewPolicy,
  });

  assert.equal(report.status, 'partial');
  assert.equal(report.inventory.artifacts.count, null);
  assert.equal(report.inventory.artifacts.bytes, null);
  assert.equal(report.inventory.workflowRuns.count, null);
  assert.equal(report.coverage.workflowRunsScanned, null);
  assert.equal(report.coverage.scheduledWorkflowRunsScanned, null);
  assert.equal(report.coverage.scheduledWorkflowRunInventoryStatus, 'unknown');
  assert.equal(report.coverage.workflowRunHistoryMayBeTruncated, null);
  assert.equal(report.trends.artifactCountDelta, null);
  assert.equal(report.trends.workflowRunCountDelta, null);
  assert.equal(report.cleanupPlan.status, 'unknown');
  assert.equal(report.cleanupPlan.candidates, null);
  assert.equal(report.cleanupPlan.deletionSupported, false);
  assert.equal(report.inventory.permissions.workflowStatus, 'unknown');
  assert.equal(report.inventory.permissions.actionsStatus, 'unknown');
  assert.equal(report.inventory.permissions.retentionStatus, 'unknown');
  assert.match(report.limitations.join(' '), /Artifact inventory unknown/u);
  assert.match(report.limitations.join(' '), /Workflow run inventory unknown/u);
});

test('artifact byte totals stay unknown when returned rows omit size metadata', () => {
  const report = buildPlatformAudit({
    repo: 'owner/project',
    sourceSha: 'f'.repeat(40),
    generatedAt,
    repository: { artifact_and_log_retention_days: 90 },
    workflowPermissions: {},
    actionPermissions: {},
    artifacts: [{ id: 1, name: 'manual-upload', expired: false }],
    workflowRuns: [],
    packages: { status: 'available', count: 0 },
    billing: { status: 'available', minutes_used: 0 },
    nodeSchedule: { v22: { end: '2027-04-30' } },
    supportReviewPolicy,
  });

  assert.equal(report.inventory.artifacts.count, 1);
  assert.equal(report.inventory.artifacts.bytes, null);
  assert.equal(report.inventory.artifacts.bytesStatus, 'partial');
  assert.equal(report.inventory.artifacts.unknownSizeCount, 1);
  assert.equal(report.status, 'partial');
  assert.equal(report.trends.artifactBytesDelta, null);
});

test('summary reports unknown capabilities and never implies cleanup executed', () => {
  const report = {
    source: { sha: 'c'.repeat(40) },
    inventory: {
      artifacts: { count: 2, bytes: 512, expiringWithinSevenDays: 1 },
      workflowRuns: {
        count: 3,
        scheduledWorkflows: [
          {
            name: 'Deep scheduled regression',
            status: 'missing-success',
            lastSuccessAt: null,
            maximumAgeDays: 8,
          },
        ],
      },
      packages: { status: 'unknown' },
      billing: { status: 'unknown' },
    },
    runtimeSupport: {
      reviews: [
        {
          component: 'PostgreSQL',
          configured: '16-alpine',
          reviewStatus: 'overdue',
          owner: 'repository maintainer',
          reviewBy: '2026-10-01',
        },
      ],
    },
    cleanupPlan: { status: 'available', candidates: [] },
    limitations: ['Billing API unavailable.'],
  };
  const summary = renderPlatformAuditSummary(report);
  assert.match(summary, /Registry inventory: unknown; Actions billing: unknown/u);
  assert.match(summary, /0 allowlisted candidates; no delete capability/u);
  assert.match(summary, /Schedule Deep scheduled regression: missing-success/u);
  assert.match(summary, /Runtime review PostgreSQL \(16-alpine\): overdue/u);
  assert.match(summary, /Limitation: Billing API unavailable\./u);
});

test('summary distinguishes partial inventories from zero and unavailable cleanup candidates', () => {
  const report = {
    status: 'partial',
    source: { sha: 'e'.repeat(40) },
    inventory: {
      artifacts: {
        status: 'unknown',
        reason: 'rate limit exhausted',
        bytesStatus: 'unknown',
      },
      workflowRuns: { status: 'unknown', reason: 'rate limit exhausted', scheduledWorkflows: [] },
      packages: { status: 'unknown' },
      billing: { status: 'unknown' },
    },
    runtimeSupport: { reviews: [] },
    cleanupPlan: { status: 'unknown', reason: 'rate limit exhausted' },
    limitations: [],
  };
  const summary = renderPlatformAuditSummary(report);
  assert.match(summary, /Audit status: partial/u);
  assert.match(summary, /Active artifacts: unknown \(rate limit exhausted\)/u);
  assert.match(summary, /Workflow runs inspected \(90 days\): unknown/u);
  assert.match(summary, /candidates unknown \(rate limit exhausted\)/u);
  assert.doesNotMatch(summary, /0 allowlisted candidates/u);

  const incompleteSizes = renderPlatformAuditSummary({
    ...report,
    inventory: {
      ...report.inventory,
      artifacts: {
        status: 'available',
        count: 1,
        bytes: null,
        bytesStatus: 'partial',
        unknownSizeCount: 1,
        expiringWithinSevenDays: 0,
      },
    },
  });
  assert.match(incompleteSizes, /1 \(size unknown for 1 artifact\(s\)\)/u);
  assert.doesNotMatch(incompleteSizes, /null bytes/u);
});

test('scheduled audit reports partial coverage but recovers incidents only after a complete report', async () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = await readFile(
    path.join(repositoryRoot, '.github/workflows/platform-audit.yml'),
    'utf8'
  );
  assert.match(workflow, /outputs:\s+status:\s+\$\{\{\s*steps\.generate\.outputs\.status\s*\}\}/u);
  assert.match(workflow, /echo "status=\$status" >> "\$GITHUB_OUTPUT"/u);
  assert.match(workflow, /steps\.generate\.outputs\.status != 'complete'/u);
  assert.ok(
    workflow.indexOf('name: Upload audit baseline') <
      workflow.indexOf('name: Require complete coverage for a successful audit'),
    'partial reports must be retained before the audit fails closed'
  );
  assert.match(
    workflow,
    /needs\.audit\.result == 'failure' \|\| needs\.audit\.outputs\.status == 'partial'/u
  );
  assert.match(
    workflow,
    /needs\.audit\.result == 'success' && needs\.audit\.outputs\.status == 'complete'/u
  );
});
