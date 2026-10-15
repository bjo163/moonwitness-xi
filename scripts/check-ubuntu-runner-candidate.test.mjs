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
  const quality = source.split('  quality:\n')[1]?.split('\n  postgres-integration:\n')[0] ?? '';
  const buildReuseSequence = [
    'run: pnpm typecheck',
    'run: pnpm test:unit:built',
    'run: pnpm architecture:check:built',
    'run: pnpm docs:build:built',
  ];
  let previousIndex = -1;
  for (const step of buildReuseSequence) {
    const currentIndex = quality.indexOf(step);
    assert.ok(currentIndex > previousIndex, `${step} must reuse the earlier typecheck build`);
    previousIndex = currentIndex;
  }
});

test('actionlint compatibility exception is limited to the published Ubuntu 26.04 label', async () => {
  const source = await readFile(path.join(repositoryRoot, '.github/actionlint.yaml'), 'utf8');
  assert.match(source, /\.github\/workflows\/ubuntu-runner-candidate\.yml:/u);
  assert.match(source, /label "ubuntu-26\\\.04" is unknown/u);
  assert.doesNotMatch(source, /ubuntu-runner-candidate\.yml:[\s\S]*?ignore:[\s\S]*?ubuntu-24/u);
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
      - run: printf 'Runner image: %s\\n' "$ImageOS $ImageVersion"
      - run: pnpm install --frozen-lockfile --no-runtime
      - run: pnpm typecheck
      - run: pnpm test:unit:built
      - run: pnpm test:integration
      - uses: ./.github/actions/setup-pnpm
        with:
          node-version: '22'
          pnpm-version: '11.17.0'
      - run: psql "$POSTGRES_TEST_URL" -Atc 'SHOW server_version'
`;
  assert.ok(validateUbuntuRunnerCandidate(source).length >= 4);
});
