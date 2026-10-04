import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const scriptPath = fileURLToPath(new URL('./write-docs-metadata.mjs', import.meta.url));

test('writes immutable source identity into an empty site directory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-docs-metadata-'));
  try {
    const result = spawnSync(process.execPath, [scriptPath, directory], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SOURCE_SHA: 'a'.repeat(40),
        SOURCE_REF: 'refs/heads/main',
        RUN_ID: '1234',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json'), 'utf8'));
    assert.deepEqual(
      { sourceSha: metadata.sourceSha, sourceRef: metadata.sourceRef, runId: metadata.runId },
      { sourceSha: 'a'.repeat(40), sourceRef: 'refs/heads/main', runId: '1234' }
    );
    assert.ok(Number.isFinite(Date.parse(metadata.generatedAt)));
    assert.equal(
      spawnSync(process.execPath, [scriptPath, directory], {
        encoding: 'utf8',
        env: {
          ...process.env,
          SOURCE_SHA: 'a'.repeat(40),
          SOURCE_REF: 'refs/heads/main',
          RUN_ID: '1234',
        },
      }).status,
      1
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a non-immutable source identifier', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-docs-metadata-'));
  try {
    const result = spawnSync(process.execPath, [scriptPath, directory], {
      encoding: 'utf8',
      env: { ...process.env, SOURCE_SHA: 'main', SOURCE_REF: 'main', RUN_ID: '1234' },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /40 hex characters/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
