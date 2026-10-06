import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findFailedWorkspacePackage,
  summarizeWorkspaceBuildDiagnostics,
} from './workspace-build-diagnostics.mjs';

test('workspace build diagnostics expose only TypeScript location and code', () => {
  const output =
    'packages/orm-request build: src/manifest.ts(3,36): error TS2307: Cannot find module private-token';

  assert.deepEqual(summarizeWorkspaceBuildDiagnostics(output), [
    {
      path: 'packages/orm-request/src/manifest.ts',
      line: 3,
      column: 36,
      code: 'TS2307',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(summarizeWorkspaceBuildDiagnostics(output)), /private-token/u);
});

test('workspace build diagnostics report the pnpm failed package without command content', () => {
  assert.equal(
    findFailedWorkspacePackage(
      'ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @moonwitness/orm-request@1.0.0 build: `tsc`\nExit status 1'
    ),
    '@moonwitness/orm-request'
  );
  assert.equal(findFailedWorkspacePackage('Workspace failure without a package line'), undefined);
});
