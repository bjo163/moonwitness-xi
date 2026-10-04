import assert from 'node:assert/strict';
import test from 'node:test';
import { isCiGatePassing } from './ci-gate.mjs';

const successfulResults = {
  quality: 'success',
  integration: 'success',
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
  const { quality: _quality, ...missingQuality } = successfulResults;
  assert.equal(isCiGatePassing(missingQuality), false);
});
