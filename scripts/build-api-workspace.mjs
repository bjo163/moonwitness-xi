import { spawnSync } from 'node:child_process';
import { env, stderr, exit } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { resolvePackageManager } from './package-manager.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageManager = resolvePackageManager();

if (!packageManager) {
  stderr.write('Run the workspace E2E suite through pnpm to build API dependencies.\n');
  exit(2);
}

const result = spawnSync(
  packageManager.command,
  [...packageManager.prefixArgs, '--filter', '@moonwitness/api...', 'build'],
  {
    cwd: repositoryRoot,
    env,
    stdio: 'inherit',
    ...(packageManager.shell ? { shell: true } : {}),
  }
);

if (result.error) {
  stderr.write(`${result.error.message}\n`);
  exit(1);
}

exit(result.status ?? 1);
