import assert from 'node:assert/strict';
import test from 'node:test';
import { isCiGatePassing } from './ci-gate.mjs';

const successfulResults = {
  quality: 'success',
  integration: 'success',
  browser: 'success',
  containers: 'success',
  automation: 'success',
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
      { ...successfulResults, integration: 'skipped', browser: 'skipped', containers: 'skipped' },
      ['quality', 'automation'],
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

test('rejects a plan that omits the always-required automation job', () => {
  assert.equal(isCiGatePassing(successfulResults, ['quality'], 'success'), false);
});

test('rejects unknown jobs in the plan', () => {
  assert.equal(
    isCiGatePassing(successfulResults, ['quality', 'automation', 'unknown'], 'success'),
    false
  );
});
