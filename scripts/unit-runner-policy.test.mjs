import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { URL } from 'node:url';
import { getUnitRunnerCheckPlan } from './unit-runner-policy.mjs';

const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('unit runner CI ownership', () => {
  it('runs every shared contract locally', () => {
    const plan = getUnitRunnerCheckPlan({ githubActions: false });

    assert.equal(plan.length, 3);
    assert.ok(plan.every(({ runInUnitRunner }) => runInUnitRunner));
  });

  it('delegates only checks already owned by dedicated CI jobs', () => {
    const plan = getUnitRunnerCheckPlan({ githubActions: true });
    const owners = Object.fromEntries(
      plan.map(({ name, ciOwner, runInUnitRunner }) => [name, { ciOwner, runInUnitRunner }])
    );

    assert.deepEqual(owners, {
      'Versioned documentation': { ciOwner: 'automation', runInUnitRunner: false },
      'brand asset contracts': { ciOwner: 'ui', runInUnitRunner: false },
      'shared UI token contracts': { ciOwner: 'ui', runInUnitRunner: false },
    });
    const automationJob = workflow.split('  automation:\n')[1]?.split('\n  integration:\n')[0];
    const uiJob = workflow.split('  ui:\n')[1]?.split('\n  containers:\n')[0];
    assert.ok(automationJob?.includes('pnpm test:versioned-docs'));
    assert.ok(uiJob?.includes('pnpm test:assets'));
    assert.ok(uiJob?.includes('packages/ui/tests/*.test.mjs'));
    assert.ok(uiJob?.includes('packages/ui/scripts/verify-package.mjs'));
  });
});
