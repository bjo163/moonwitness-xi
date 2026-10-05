import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDependencyPlan,
  classifyCompatibility,
  renderSummary,
  selectUpdateCandidate,
} from './dependency-update-plan.mjs';

test('classifies patch, minor, major, same, and unknown versions without guessing', () => {
  assert.equal(classifyCompatibility('2.4.1', '2.4.2'), 'patch');
  assert.equal(classifyCompatibility('2.4.1', '2.5.0'), 'minor');
  assert.equal(classifyCompatibility('2.4.1', '3.0.0'), 'major');
  assert.equal(classifyCompatibility('2.4.1', '2.4.1'), 'same');
  assert.equal(classifyCompatibility('workspace:*', '2.0.0'), 'unknown');
});

test('groups exact outdated runtime, development, and action candidates deterministically', () => {
  const plan = buildDependencyPlan(
    {
      zeta: {
        current: '1.2.0',
        wanted: '1.2.0',
        latest: '2.0.0',
        dependencyType: 'dependencies',
        dependentPackages: [{ name: '@moonwitness/api' }],
        latestManifest: { repository: { url: 'git+https://github.com/acme/zeta.git' } },
      },
      eslint: {
        current: '9.0.0',
        wanted: '9.2.0',
        latest: '9.2.0',
        dependencyType: 'devDependencies',
      },
      'actions/checkout': {
        current: '4.4.0',
        wanted: '4.4.0',
        latest: '5.0.0',
        dependencyType: 'githubAction',
        dependentPackages: [{ name: '.github' }],
      },
      ignored: { current: '1.0.0', latest: '2.0.0', dependencyType: 'peerDependencies' },
    },
    'abc123',
    '2026-10-05T00:00:00.000Z'
  );

  assert.deepEqual(Object.keys(plan.groups), ['runtime', 'development', 'actions']);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(plan.groups.runtime[0]).filter(([key]) => key !== 'majorImpact')
    ),
    {
      name: 'zeta',
      current: '1.2.0',
      wanted: '1.2.0',
      latest: '2.0.0',
      compatibility: 'major',
      wantedCompatibility: 'same',
      dependents: ['@moonwitness/api'],
      releaseNotes: 'https://github.com/acme/zeta',
    }
  );
  assert.equal(plan.groups.development[0].compatibility, 'minor');
  assert.equal(plan.groups.actions[0].compatibility, 'major');
  assert.equal(plan.groups.runtime[0].majorImpact.status, 'manual-review-required');
  assert.deepEqual(plan.groups.runtime[0].majorImpact.workspaceDependents, ['@moonwitness/api']);
  assert.ok(
    plan.groups.runtime[0].majorImpact.requiredTasks.some((task) => task.includes('migration'))
  );
  assert.ok(plan.groups.runtime[0].majorImpact.requiredGates.includes('pnpm test:e2e'));
  assert.match(renderSummary(plan), /Major compatibility review: zeta/);
  assert.match(renderSummary(plan), /candidate executor refuses major updates/);
  assert.equal(plan.sourceSha, 'abc123');
  assert.equal(plan.mode, 'read-only-plan');
});

test('rejects non-GitHub repository URLs and missing dependency metadata safely', () => {
  const plan = buildDependencyPlan(
    {
      package: {
        current: '1.0.0',
        latest: '1.0.1',
        dependencyType: 'dependencies',
        latestManifest: { homepage: 'javascript:alert(1)' },
      },
    },
    'sha',
    'now'
  );
  assert.equal(plan.groups.runtime[0].releaseNotes, null);
  assert.deepEqual(plan.groups.runtime[0].dependents, []);
});

test('selects exactly one wanted non-major package and keeps major candidates report-only', () => {
  const plan = buildDependencyPlan(
    {
      safe: { current: '2.1.0', wanted: '2.1.2', latest: '3.0.0', dependencyType: 'dependencies' },
      major: {
        current: '1.0.0',
        wanted: '2.0.0',
        latest: '2.0.0',
        dependencyType: 'devDependencies',
      },
    },
    'a'.repeat(40),
    '2026-10-05T00:00:00.000Z'
  );
  assert.deepEqual(selectUpdateCandidate(plan, 'safe'), {
    packageName: 'safe',
    version: '2.1.2',
    sourceSha: 'a'.repeat(40),
    compatibility: 'patch',
  });
  assert.throws(() => selectUpdateCandidate(plan, 'major'), /report-only/);
  assert.throws(() => selectUpdateCandidate(plan, 'missing'), /found 0/);
  const prereleasePlan = buildDependencyPlan(
    {
      prerelease: {
        current: '1.0.0',
        wanted: '1.1.0-beta.1',
        latest: '1.1.0-beta.1',
        dependencyType: 'dependencies',
      },
    },
    'b'.repeat(40),
    '2026-10-05T00:00:00.000Z'
  );
  assert.throws(() => selectUpdateCandidate(prereleasePlan, 'prerelease'), /prerelease/);
});
