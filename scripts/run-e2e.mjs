import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, stderr, exit, execPath } from 'node:process';
import { URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const config = resolve(root, 'apps/board/playwright.config.ts');
if (!existsSync(config)) {
  stderr.write('E2E is not configured yet; complete roadmap task M3.01 before running test:e2e.\n');
  exit(2);
}

const packageManagerCli = env.npm_execpath;
if (!packageManagerCli) {
  stderr.write('Run test:e2e through pnpm so the package manager can be resolved safely.\n');
  exit(2);
}

const result = spawnSync(
  execPath,
  [packageManagerCli, '--filter', '@moonwitness/board', 'exec', 'playwright', 'test'],
  {
    cwd: root,
    env,
    stdio: 'inherit',
  }
);
if (result.error) {
  stderr.write(`${result.error.message}\n`);
  exit(1);
}
exit(result.status ?? 1);
