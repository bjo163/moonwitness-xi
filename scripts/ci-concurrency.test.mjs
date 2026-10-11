import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

test('CI cancels stale runs only within the same target branch and event type', () => {
  assert.match(
    workflow,
    /group:\s*ci-\$\{\{\s*github\.event\.pull_request\.base\.ref\s*\|\|\s*github\.ref_name\s*\}\}-\$\{\{\s*github\.event_name\s*\}\}/u
  );
  assert.match(workflow, /cancel-in-progress:\s*true/u);

  const group = (branch, event) => `ci-${branch}-${event}`;
  assert.notEqual(group('dev', 'push'), group('dev', 'pull_request'));
  assert.notEqual(group('main', 'pull_request'), group('dev', 'push'));
  assert.equal(group('dev', 'push'), group('dev', 'push'));
});

test('integration job supplies isolated credentials to the application restore drill', () => {
  const integrationJob = workflow.match(/ {2}integration:[\s\S]*?\n {2}browser:/u)?.[0];
  assert.ok(integrationJob, 'CI should define its integration job');
  assert.match(integrationJob, /JWT_SECRET:\s*ci-only-secret-that-is-at-least-32-characters-long/u);
});
