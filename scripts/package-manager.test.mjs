import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execPath, platform } from 'node:process';
import test from 'node:test';
import { resolvePackageManager } from './package-manager.mjs';

test('uses the pnpm CLI path supplied by a package-manager script', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'moonwitness-pnpm-'));
  const cli = path.join(directory, 'pnpm.cjs');
  writeFileSync(cli, '');
  try {
    assert.deepEqual(resolvePackageManager({ npm_execpath: cli }, 'linux'), {
      command: execPath,
      prefixArgs: [cli],
      shell: false,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('falls back to the installed pnpm command when npm_execpath is absent', () => {
  const command = platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = resolvePackageManager({}, platform);

  assert.deepEqual(result, {
    command,
    prefixArgs: [],
    shell: false,
  });
});

test('ignores a stale npm_execpath and uses PATH fallback', () => {
  const result = resolvePackageManager({ npm_execpath: 'missing-pnpm-runtime.cjs' }, platform);

  assert.equal(result?.prefixArgs.length, 0);
  assert.equal(result?.command, platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
});
