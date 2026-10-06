import assert from 'node:assert/strict';
import test from 'node:test';
import { planMaintainerIssueIntake } from './issue-intake.mjs';

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
