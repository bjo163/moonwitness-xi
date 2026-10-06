import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoadmapProgress, renderRoadmapProgressMarkdown } from './progress-dashboard.mjs';

const sha = 'a'.repeat(40);
const tasks = [
  { id: 'M1.01', milestone: 'M1', labels: ['lane:governance'], dependsOn: [] },
  { id: 'M1.02', milestone: 'M1', priority: 'p1', status: 'in_progress', dependsOn: [] },
  { id: 'M2.01', milestone: 'M2', dependsOn: [] },
];
const roadmap =
  '- [x] M1.01 Complete implementation; not necessarily released.\n- [ ] M1.02 In progress.\n- [ ] M2.01 Planned.\n';

test('groups task work separately from delivery and leaves delivery unknown without evidence', () => {
  const report = buildRoadmapProgress({
    tasks,
    roadmap,
    sourceSha: sha,
    generatedAt: '2026-10-07T12:00:00.000Z',
  });
  assert.deepEqual(report.totals, {
    taskCount: 3,
    work: { todo: 1, running: 1, blocked: 0, complete: 1 },
    delivery: { verified: 0, main: 0, released: 0, planned: 0, unknown: 3 },
  });
  assert.equal(report.milestones.M1.work.complete, 1);
  assert.equal(report.milestones.M1.delivery.unknown, 2);
  assert.equal(report.items[0].labels[0], 'lane:governance');
  assert.equal(report.items[0].lane, 'governance');
  assert.equal(report.items[1].priority, 'p1');
});

test('uses validated lifecycle stages and blockers when provided', () => {
  const lifecycleByTask = new Map([
    ['M1.01', { workStatus: 'complete', deliveryStage: 'verified-dev', blockers: [] }],
    ['M1.02', { workStatus: 'blocked', deliveryStage: 'planned', blockers: ['Needs approval.'] }],
    ['M2.01', { workStatus: 'complete', deliveryStage: 'released', blockers: [] }],
  ]);
  const report = buildRoadmapProgress({
    tasks,
    roadmap,
    sourceSha: sha,
    generatedAt: '2026-10-07T12:00:00.000Z',
    lifecycleByTask,
  });
  assert.deepEqual(report.totals.work, { todo: 0, running: 0, blocked: 1, complete: 2 });
  assert.deepEqual(report.totals.delivery, {
    verified: 1,
    main: 0,
    released: 1,
    planned: 1,
    unknown: 0,
  });
  assert.deepEqual(report.items[1].blockers, ['Needs approval.']);
});

test('Markdown report is compact, source-bound and states the completion/delivery distinction', () => {
  const report = buildRoadmapProgress({
    tasks,
    roadmap,
    sourceSha: sha,
    generatedAt: '2026-10-07T12:00:00.000Z',
  });
  const markdown = renderRoadmapProgressMarkdown(report);
  assert.ok(markdown.includes(`Source SHA: \`${sha}\``));
  assert.match(markdown, /\| M1 \| 2 \|/u);
  assert.match(markdown, /not counted as verified, merged, or released/u);
});

test('rejects malformed source SHA rather than emitting unbound progress', () => {
  assert.throws(
    () =>
      buildRoadmapProgress({
        tasks,
        roadmap,
        sourceSha: 'short',
        generatedAt: '2026-10-07T12:00:00.000Z',
      }),
    /full Git SHA/u
  );
});

test('labels a dirty checkout so a base commit SHA is never presented as the exact build source', () => {
  const report = buildRoadmapProgress({
    tasks,
    roadmap,
    sourceSha: sha,
    generatedAt: '2026-10-07T12:00:00.000Z',
    sourceDirty: true,
  });
  assert.equal(report.sourceDirty, true);
});
