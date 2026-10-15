import assert from 'node:assert/strict';
import test from 'node:test';
import { auditRoadmapIssues, renderIssueAuditSummary } from './audit-issues.mjs';

const sourceSha = 'a'.repeat(40);
const repositoryId = '123456789';
const repositoryUrl = 'https://github.com/owner/repo';
const tasks = [
  {
    id: 'M1.01',
    milestone: 'M1',
    detailFile: 'docs/roadmap/01-baseline.md',
    evidence: 'docs/roadmap/evidence/M1.01.md',
    labels: ['lane:core'],
    priority: 'p1',
  },
  {
    id: 'M1.02',
    milestone: 'M1',
    detailFile: 'docs/roadmap/01-baseline.md',
    labels: [],
  },
];

function issue(number, taskId, options = {}) {
  const body = [
    `<!-- moonwitness-task: ${repositoryId}:${taskId} -->`,
    '<!-- BEGIN MOONWITNESS MANAGED -->',
    `Source SHA: ${options.sourceSha ?? sourceSha}`,
    `Card: [docs/roadmap/01-baseline.md](${options.card ?? `${repositoryUrl}/blob/${sourceSha}/docs/roadmap/01-baseline.md`})`,
    `Evidence: [docs/roadmap/evidence/M1.01.md](${options.evidence ?? `${repositoryUrl}/blob/${sourceSha}/docs/roadmap/evidence/M1.01.md`})`,
    '<!-- END MOONWITNESS MANAGED -->',
    '## Maintainer notes',
    'Private user text must not be included in the report.',
  ].join('\n');
  return {
    number,
    body,
    state: 'open',
    milestone: { title: options.milestone ?? 'M1' },
    labels: (options.labels ?? ['roadmap', 'milestone:m1', 'priority:p1', 'lane:core']).map(
      (name) => ({ name })
    ),
  };
}

function audit(issues, options = {}) {
  return auditRoadmapIssues({
    tasks,
    issues,
    milestones: options.milestones ?? [
      { title: 'M1', number: 1, state: 'open' },
      { title: 'M9', number: 9, state: 'open' },
    ],
    labels: options.labels ?? [
      { name: 'roadmap' },
      { name: 'milestone:m1' },
      { name: 'priority:p1' },
      { name: 'lane:core' },
    ],
    repositoryId,
    repositoryUrl,
    sourceSha,
    generatedAt: '2026-10-07T15:00:00.000Z',
  });
}

test('audits missing, duplicate and orphan task identities without exposing issue bodies', () => {
  const report = audit([issue(10, 'M1.01'), issue(11, 'M1.01'), issue(12, 'M9.99')]);
  assert.deepEqual(report.missing, ['M1.02']);
  assert.deepEqual(report.duplicates, [{ taskId: 'M1.01', issueNumbers: [10, 11] }]);
  assert.deepEqual(report.orphans, [
    { taskId: 'M9.99', issueNumbers: [12], recommendedAction: 'needs-triage' },
  ]);
  assert.equal(JSON.stringify(report).includes('Private user text'), false);
});

test('finds stale source, milestone, managed labels and invalid generated links', () => {
  const stale = issue(20, 'M1.01', {
    sourceSha: 'b'.repeat(40),
    milestone: 'M9',
    labels: ['priority:p3', 'support'],
    card: 'https://attacker.invalid/execute',
  });
  const report = audit([stale], {
    milestones: [{ title: 'M9', number: 9, state: 'open' }],
    labels: [
      { name: 'roadmap' },
      { name: 'milestone:m1' },
      { name: 'priority:p1' },
      { name: 'lane:core' },
      { name: 'priority:p3' },
    ],
  });
  assert.deepEqual(report.staleSource, [
    { taskId: 'M1.01', issueNumber: 20, sourceSha: 'b'.repeat(40) },
  ]);
  assert.deepEqual(report.staleMilestoneIssues, [
    { taskId: 'M1.01', issueNumber: 20, actual: 'M9', expected: 'M1' },
  ]);
  assert.deepEqual(report.metadata.missingIssueLabels[0].labels, [
    'lane:core',
    'milestone:m1',
    'priority:p1',
    'roadmap',
  ]);
  assert.deepEqual(report.metadata.unexpectedManagedIssueLabels[0].labels, ['priority:p3']);
  assert.deepEqual(report.linkProblems, [
    { taskId: 'M1.01', issueNumber: 20, problems: ['card-link-dead-or-untrusted'] },
  ]);
  assert.deepEqual(report.metadata.missingMilestones, ['M1']);
  assert.deepEqual(report.metadata.orphanMilestones, [{ title: 'M9', number: 9 }]);
  assert.ok(report.metadata.orphanLabels.includes('priority:p3'));
});

test('ignores pull requests and markers owned by another repository; malformed generated block is a conflict', () => {
  const otherRepo = {
    ...issue(30, 'M1.01'),
    body: issue(30, 'M1.01').body.replace(repositoryId, '987654'),
  };
  const pullRequest = {
    ...issue(31, 'M1.01'),
    pull_request: { url: 'https://github.com/owner/repo/pull/31' },
  };
  const malformed = {
    ...issue(32, 'M1.01'),
    body: issue(32, 'M1.01').body.replace('<!-- END MOONWITNESS MANAGED -->', ''),
  };
  const report = audit([otherRepo, pullRequest, malformed]);
  assert.deepEqual(report.missing, ['M1.02']);
  assert.deepEqual(report.malformed, [
    { issueNumber: 32, taskId: 'M1.01', reason: 'malformed-managed-block' },
  ]);
  assert.match(renderIssueAuditSummary(report), /conflicts=1/u);
});

test('rejects invalid repository identity and abbreviated audit source SHA', () => {
  assert.throws(
    () =>
      auditRoadmapIssues({
        tasks,
        issues: [],
        milestones: [],
        labels: [],
        repositoryId: '0',
        repositoryUrl,
        sourceSha,
        generatedAt: '2026-10-07T15:00:00.000Z',
      }),
    /numeric/u
  );
  assert.throws(
    () =>
      auditRoadmapIssues({
        tasks,
        issues: [],
        milestones: [],
        labels: [],
        repositoryId,
        repositoryUrl,
        sourceSha: 'abc',
        generatedAt: '2026-10-07T15:00:00.000Z',
      }),
    /full Git SHA/u
  );
});
