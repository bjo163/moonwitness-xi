import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { env, execPath, platform, stdout } from 'node:process';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageManager = platform === 'win32' ? (env.ComSpec ?? 'cmd.exe') : 'pnpm';
const packageManagerPrefix = platform === 'win32' ? ['/d', '/s', '/c', 'pnpm'] : [];
const packageRoot = resolve(import.meta.dirname, '..');
const tempRoot = await mkdtemp(join(tmpdir(), 'moonwitness-ui-package-'));

try {
  const packed = await execFileAsync(
    packageManager,
    [...packageManagerPrefix, 'pack', '--pack-destination', tempRoot],
    {
      cwd: packageRoot,
      windowsHide: true,
    }
  );
  const archiveName = packed.stdout.match(/moonwitness-ui-[\w.-]+\.tgz/u)?.[0];
  assert.ok(archiveName, 'pnpm pack should report the generated archive');

  const consumerRoot = join(tempRoot, 'consumer');
  await mkdir(consumerRoot);
  await writeFile(
    join(consumerRoot, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  );
  await execFileAsync(
    packageManager,
    [
      ...packageManagerPrefix,
      'add',
      '--ignore-workspace',
      '--save-exact',
      `file:${join(tempRoot, archiveName)}`,
      'react@19',
      'radix-ui@1.6.7',
    ],
    { cwd: consumerRoot, windowsHide: true }
  );

  const source = `
import assert from 'node:assert/strict';
import { Button } from '@moonwitness/ui/components/button';
import { Field } from '@moonwitness/ui/components/field';
import { Pagination } from '@moonwitness/ui/components/pagination';
import { Table } from '@moonwitness/ui/components/table';
import { UserIcon } from '@moonwitness/ui/icons/user';
assert.equal(typeof Button, 'function');
assert.equal(typeof Field, 'function');
assert.equal(typeof Pagination, 'function');
assert.equal(typeof Table, 'function');
assert.equal(typeof UserIcon, 'function');
let internalPathWasRejected = false;
try { await import('@moonwitness/ui/dist/components/button.js'); }
catch (error) { internalPathWasRejected = error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'; }
assert.equal(internalPathWasRejected, true);
`;
  const consumerFile = join(consumerRoot, 'consumer.mjs');
  await writeFile(consumerFile, source);
  await execFileAsync(execPath, [consumerFile], {
    cwd: consumerRoot,
    windowsHide: true,
  });

  const packageJson = JSON.parse(
    await readFile(join(consumerRoot, 'node_modules/@moonwitness/ui/package.json'), 'utf8')
  );
  for (const stylesheet of ['./components.css', './styles/tokens.css']) {
    assert.ok(packageJson.exports[stylesheet], `Missing public CSS export ${stylesheet}`);
  }
  stdout.write('Packed consumer imports, private-path rejection, and CSS exports passed.\n');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
