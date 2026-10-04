import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { env, execPath, stderr, exit } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageManagerCli = env.npm_execpath;

if (!packageManagerCli || !existsSync(packageManagerCli)) {
  stderr.write('Run the workspace E2E suite through pnpm to build API dependencies.\n');
  exit(2);
}

const result = spawnSync(
  execPath,
  [packageManagerCli, '--filter', '@moonwitness/api...', 'build'],
  {
    cwd: repositoryRoot,
    env,
    stdio: 'inherit',
  }
);

if (result.error) {
  stderr.write(`${result.error.message}\n`);
  exit(1);
}

exit(result.status ?? 1);
