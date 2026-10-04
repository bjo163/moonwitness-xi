import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath, URL as FileURL } from 'node:url';

const index = await readFile(
  fileURLToPath(new FileURL('../dist/index.html', import.meta.url)),
  'utf8'
);
const fallback = await readFile(
  fileURLToPath(new FileURL('../dist/404.html', import.meta.url)),
  'utf8'
);
assert.equal(fallback, index, 'GitHub Pages 404 fallback must load the same SPA shell');
assert.match(index, /(?:src|href)="\/moonwitness-xi\/assets\//u);
process.stdout.write('Verified the GitHub Pages base path and nested-route 404 fallback.\n');
