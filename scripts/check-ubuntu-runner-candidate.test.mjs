import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateUbuntuRunnerCandidate } from './check-ubuntu-runner-candidate.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Ubuntu candidate workflow compares supported and candidate images across critical lanes', async () => {
  const source = await readFile(
    path.join(repositoryRoot, '.github/workflows/ubuntu-runner-candidate.yml'),
    'utf8'
  );
  assert.deepEqual(validateUbuntuRunnerCandidate(source), []);
});

test('Ubuntu candidate policy rejects unsafe runner and permission changes', () => {
  const source = `
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  quality:
    strategy:
      matrix:
        runner: [ubuntu-latest, ubuntu-26.04]
    runs-on: ubuntu-latest
    steps:
      - run: pnpm install --frozen-lockfile --no-runtime
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm test:integration
      - uses: ./.github/actions/setup-pnpm
        with:
          node-version: '22'
          pnpm-version: '11.17.0'
      - run: psql "$POSTGRES_TEST_URL" -Atc 'SHOW server_version'
`;
  assert.ok(validateUbuntuRunnerCandidate(source).length >= 4);
});
