import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMainPushCiRun, verifyMainPushCiGate } from './main-ci-policy.mjs';

const sourceSha = 'a'.repeat(40);
const mainSuccess = {
  id: 10,
  run_attempt: 1,
  head_sha: sourceSha,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-10-05T00:00:00Z',
};

test('selects the newest exact-SHA main push CI run, ignoring PR and other-SHA runs', () => {
  const newerAttempt = { ...mainSuccess, run_attempt: 2, created_at: '2026-10-05T00:01:00Z' };
  const selected = selectMainPushCiRun(
    [
      mainSuccess,
      { ...mainSuccess, id: 11, event: 'pull_request', created_at: '2026-10-05T00:03:00Z' },
      { ...mainSuccess, id: 12, head_sha: 'b'.repeat(40), created_at: '2026-10-05T00:04:00Z' },
      newerAttempt,
    ],
    sourceSha
  );
  assert.equal(selected.id, 10);
  assert.equal(selected.run_attempt, 2);
});

test('requires the exact main push run and a successful ci-gate job', () => {
  assert.deepEqual(
    verifyMainPushCiGate(mainSuccess, [{ name: 'ci-gate', conclusion: 'success' }], sourceSha),
    {
      passed: true,
      runId: 10,
      runAttempt: 1,
    }
  );
  assert.equal(
    verifyMainPushCiGate(mainSuccess, [{ name: 'ci-gate', conclusion: 'failure' }], sourceSha)
      .passed,
    false
  );
  assert.equal(
    verifyMainPushCiGate(
      { ...mainSuccess, event: 'pull_request' },
      [{ name: 'ci-gate', conclusion: 'success' }],
      sourceSha
    ).passed,
    false
  );
});

test('keeps an in-progress run pending and rejects cancelled or failed runs', () => {
  assert.equal(
    verifyMainPushCiGate({ ...mainSuccess, status: 'in_progress' }, [], sourceSha).pending,
    true
  );
  assert.equal(
    verifyMainPushCiGate({ ...mainSuccess, conclusion: 'cancelled' }, [], sourceSha).passed,
    false
  );
});
