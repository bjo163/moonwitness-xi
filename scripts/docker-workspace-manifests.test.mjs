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
