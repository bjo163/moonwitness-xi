import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const scriptPath = fileURLToPath(new URL('./check-docs-publication.mjs', import.meta.url));

function withSite(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-docs-site-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function scan(directory) {
  return spawnSync(process.execPath, [scriptPath, directory], { encoding: 'utf8' });
}

test('accepts static public output without secrets or source maps', () => {
  withSite((directory) => {
    fs.writeFileSync(path.join(directory, 'index.html'), '<main>MoonWitness docs</main>');
    fs.writeFileSync(path.join(directory, 'build-info.json'), '{"sourceSha":"a"}');
    assert.equal(scan(directory).status, 0);
  });
});

test('rejects credential-like values in public output', () => {
  withSite((directory) => {
    fs.writeFileSync(
      path.join(directory, 'index.html'),
      'const password="synthetic-super-secret-value"'
    );
    const result = scan(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Potential secret detected/);
  });
});

test('rejects env/auth artifacts and source maps', () => {
  withSite((directory) => {
    fs.writeFileSync(path.join(directory, '.env.production'), 'SECRET=fixture');
    assert.match(scan(directory).stderr, /Forbidden publication path/);
  });
  withSite((directory) => {
    fs.writeFileSync(path.join(directory, 'index.js.map'), '{}');
    assert.match(scan(directory).stderr, /Source maps are not allowed/);
  });
});
