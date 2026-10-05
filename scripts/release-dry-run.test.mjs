import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCleanSource,
  buildReleaseDryRunReport,
  resolveRepositorySlug,
} from './release-dry-run.mjs';

const source = { headSha: 'a'.repeat(40), baselineSha: 'b'.repeat(40), baselineTag: 'v1.0.0-rc.1' };

test('dry-run report includes exact diffs, release assets, gates, and no-write invariants', () => {
  const preparation = {
    source,
    status: 'prepared',
    version: '1.1.0-rc.1',
    releaseInputSha: 'c'.repeat(64),
    files: [
      {
        path: 'package.json',
        contents: '{"name":"workspace","version":"1.1.0-rc.1"}\n',
      },
      {
        path: 'CHANGELOG.md',
        contents: '# Changelog\n\n## [1.1.0-rc.1] - 2026-10-06\n\n### Added\n- New feature\n',
      },
    ],
  };
  const report = buildReleaseDryRunReport(
    preparation,
    new Map([
      ['package.json', '{"name":"workspace","version":"1.0.0-rc.1"}\n'],
      ['CHANGELOG.md', '# Changelog\n'],
    ]),
    'acme/moonwitness'
  );
  assert.deepEqual(report.versionDiff, [
    { path: 'package.json', from: '1.0.0-rc.1', to: '1.1.0-rc.1' },
  ]);
  assert.match(report.changelogDiff, /New feature/u);
  assert.equal(report.files.length, 2);
  assert.equal(report.assets.length, 11);
  assert.equal(report.assets[0].name, 'ghcr.io/acme/moonwitness:v1.1.0-rc.1');
  assert.equal(report.assets[5].name, 'release-api.spdx.json');
  assert.equal(report.assets[5].location, 'github-release-asset');
  assert.equal(report.assets[6].name, 'release-board.spdx.json');
  assert.equal(report.assets[7].name, 'release-assets.sha256');
  assert.equal(report.assets[5].implementationStatus, 'hosted-acceptance-pending');
  assert.equal(report.readinessFindings.length, 6);
  assert.match(report.readinessFindings[0], /hosted release acceptance/u);
  assert.equal(
    report.gates.every((gate) => gate.status === 'not-run'),
    true
  );
  assert.equal(report.gates.length, 25);
  assert.ok(report.gates.some((gate) => gate.id === 'api-board-image-sbom-attestations'));
  assert.equal(report.writesPerformed, false);
  assert.equal(report.registryWritesPerformed, false);
  assert.equal(report.githubReleaseCreated, false);
  assert.equal(report.pagesPublished, false);
  assert.equal(report.deploymentPerformed, false);
});

test('no-release report has no version diff/assets while preserving read-only status', () => {
  const report = buildReleaseDryRunReport({ source, status: 'no-release', files: [] }, new Map());
  assert.equal(report.status, 'no-release');
  assert.equal(report.version, null);
  assert.deepEqual(report.versionDiff, []);
  assert.deepEqual(report.assets, []);
  assert.deepEqual(report.gates, []);
  assert.equal(report.writesPerformed, false);
});

test('source cleanliness and remote slug validation fail closed', () => {
  assert.doesNotThrow(() => assertCleanSource(''));
  assert.throws(() => assertCleanSource(' M package.json\n'), /clean checkout/u);
  assert.equal(
    resolveRepositorySlug('https://github.com/acme/moonwitness.git'),
    'acme/moonwitness'
  );
  assert.equal(resolveRepositorySlug('git@github.com:acme/moonwitness.git'), 'acme/moonwitness');
  assert.throws(() => resolveRepositorySlug('origin'), /GitHub HTTPS or SSH/u);
});
