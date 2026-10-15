import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { measureBoardBundle, renderBoardBundleSummary } from './check-board-bundle.mjs';

const budget = {
  schemaVersion: 1,
  initialJavaScript: { maxRawBytes: 100, maxGzipBytes: 100 },
  initialStylesheet: { maxRawBytes: 100, maxGzipBytes: 100 },
  lazyRouteJavaScript: { maxRawBytes: 100, maxGzipBytes: 100 },
  lazyRouteStylesheet: { maxRawBytes: 100, maxGzipBytes: 100 },
  fullRouteJavaScript: { maxRawBytes: 200, maxGzipBytes: 200 },
};

function assetReader(assets) {
  return async (name) => {
    const content = assets.get(name);
    if (!content) throw new Error(`Unexpected asset read: ${name}`);
    return content;
  };
}

test('measures initial HTML imports separately from each lazy route and shares base chunks', async () => {
  const manifest = {
    'index.html': {
      file: 'index.html',
      imports: ['shared.js'],
      dynamicImports: ['dashboard.js', 'model.js'],
      css: ['base.css'],
    },
    'shared.js': { file: 'assets/shared.js' },
    'dashboard.js': {
      file: 'assets/dashboard.js',
      imports: ['shared.js'],
      dynamicImports: ['dashboard-dialog.js'],
      css: ['dashboard.css'],
    },
    'dashboard-dialog.js': { file: 'assets/dashboard-dialog.js' },
    'model.js': { file: 'assets/model.js', imports: ['shared.js'], css: ['model.css'] },
  };
  const assets = new Map([
    ['index.html', Buffer.from('html')],
    ['assets/shared.js', Buffer.from('shared')],
    ['assets/dashboard.js', Buffer.from('dashboard')],
    ['assets/dashboard-dialog.js', Buffer.from('dashboard dialog')],
    ['assets/model.js', Buffer.from('model')],
    ['base.css', Buffer.from('base css')],
    ['dashboard.css', Buffer.from('dashboard css')],
    ['model.css', Buffer.from('model css')],
  ]);
  const report = await measureBoardBundle(manifest, assetReader(assets), budget);

  assert.deepEqual(
    report.summaries.map(({ name }) => name),
    [
      'Initial JavaScript',
      'Initial stylesheet',
      'dashboard.js route JavaScript',
      'dashboard.js route stylesheet',
      'dashboard.js full JavaScript route',
      'model.js route JavaScript',
      'model.js route stylesheet',
      'model.js full JavaScript route',
    ]
  );
  assert.equal(report.summaries[0].rawBytes, Buffer.byteLength('shared'));
  assert.equal(report.summaries[2].rawBytes, Buffer.byteLength('dashboard'));
  assert.equal(report.summaries[4].rawBytes, Buffer.byteLength('shareddashboarddashboard dialog'));
  assert.equal(report.summaries[5].rawBytes, Buffer.byteLength('model'));
  assert.equal(report.summaries[6].rawBytes, Buffer.byteLength('model css'));
  assert.equal(report.summaries[7].rawBytes, Buffer.byteLength('sharedmodel'));
  assert.ok(report.summaries.every(({ passed }) => passed));
  assert.match(renderBoardBundleSummary(report), /Initial JavaScript/u);
  assert.match(renderBoardBundleSummary(report), /model\.js full JavaScript route/u);
});

test('budget reports missing styles as zero and fails oversized initial or lazy assets', async () => {
  const manifest = {
    'index.html': {
      file: 'index.html',
      imports: ['initial.js'],
      dynamicImports: ['large-route.js'],
    },
    'initial.js': { file: 'assets/initial.js' },
    'large-route.js': { file: 'assets/large-route.js' },
  };
  const tightBudget = {
    ...budget,
    initialJavaScript: { maxRawBytes: 1, maxGzipBytes: 1 },
    lazyRouteJavaScript: { maxRawBytes: 1, maxGzipBytes: 1 },
    fullRouteJavaScript: { maxRawBytes: 1, maxGzipBytes: 1 },
  };
  const report = await measureBoardBundle(
    manifest,
    assetReader(
      new Map([
        ['index.html', Buffer.from('html')],
        ['assets/initial.js', Buffer.from('initial')],
        ['assets/large-route.js', Buffer.alloc(512, 1)],
      ])
    ),
    tightBudget
  );

  assert.equal(report.summaries[1].rawBytes, 0);
  assert.equal(report.summaries[1].passed, true);
  assert.equal(report.summaries[0].passed, false);
  assert.equal(report.summaries[2].passed, false);
  assert.equal(report.summaries[4].passed, false);
});

test('invalid and missing manifest dependencies fail closed', async () => {
  await assert.rejects(
    measureBoardBundle({}, async () => Buffer.from(''), budget),
    /no HTML entry/u
  );
  await assert.rejects(
    measureBoardBundle(
      { 'index.html': { file: 'index.html', imports: ['missing.js'] } },
      async () => Buffer.from(''),
      budget
    ),
    /missing or invalid entry/u
  );
});
