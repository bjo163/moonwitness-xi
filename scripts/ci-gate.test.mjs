import assert from 'node:assert/strict';
import test from 'node:test';
import { isCiGatePassing, renderCiJobSummary } from './ci-gate.mjs';

const successfulResults = {
  quality: 'success',
  integration: 'success',
  browser: 'success',
  containers: 'success',
  automation: 'success',
  ui: 'success',
};

test('accepts a success from every required job', () => {
  assert.equal(isCiGatePassing(successfulResults), true);
});

test('rejects a failed required job', () => {
  assert.equal(isCiGatePassing({ ...successfulResults, integration: 'failure' }), false);
});

test('rejects a cancelled required job', () => {
  assert.equal(isCiGatePassing({ ...successfulResults, containers: 'cancelled' }), false);
});

test('rejects a skipped required job', () => {
  assert.equal(isCiGatePassing({ ...successfulResults, automation: 'skipped' }), false);
});

test('rejects a missing required job', () => {
  const { browser: _browser, ...missingBrowser } = successfulResults;
  assert.equal(isCiGatePassing(missingBrowser), false);
});

test('accepts intentionally skipped jobs absent from a valid affected plan', () => {
  assert.equal(
    isCiGatePassing(
      {
        ...successfulResults,
        integration: 'skipped',
        browser: 'skipped',
        containers: 'skipped',
        automation: 'skipped',
      },
      ['quality'],
      'success'
    ),
    true
  );
});

test('rejects a skipped job selected by an affected plan', () => {
  assert.equal(
    isCiGatePassing(
      { ...successfulResults, integration: 'skipped' },
      ['quality', 'integration', 'automation'],
      'success'
    ),
    false
  );
});

test('rejects any run whose affected plan failed', () => {
  assert.equal(isCiGatePassing(successfulResults, ['quality', 'automation'], 'failure'), false);
});

test('accepts a package-specific plan without automation when its lane is skipped', () => {
  assert.equal(
    isCiGatePassing({ ...successfulResults, automation: 'skipped' }, ['quality'], 'success'),
    true
  );
});

test('rejects unknown jobs in the plan', () => {
  assert.equal(
    isCiGatePassing(successfulResults, ['quality', 'automation', 'unknown'], 'success'),
    false
  );
});

test('summarizes success, failure, and intentionally skipped jobs without environment data', () => {
  const summary = renderCiJobSummary(
    { ...successfulResults, integration: 'failure', browser: 'skipped' },
    ['quality', 'integration', 'automation'],
    'success'
  );
  assert.match(summary, /Overall: \*\*failed\*\*/);
  assert.match(summary, /\| integration \| failure \|/);
  assert.match(summary, /\| browser \| not selected \|/);
  assert.doesNotMatch(summary, /password|token|cookie|DATABASE_URL/i);
});
