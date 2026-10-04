import assert, { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { ciProjectsForAffectedPackages, expandWorkspaceDependencies } from './select-affected.mjs';

const workspace = [
  { name: '@moonwitness/types', dependencies: [] },
  { name: '@moonwitness/orm', dependencies: ['@moonwitness/types'] },
  {
    name: '@moonwitness/orm-base',
    dependencies: ['@moonwitness/orm'],
  },
  {
    name: '@moonwitness/auth',
    dependencies: ['@moonwitness/orm', '@moonwitness/orm-base'],
  },
  {
    name: '@moonwitness/jobs',
    dependencies: ['@moonwitness/orm', '@moonwitness/orm-base'],
  },
  {
    name: '@moonwitness/api',
    dependencies: [
      '@moonwitness/auth',
      '@moonwitness/jobs',
      '@moonwitness/orm',
      '@moonwitness/orm-base',
      '@moonwitness/types',
    ],
  },
  { name: '@moonwitness/client', dependencies: ['@moonwitness/types'] },
  { name: '@moonwitness/board', dependencies: ['@moonwitness/client'] },
  { name: '@moonwitness/ui', dependencies: [] },
  { name: '@moonwitness/ui-catalog', dependencies: ['@moonwitness/ui'] },
  { name: '@moonwitness/assets', dependencies: [] },
];

test('ORM changes expand to auth, jobs, API, and the Board transitively', () => {
  const affected = expandWorkspaceDependencies(['@moonwitness/orm'], workspace);
  deepEqual(
    [...affected].sort(),
    [
      '@moonwitness/api',
      '@moonwitness/auth',
      '@moonwitness/jobs',
      '@moonwitness/orm',
      '@moonwitness/orm-base',
    ].sort()
  );
  deepEqual(ciProjectsForAffectedPackages([...affected]).sort(), [
    'automation',
    'browser',
    'containers',
    'integration',
    'quality',
  ]);
});

test('base type package changes propagate through ORM consumers and client/Board', () => {
  const affected = expandWorkspaceDependencies(['@moonwitness/types'], workspace);
  deepEqual(
    [...affected].sort(),
    [
      '@moonwitness/api',
      '@moonwitness/auth',
      '@moonwitness/board',
      '@moonwitness/client',
      '@moonwitness/jobs',
      '@moonwitness/orm',
      '@moonwitness/orm-base',
      '@moonwitness/types',
    ].sort()
  );
});

test('an unrelated workspace remains outside the dependency closure', () => {
  const affected = expandWorkspaceDependencies(['@moonwitness/logger'], workspace);
  equal(affected.size, 1);
  equal(affected.has('@moonwitness/logger'), true);
});

test('catalog-only changes select UI quality and browser acceptance without unrelated database jobs', () => {
  const affected = expandWorkspaceDependencies(['@moonwitness/ui-catalog'], workspace);
  deepEqual(ciProjectsForAffectedPackages([...affected]).sort(), ['automation', 'quality', 'ui']);
});

test('shared UI or SVG assets select UI package, catalog, and static asset validation', () => {
  const uiAffected = expandWorkspaceDependencies(['@moonwitness/ui'], workspace);
  assert.equal(uiAffected.has('@moonwitness/ui-catalog'), true);
  deepEqual(ciProjectsForAffectedPackages([...uiAffected]).sort(), ['automation', 'quality', 'ui']);
  deepEqual(ciProjectsForAffectedPackages(['@moonwitness/assets']).sort(), [
    'automation',
    'quality',
    'ui',
  ]);
});
