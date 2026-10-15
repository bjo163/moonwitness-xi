import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createDocAssetArtifacts, exportDocAssets } from './export-doc-assets.mjs';

test('static docs exports preserve manifest paths and record exact source hashes', () => {
  const banner = Buffer.from('<svg aria-label="MoonWitness"/>\n');
  const socialCard = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const tokens = Buffer.from(':root { --mw-paper: #f3efe4; }\n');
  const assetManifest = {
    schemaVersion: 1,
    assets: [
      {
        path: 'brand/readme-banner.svg',
        kind: 'readme-banner',
        format: 'svg',
        width: 1280,
        height: 320,
      },
      {
        path: 'brand/social-card.png',
        kind: 'social-card',
        format: 'png',
        width: 1200,
        height: 630,
      },
    ],
  };
  const outputs = createDocAssetArtifacts({
    assetManifest,
    assetManifestContents: Buffer.from(JSON.stringify(assetManifest)),
    assetSources: new Map([
      ['brand/readme-banner.svg', banner],
      ['brand/social-card.png', socialCard],
    ]),
    tokenContents: tokens,
  });

  assert.deepEqual(
    [...outputs.keys()],
    ['brand/readme-banner.svg', 'brand/social-card.png', 'styles/tokens.css', 'asset-map.json']
  );
  assert.deepEqual(outputs.get('brand/readme-banner.svg'), banner);
  assert.deepEqual(outputs.get('brand/social-card.png'), socialCard);
  assert.deepEqual(outputs.get('styles/tokens.css'), tokens);
  const mapping = JSON.parse(outputs.get('asset-map.json').toString('utf8'));
  assert.equal(mapping.basePath, 'assets/moonwitness');
  assert.equal(mapping.assets[0].output, 'docs/assets/moonwitness/brand/readme-banner.svg');
  assert.equal(mapping.assets[0].sha256.length, 64);
  assert.equal(mapping.stylesheets[0].source, 'packages/ui/src/styles/tokens.css');
  assert.equal(mapping.sources.tokensSha256.length, 64);
});

test('static export rejects traversal and duplicate asset paths from a manifest', () => {
  const baseInput = {
    assetManifestContents: Buffer.from('{}'),
    assetSources: new Map([['brand/logo.svg', Buffer.from('<svg/>')]]),
    tokenContents: Buffer.from(':root {}'),
  };
  assert.throws(
    () =>
      createDocAssetArtifacts({
        ...baseInput,
        assetManifest: {
          schemaVersion: 1,
          assets: [{ path: '../logo.svg', kind: 'logo', format: 'svg' }],
        },
      }),
    /Unsafe generated asset path/u
  );
  assert.throws(
    () =>
      createDocAssetArtifacts({
        ...baseInput,
        assetManifest: {
          schemaVersion: 1,
          assets: [
            { path: 'brand/logo.svg', kind: 'logo', format: 'svg' },
            { path: 'brand/logo.svg', kind: 'logo', format: 'svg' },
          ],
        },
      }),
    /Duplicate asset manifest path/u
  );
});

test('committed Pages assets match the package manifest and shared UI tokens', async () => {
  const result = await exportDocAssets({ check: true });
  assert.equal(result.assetCount, 56);
  assert.equal(result.changedCount, 0);

  const [mappingSource, readme, documentationPage] = await Promise.all([
    readFile(new URL('../docs/assets/moonwitness/asset-map.json', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/design/brand-assets.md', import.meta.url), 'utf8'),
  ]);
  const mapping = JSON.parse(mappingSource);
  assert.equal(mapping.assets.length, 56);
  assert.ok(mapping.assets.every(({ output }) => output.startsWith('docs/assets/moonwitness/')));
  const banner = mapping.assets.find(
    ({ source }) => source === 'packages/assets/brand/readme-banner.svg'
  );
  assert.equal(banner?.output, 'docs/assets/moonwitness/brand/readme-banner.svg');
  assert.match(
    readme,
    /!\[MoonWitness — every model, one board\]\(packages\/assets\/brand\/readme-banner\.svg\)/u
  );
  assert.match(
    documentationPage,
    /!\[MoonWitness brand banner\]\(\.\.\/assets\/moonwitness\/brand\/readme-banner\.svg\)/u
  );
  const nestedPagesUrl = new URL(
    '../assets/moonwitness/brand/readme-banner.svg',
    'https://example.github.io/moonwitness-xi/design/brand-assets.html'
  );
  assert.equal(
    nestedPagesUrl.pathname,
    '/moonwitness-xi/assets/moonwitness/brand/readme-banner.svg'
  );
});
