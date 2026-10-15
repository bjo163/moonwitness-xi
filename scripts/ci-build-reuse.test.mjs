import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const rootManifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);
const docsManifest = JSON.parse(
  await readFile(new URL('../apps/docs/package.json', import.meta.url), 'utf8')
);
const uiCatalogManifest = JSON.parse(
  await readFile(new URL('../apps/ui-catalog/package.json', import.meta.url), 'utf8')
);
const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const quality = workflow.split('  quality:\n')[1]?.split('\n  automation:\n')[0] ?? '';
const releaseWorkflow = await readFile(
  new URL('../.github/workflows/release.yml', import.meta.url),
  'utf8'
);

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
  assert.match(rootManifest.scripts['test:ui-budget'], /@moonwitness\/ui-catalog build:built/u);
  assert.match(uiCatalogManifest.scripts.build, /@moonwitness\/ui build/u);
  assert.match(uiCatalogManifest.scripts['build:built'], /tsc -p tsconfig\.json && vite build/u);
  assert.doesNotMatch(uiCatalogManifest.scripts['build:built'], /@moonwitness\/ui build/u);
});

test('built variants consume existing package output without invoking package builds', () => {
  assert.match(rootManifest.scripts['test:unit'], /^pnpm build && pnpm test:unit:built$/u);
  assert.doesNotMatch(rootManifest.scripts['test:unit:built'], /pnpm build/u);
  assert.match(rootManifest.scripts.verify, /pnpm typecheck && pnpm test:unit:built/u);
  assert.match(
    rootManifest.scripts.verify,
    /pnpm architecture:check:built && pnpm docs:build:built/u
  );
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

  assert.equal(rootManifest.scripts['test:integration'], 'node scripts/run-postgres-tests.mjs');
  assert.equal(
    rootManifest.scripts['test:integration:built'],
    'node scripts/run-postgres-tests.mjs --built'
  );
  const releaseVerification =
    releaseWorkflow.split('  verify:\n')[1]?.split('\n  publish:\n')[0] ?? '';
  assert.match(releaseVerification, /run: pnpm typecheck[\s\S]*run: pnpm docs:check:built/u);
  assert.match(releaseVerification, /run: pnpm docs:check:built[\s\S]*run: pnpm test:unit:built/u);
  assert.match(releaseVerification, /run: pnpm typecheck[\s\S]*run: pnpm test:integration:built/u);
});

test('built PostgreSQL mode is recognized and still requires an explicit test database', () => {
  const result = spawnSync(process.execPath, ['scripts/run-postgres-tests.mjs', '--built'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    env: { ...process.env, POSTGRES_TEST_URL: '' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /POSTGRES_TEST_URL is required/u);
  assert.doesNotMatch(result.stderr, /Usage:/u);
});
