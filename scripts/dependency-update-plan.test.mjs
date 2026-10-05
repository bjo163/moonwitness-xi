import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDependencyPlan, classifyCompatibility } from './dependency-update-plan.mjs';

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
  assert.deepEqual(plan.groups.runtime, [
    {
      name: 'zeta',
      current: '1.2.0',
      wanted: '1.2.0',
      latest: '2.0.0',
      compatibility: 'major',
      dependents: ['@moonwitness/api'],
      releaseNotes: 'https://github.com/acme/zeta',
    },
  ]);
  assert.equal(plan.groups.development[0].compatibility, 'minor');
  assert.equal(plan.groups.actions[0].compatibility, 'major');
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
