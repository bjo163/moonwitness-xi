import assert from 'node:assert/strict';
import test from 'node:test';
import { findWorkspaceVersionMismatches } from './workspace-version-policy.mjs';

test('requires every MoonWitness workspace to match the monorepo version, including private apps', () => {
  const mismatches = findWorkspaceVersionMismatches('1.0.0-rc.1', [
    {
      path: 'apps/api/package.json',
      manifest: { name: '@moonwitness/api', version: '1.0.0-rc.1' },
    },
    {
      path: 'apps/board/package.json',
      manifest: { name: '@moonwitness/board', version: '1.0.0-rc.2', private: true },
    },
    { path: 'packages/ui/package.json', manifest: { name: '@moonwitness/ui' } },
    { path: 'tools/lint/package.json', manifest: { name: '@outside/lint', version: '9.0.0' } },
  ]);

  assert.deepEqual(mismatches, [
    '@moonwitness/board (apps/board/package.json): 1.0.0-rc.2 (expected 1.0.0-rc.1)',
    '@moonwitness/ui (packages/ui/package.json): <missing> (expected 1.0.0-rc.1)',
  ]);
});

test('returns no mismatches for a consistent monorepo version', () => {
  assert.deepEqual(
    findWorkspaceVersionMismatches('2.4.0', [
      { path: 'apps/api/package.json', manifest: { name: '@moonwitness/api', version: '2.4.0' } },
      { path: 'packages/ui/package.json', manifest: { name: '@moonwitness/ui', version: '2.4.0' } },
    ]),
    []
  );
});
