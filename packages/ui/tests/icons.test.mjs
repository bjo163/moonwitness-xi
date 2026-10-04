import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UserIcon } from '../dist/icons/user.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const assetsRoot = resolve(root, '../assets/icons');
const sourceRoot = resolve(root, 'src/icons');
const distRoot = resolve(root, 'dist/icons');
const iconFiles = (await readdir(assetsRoot)).filter((file) => file.endsWith('.svg')).sort();

test('each static asset has a typed source and isolated compiled component subpath', async () => {
  assert.equal(iconFiles.length, 24);
  for (const file of iconFiles) {
    const name = file.slice(0, -4);
    const source = await readFile(resolve(sourceRoot, `${name}.tsx`), 'utf8');
    const compiled = await readFile(resolve(distRoot, `${name}.js`), 'utf8');
    assert.match(source, /SVGProps<SVGSVGElement>/u, name);
    assert.match(source, /useId\(\)/u, name);
    assert.match(source, /aria-hidden=\{title \? undefined : true\}/u, name);
    assert.match(source, /aria-labelledby=\{title \? titleId : undefined\}/u, name);
    assert.match(compiled, /currentColor/u, name);
    assert.doesNotMatch(compiled, /from ['"].*\/(?:index|icons)\.js/u, name);
  }
});

test('component barrel exposes every typed icon by stable name', async () => {
  const barrel = await readFile(resolve(sourceRoot, 'index.ts'), 'utf8');
  for (const file of iconFiles) {
    const component = `${file
      .slice(0, -4)
      .replace(/(^|-)([a-z])/gu, (_match, _separator, letter) => letter.toUpperCase())}Icon`;
    assert.match(barrel, new RegExp(`export \\{ ${component} \\}`, 'u'));
  }
});

test('icons are decorative by default and expose unique accessible title IDs on request', () => {
  const decorative = renderToStaticMarkup(createElement(UserIcon, { size: 20 }));
  assert.match(decorative, /aria-hidden="true"/u);
  assert.match(decorative, /width="20"/u);
  assert.doesNotMatch(decorative, /role="img"|<title/u);

  const labelled = renderToStaticMarkup(createElement(UserIcon, { title: 'Profile' }));
  assert.match(labelled, /role="img"/u);
  assert.match(labelled, /aria-labelledby="([^"]+)"/u);
  assert.match(labelled, /<title id="[^"]+">Profile<\/title>/u);

  const repeated = renderToStaticMarkup(
    createElement(
      'div',
      null,
      createElement(UserIcon, { title: 'First' }),
      createElement(UserIcon, { title: 'Second' })
    )
  );
  const titleIds = [...repeated.matchAll(/<title id="([^"]+)"/gu)].map(([, id]) => id);
  assert.equal(titleIds.length, 2);
  assert.notEqual(titleIds[0], titleIds[1]);
});
