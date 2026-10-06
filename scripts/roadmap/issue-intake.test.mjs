import assert from 'node:assert/strict';
import test from 'node:test';
import { planMaintainerIssueIntake } from './issue-intake.mjs';
import { normalizeGitHubIssueComment } from './github-issue-intake.mjs';

const baseEvent = {
  repositoryId: '123456789',
  deliveryId: 'delivery_123',
  issueNumber: 42,
  taskId: 'M11.08',
  actor: 'trusted-maintainer',
  action: 'status',
  status: 'blocked',
  rationale: 'Waiting for an approved security review.',
};
const input = {
  event: baseEvent,
  expectedRepositoryId: '123456789',
  maintainerLogins: new Set(['trusted-maintainer']),
  botLogins: new Set(['roadmap-sync[bot]']),
};

const webhookPayload = {
  action: 'created',
  repository: { id: 123456789 },
  issue: {
    number: 42,
    body: '<!-- moonwitness-task: 123456789:M11.08 -->\nManaged roadmap task.',
  },
  comment: {
    id: 7001,
    body: '/mw status blocked -- Waiting for an approved security review.',
    user: { login: 'trusted-maintainer', type: 'User' },
  },
};

test('normalizes only managed maintainer comments into a bounded, redelivery-stable event', () => {
  const normalized = normalizeGitHubIssueComment({
    payload: webhookPayload,
    expectedRepositoryId: '123456789',
  });
  assert.equal(normalized.disposition, 'event');
  assert.deepEqual(normalized.event, {
    repositoryId: '123456789',
    deliveryId: 'issue_comment_7001',
    issueNumber: 42,
    taskId: 'M11.08',
    actor: 'trusted-maintainer',
    isBot: false,
    pullRequest: false,
    action: 'status',
    status: 'blocked',
    rationale: 'Waiting for an approved security review.',
  });
  assert.deepEqual(
    normalizeGitHubIssueComment({ payload: webhookPayload, expectedRepositoryId: '123456789' }),
    normalized,
    'the same GitHub comment redelivery must produce the same idempotency key and proposal'
  );
  const planned = planMaintainerIssueIntake({
    event: normalized.event,
    expectedRepositoryId: '123456789',
    maintainerLogins: new Set(['trusted-maintainer']),
  });
  assert.equal(planned.disposition, 'proposal');
  assert.equal(planned.proposal.deliveryId, 'issue_comment_7001');
});

test('normalizer ignores unrelated, bot, pull-request, wrong-repository and non-managed events', () => {
  const normalize = (patch) =>
    normalizeGitHubIssueComment({
      payload: { ...webhookPayload, ...patch },
      expectedRepositoryId: '123456789',
    });
  assert.deepEqual(normalize({ action: 'edited' }), {
    disposition: 'ignored',
    reason: 'unsupported-event-action',
  });
  assert.deepEqual(
    normalize({
      comment: { ...webhookPayload.comment, user: { login: 'sync[bot]', type: 'Bot' } },
    }),
    { disposition: 'ignored', reason: 'bot-echo' }
  );
  assert.deepEqual(
    normalize({ issue: { ...webhookPayload.issue, pull_request: { url: 'ignored' } } }),
    { disposition: 'ignored', reason: 'pull-request' }
  );
  assert.deepEqual(normalize({ repository: { id: 999 } }), {
    disposition: 'ignored',
    reason: 'repository-mismatch',
  });
  assert.deepEqual(normalize({ issue: { ...webhookPayload.issue, body: 'unmanaged' } }), {
    disposition: 'ignored',
    reason: 'unmanaged-or-ambiguous-issue',
  });
  assert.deepEqual(
    normalize({ comment: { ...webhookPayload.comment, body: 'please mark this blocked' } }),
    { disposition: 'ignored', reason: 'not-an-intake-command' }
  );
});

test('normalizes scope and manual issue-state commands as inert proposal requests', () => {
  for (const [action, body] of [
    ['scope', '/mw scope -- Please add an explicit data-retention acceptance check.'],
    ['close', '/mw close -- Acceptance evidence is ready for review.'],
    ['reopen', '/mw reopen -- The linked evidence needs rechecking.'],
  ]) {
    const result = normalizeGitHubIssueComment({
      payload: {
        ...webhookPayload,
        comment: { ...webhookPayload.comment, body },
      },
      expectedRepositoryId: '123456789',
    });
    assert.equal(result.disposition, 'event');
    assert.equal(result.event.action, action);
    const proposal = planMaintainerIssueIntake({
      event: result.event,
      expectedRepositoryId: '123456789',
      maintainerLogins: new Set(['trusted-maintainer']),
    });
    assert.equal(proposal.disposition, 'proposal');
    assert.equal(proposal.proposal.deliveryId, 'issue_comment_7001');
  }
});

test('normalizer rejects duplicate identity markers and malformed command arguments', () => {
  const normalize = (patch) =>
    normalizeGitHubIssueComment({
      payload: { ...webhookPayload, ...patch },
      expectedRepositoryId: '123456789',
    });
  assert.deepEqual(
    normalize({
      issue: {
        ...webhookPayload.issue,
        body: `${webhookPayload.issue.body}\n<!-- moonwitness-task: 123456789:M11.08 -->`,
      },
    }),
    { disposition: 'ignored', reason: 'unmanaged-or-ambiguous-issue' }
  );
  assert.deepEqual(
    normalize({
      comment: { ...webhookPayload.comment, body: '/mw status -- Missing the status.' },
    }),
    { disposition: 'rejected', reason: 'invalid-command-arguments' }
  );
  assert.deepEqual(
    normalize({ comment: { ...webhookPayload.comment, body: '/mw scope extra -- Change this.' } }),
    { disposition: 'rejected', reason: 'invalid-command-arguments' }
  );
  assert.deepEqual(
    normalize({ comment: { ...webhookPayload.comment, id: Number.MAX_SAFE_INTEGER + 1 } }),
    { disposition: 'rejected', reason: 'invalid-github-identity' }
  );
  assert.deepEqual(
    normalizeGitHubIssueComment({ payload: webhookPayload, expectedRepositoryId: '../main' }),
    { disposition: 'rejected', reason: 'invalid-expected-repository-id' }
  );
});

test('trusted maintainer status is recorded as a proposal without accepting source state', () => {
  const result = planMaintainerIssueIntake(input);
  assert.equal(result.disposition, 'proposal');
  assert.equal(result.proposal.kind, 'roadmap-status');
  assert.equal(result.proposal.deliveryId, 'delivery_123');
  assert.equal(result.proposal.requestedStatus, 'blocked');
  assert.match(result.proposal.instruction, /no status is accepted automatically/u);
});

test('untrusted actors, bots, pull requests and other repositories are ignored', () => {
  assert.deepEqual(
    planMaintainerIssueIntake({ ...input, event: { ...baseEvent, actor: 'external-user' } }),
    { disposition: 'ignored', reason: 'actor-not-maintainer' }
  );
  assert.deepEqual(
    planMaintainerIssueIntake({ ...input, event: { ...baseEvent, actor: 'roadmap-sync[bot]' } }),
    { disposition: 'ignored', reason: 'bot-echo' }
  );
  assert.deepEqual(planMaintainerIssueIntake({ ...input, event: { ...baseEvent, isBot: true } }), {
    disposition: 'ignored',
    reason: 'bot-echo',
  });
  assert.deepEqual(
    planMaintainerIssueIntake({ ...input, event: { ...baseEvent, pullRequest: true } }),
    { disposition: 'ignored', reason: 'pull-request' }
  );
  assert.deepEqual(
    planMaintainerIssueIntake({ ...input, event: { ...baseEvent, repositoryId: '999' } }),
    { disposition: 'ignored', reason: 'repository-mismatch' }
  );
});

test('arbitrary commands and invalid status values are rejected; scope text remains inert', () => {
  assert.deepEqual(
    planMaintainerIssueIntake({
      ...input,
      event: { ...baseEvent, action: 'shell', proposal: 'rm -rf' },
    }),
    { disposition: 'rejected', reason: 'unsupported-action' }
  );
  assert.deepEqual(
    planMaintainerIssueIntake({ ...input, event: { ...baseEvent, status: 'publish' } }),
    { disposition: 'rejected', reason: 'unsupported-status' }
  );
  assert.deepEqual(
    planMaintainerIssueIntake({ ...input, event: { ...baseEvent, taskId: '../../main' } }),
    { disposition: 'rejected', reason: 'invalid-task-id' }
  );
  const scope = planMaintainerIssueIntake({
    ...input,
    event: {
      ...baseEvent,
      action: 'scope',
      proposal: 'fetch https://attacker.invalid/run',
      rationale: 'Propose a roadmap change.',
    },
  });
  assert.equal(scope.proposal.requestedChange, 'fetch https://attacker.invalid/run');
  assert.match(scope.proposal.instruction, /never executed or fetched/u);
});

test('close and reopen remain triage proposals unless accepted evidence permits close review', () => {
  const close = planMaintainerIssueIntake({
    ...input,
    event: { ...baseEvent, action: 'close' },
  });
  assert.equal(close.proposal.kind, 'issue-triage');
  assert.equal(close.proposal.requestedAction, 'close');
  const reopen = planMaintainerIssueIntake({
    ...input,
    event: { ...baseEvent, action: 'reopen' },
  });
  assert.equal(reopen.proposal.kind, 'issue-triage');
  assert.equal(reopen.proposal.requestedAction, 'reopen');
  const verified = planMaintainerIssueIntake({
    ...input,
    event: { ...baseEvent, action: 'close' },
    lifecycle: { acceptanceVerified: true, sourceSha: 'a'.repeat(40) },
  });
  assert.equal(verified.proposal.kind, 'issue-close-review');
});

test('malformed identities and unbounded or empty proposal text are rejected', () => {
  assert.deepEqual(
    planMaintainerIssueIntake({ ...input, event: { ...baseEvent, issueNumber: 1.5 } }),
    { disposition: 'rejected', reason: 'invalid-issue-number' }
  );
  assert.deepEqual(
    planMaintainerIssueIntake({ ...input, event: { ...baseEvent, deliveryId: '../main' } }),
    { disposition: 'rejected', reason: 'invalid-delivery-id' }
  );
  assert.throws(
    () => planMaintainerIssueIntake({ ...input, event: { ...baseEvent, rationale: '' } }),
    /rationale must be non-empty/u
  );
  assert.throws(
    () =>
      planMaintainerIssueIntake({
        ...input,
        event: { ...baseEvent, rationale: `x${'x'.repeat(2000)}` },
      }),
    /2000 characters/u
  );
});
