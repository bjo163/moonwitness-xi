import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  auditScheduledWorkflows,
  buildPlatformAudit,
  evaluateRuntimeSupportReviews,
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
    ],
    generatedAt
  );

  assert.deepEqual(
    plan.candidates.map(({ id }) => id),
    [1, 5, 6]
  );
  assert.deepEqual(
    plan.protectedArtifacts.map(({ id }) => id),
    [2]
  );
  assert.deepEqual(
    plan.unclassified.map(({ id }) => id),
    [3]
  );
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
  assert.match(report.limitations.join(' '), /read:packages/u);
  assert.match(report.limitations.join(' '), /billing administrator/u);
  assert.equal(report.inventory.permissions.artifactAndLogRetentionDays, null);
  assert.equal(report.coverage.workflowRunHistoryMayBeTruncated, false);
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
    cleanupPlan: { candidates: [] },
    limitations: ['Billing API unavailable.'],
  };
  const summary = renderPlatformAuditSummary(report);
  assert.match(summary, /Registry inventory: unknown; Actions billing: unknown/u);
  assert.match(summary, /0 allowlisted candidates; no delete capability/u);
  assert.match(summary, /Schedule Deep scheduled regression: missing-success/u);
  assert.match(summary, /Runtime review PostgreSQL \(16-alpine\): overdue/u);
  assert.match(summary, /Limitation: Billing API unavailable\./u);
});
