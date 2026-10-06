import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const installIndex = dockerfile.indexOf('pnpm install --frozen-lockfile');
const copiedWorkspaceManifests = new Set(
  [...dockerfile.matchAll(/^COPY ((?:apps|packages)\/[^\s]+\/package\.json) /gmu)].map(
    ([, manifestPath]) => manifestPath.replaceAll('\\', '/')
  )
);

test('production build copies every workspace manifest before frozen install', () => {
  assert.ok(installIndex >= 0, 'Dockerfile should install the frozen workspace lockfile');

  const missing = ['apps', 'packages'].flatMap((directory) =>
    readdirSync(directory)
      .filter((entry) => existsSync(path.join(directory, entry, 'package.json')))
      .map((entry) => `${directory}/${entry}/package.json`)
      .filter((manifestPath) => {
        const copyIndex = dockerfile.indexOf(`COPY ${manifestPath} `);
        return (
          copyIndex < 0 || copyIndex > installIndex || !copiedWorkspaceManifests.has(manifestPath)
        );
      })
  );

  assert.deepEqual(missing, []);
});

test('native SQLite dependency build installs its compiler toolchain only in the build stage', () => {
  const buildStage = dockerfile.slice(
    0,
    dockerfile.indexOf('\nFROM node:22-bookworm-slim AS runtime')
  );
  assert.match(buildStage, /apt-get install --yes --no-install-recommends python3 make g\+\+/u);
  assert.match(buildStage, /rm -rf \/var\/lib\/apt\/lists\/\*/u);
  assert.doesNotMatch(
    dockerfile.slice(dockerfile.indexOf('\nFROM node:22-bookworm-slim AS runtime')),
    /apt-get install/u
  );
});

test('production image uses legacy deployment for the non-injected workspace layout', () => {
  assert.match(dockerfile, /pnpm --filter @moonwitness\/api deploy --prod --legacy \/deploy\/api/u);
});

test('API deployment has an isolated stage so it cannot mutate the Board build workspace', () => {
  const buildStage = dockerfile.slice(0, dockerfile.indexOf('\nFROM build AS api-deploy'));
  const apiDeployStage = dockerfile.slice(
    dockerfile.indexOf('\nFROM build AS api-deploy'),
    dockerfile.indexOf('\nFROM node:22-bookworm-slim AS runtime')
  );
  const boardBuildStage = dockerfile.slice(dockerfile.indexOf('\nFROM build AS board-build'));

  assert.doesNotMatch(buildStage, /pnpm --filter @moonwitness\/api deploy/u);
  assert.match(
    apiDeployStage,
    /FROM build AS api-deploy[\s\S]*pnpm --filter @moonwitness\/api deploy/u
  );
  assert.match(dockerfile, /COPY --from=api-deploy --chown=node:node \/deploy\/api/u);
  assert.match(boardBuildStage, /FROM build AS board-build/u);
});
