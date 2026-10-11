import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { env, exit, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { resolvePackageManager } from './package-manager.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageManager = resolvePackageManager();
if (!packageManager) {
  stderr.write('Run the visual browser matrix through pnpm.\n');
  exit(2);
}

const result = spawnSync(
  packageManager.command,
  [
    ...packageManager.prefixArgs,
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
    ...(packageManager.shell ? { shell: true } : {}),
  }
);

exit(result.status ?? 1);
