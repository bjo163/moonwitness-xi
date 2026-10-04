import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'manifest.json'), 'utf8'));
const assetByPath = new Map(manifest.assets.map((asset) => [asset.path, asset]));

test('manifest describes all stable brand and icon exports with unique paths', () => {
  assert.equal(manifest.name, '@moonwitness/assets');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.licenseManifest, 'licenses.json');
  assert.equal(assetByPath.size, manifest.assets.length);
  assert.equal(manifest.assets.length, 40);

  for (const kind of ['symbol', 'wordmark', 'lockup']) {
    for (const variant of ['light', 'dark', 'mono-light', 'mono-dark']) {
      assert.ok(assetByPath.has(`brand/moonwitness-${kind}-${variant}.svg`));
    }
  }
  for (const requiredPath of [
    'brand/favicon.svg',
    'brand/social-card.svg',
    'brand/social-card.png',
    'brand/readme-banner.svg',
  ]) {
    assert.ok(assetByPath.has(requiredPath), `${requiredPath} is exported`);
  }
  const iconNames = [
    'user',
    'partner',
    'company',
    'team',
    'addon',
    'model',
    'field',
    'relation',
    'activity',
    'attachment',
    'notification',
    'jobs',
    'workflow',
    'security',
    'search',
    'add',
    'edit',
    'delete',
    'settings',
    'calendar',
    'filter',
    'refresh',
    'external-link',
    'menu',
  ];
  assert.equal(manifest.assets.filter(({ kind }) => kind === 'icon').length, iconNames.length);
  for (const name of iconNames) {
    const icon = assetByPath.get(`icons/${name}.svg`);
    assert.ok(icon, `${name} icon is exported`);
    assert.equal(icon.variant, 'currentColor');
    assert.equal(icon.width, 24);
    assert.equal(icon.height, 24);
  }
});

test('every manifest path exists and its dimensions match the declared media size', async () => {
  for (const asset of manifest.assets) {
    const filePath = resolve(packageRoot, asset.path);
    const file = await stat(filePath);
    assert.ok(file.isFile(), `${asset.path} is a file`);
    assert.ok(file.size > 0, `${asset.path} is non-empty`);
    if (asset.format === 'svg') {
      const svg = await readFile(filePath, 'utf8');
      assert.match(svg, new RegExp(`viewBox="0 0 ${asset.width} ${asset.height}"`, 'u'));
      assert.match(svg, /<svg\s/u);
    }
  }
});

test('social card raster is a real 1200 by 630 PNG', async () => {
  const png = await readFile(resolve(packageRoot, 'brand/social-card.png'));
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test('brand SVGs are self-contained and have no executable or external references', async () => {
  for (const asset of manifest.assets.filter(({ format }) => format === 'svg')) {
    const svg = await readFile(resolve(packageRoot, asset.path), 'utf8');
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b/iu, asset.path);
    assert.doesNotMatch(svg, /(?:href|src)\s*=\s*["'](?:https?:|\/\/)/iu, asset.path);
    assert.doesNotMatch(svg, /@import|url\(\s*["']?(?:https?:|\/\/)/iu, asset.path);
  }
});

test('package exports only framework-independent static assets', async () => {
  const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.equal(packageJson.exports['./brand/*'], './brand/*');
  assert.equal(packageJson.exports['./icons/*'], './icons/*');
  assert.equal(packageJson.exports['./manifest.json'], './manifest.json');
  assert.equal(packageJson.exports['./licenses.json'], './licenses.json');
  assert.ok(packageJson.files.includes('brand'));
  assert.ok(packageJson.files.includes('icons'));
  assert.ok(packageJson.files.includes('manifest.json'));
});

test('provenance covers original design assets and every externally sourced font family', async () => {
  const provenance = JSON.parse(await readFile(resolve(packageRoot, 'licenses.json'), 'utf8'));
  assert.equal(provenance.schemaVersion, 1);
  assert.equal(provenance.packageLicense, 'ISC');
  assert.equal(provenance.originalAssets.source, 'packages/assets/scripts/generate.mjs');
  assert.equal(provenance.originalAssets.license, 'ISC');
  assert.equal(provenance.fonts.length, 3);
  assert.deepEqual(
    provenance.fonts.map(({ family }) => family).sort(),
    ['Anton', 'JetBrains Mono', 'Space Grotesk'].sort()
  );
  for (const font of provenance.fonts) {
    assert.equal(font.license, 'SIL Open Font License 1.1');
    assert.match(font.source, /^https:\/\//u);
    assert.match(font.usage, /not included/u);
  }
});
