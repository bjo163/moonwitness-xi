import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import {
  renderBundleSummary,
  summarizeBundleGroup,
} from '../../../scripts/check-ui-catalog-budget.mjs';

test('bundle measurement reports raw/gzip sizes and passes within the declared budget', () => {
  const group = summarizeBundleGroup(
    'JavaScript',
    [{ name: 'catalog.js', contents: Buffer.from('catalog output') }],
    { maxRawBytes: 100, maxGzipBytes: 100 }
  );

  assert.equal(group.rawBytes, Buffer.byteLength('catalog output'));
  assert.ok(group.gzipBytes > 0);
  assert.equal(group.passed, true);
  assert.match(renderBundleSummary([group]), /\| JavaScript \|/u);
});

test('bundle measurement fails when either raw or gzip limit is crossed', () => {
  const rawOverBudget = summarizeBundleGroup(
    'JavaScript',
    [{ name: 'catalog.js', contents: Buffer.from('large') }],
    { maxRawBytes: 1, maxGzipBytes: 100 }
  );
  const gzipOverBudget = summarizeBundleGroup(
    'Stylesheet',
    [{ name: 'catalog.css', contents: Buffer.alloc(512, 0) }],
    { maxRawBytes: 1024, maxGzipBytes: 1 }
  );

  assert.equal(rawOverBudget.passed, false);
  assert.equal(gzipOverBudget.passed, false);
});

test('bundle measurement rejects an absent asset group instead of silently skipping it', () => {
  assert.throws(
    () => summarizeBundleGroup('JavaScript', [], { maxRawBytes: 100, maxGzipBytes: 100 }),
    /No JavaScript bundle files/u
  );
});
