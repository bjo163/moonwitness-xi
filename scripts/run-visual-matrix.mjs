import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { env, exit, execPath, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageManagerCli = env.npm_execpath;
if (!packageManagerCli) {
  stderr.write('Run the visual browser matrix through pnpm.\n');
  exit(2);
}

const result = spawnSync(
  execPath,
  [
    packageManagerCli,
    '--filter',
    '@moonwitness/board',
    'exec',
    'playwright',
    'test',
    'e2e/visual-audit.spec.ts',
    '--config',
    'playwright.visual.config.ts',
  ],
  {
    cwd: repositoryRoot,
    env: { ...env, MW_VISUAL_BROWSER_MATRIX: 'true' },
    stdio: 'inherit',
  }
);

exit(result.status ?? 1);
