import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const rootManifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);
const docsManifest = JSON.parse(
  await readFile(new URL('../apps/docs/package.json', import.meta.url), 'utf8')
);
const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const quality = workflow.split('  quality:\n')[1]?.split('\n  automation:\n')[0] ?? '';

test('CI reuses the validated workspace build only inside its quality job', () => {
  const qualitySteps = ['pnpm typecheck', 'pnpm architecture:check:built', 'pnpm docs:build:built'];
  let previousIndex = -1;
  for (const command of qualitySteps) {
    const currentIndex = quality.indexOf(`run: ${command}`);
    assert.ok(currentIndex > previousIndex, `${command} must follow the earlier build step`);
    previousIndex = currentIndex;
  }

  assert.match(rootManifest.scripts.typecheck, /pnpm build/u);
  assert.match(rootManifest.scripts['architecture:check'], /--filter @moonwitness\/orm build/u);
  assert.match(rootManifest.scripts['docs:check'], /--filter @moonwitness\/types build/u);
  assert.match(rootManifest.scripts['docs:examples:check'], /--filter @moonwitness\/orm build/u);
  assert.match(docsManifest.scripts['portal:build'], /@moonwitness\/ui-catalog build/u);
  assert.match(docsManifest.scripts['portal:build'], /scripts\/docs\/build-guide\.mjs/u);
});

test('built variants consume existing package output without invoking package builds', () => {
  assert.equal(
    rootManifest.scripts['architecture:check:built'],
    'node scripts/architecture/generate-diagrams.mjs --check'
  );
  assert.match(rootManifest.scripts['docs:check:built'], /docs:examples:check:built/u);
  assert.doesNotMatch(rootManifest.scripts['docs:check:built'], /pnpm --filter .* build/u);
  assert.match(rootManifest.scripts['docs:build:built'], /docs:check:built/u);
  assert.match(rootManifest.scripts['docs:build:built'], /portal:build:built/u);
  assert.doesNotMatch(
    docsManifest.scripts['portal:build:built'],
    /@moonwitness\/ui-catalog build/u
  );
  assert.doesNotMatch(
    docsManifest.scripts['portal:build:built'],
    /scripts\/docs\/build-guide\.mjs/u
  );
});
