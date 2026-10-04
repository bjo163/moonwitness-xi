import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, stderr, exit, execPath, argv } from 'node:process';
import { URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const config = resolve(root, 'apps/board/playwright.config.ts');
if (!env.POSTGRES_TEST_URL) {
  stderr.write('POSTGRES_TEST_URL is required for test:e2e.\n');
  exit(2);
}
let testDatabaseName;
try {
  testDatabaseName = decodeURIComponent(new URL(env.POSTGRES_TEST_URL).pathname.slice(1));
} catch {
  stderr.write('POSTGRES_TEST_URL must be a valid PostgreSQL connection URL.\n');
  exit(2);
}
if (!/(?:^|[_-])(?:test|e2e)(?:$|[_-])/iu.test(testDatabaseName)) {
  stderr.write(
    'Refusing to reset E2E credentials: POSTGRES_TEST_URL database name must include test or e2e.\n'
  );
  exit(2);
}
if (!existsSync(config)) {
  stderr.write('E2E is not configured yet; complete roadmap task M3.01 before running test:e2e.\n');
  exit(2);
}
await mkdir(resolve(root, 'test-results/junit'), { recursive: true });

const packageManagerCli = env.npm_execpath;
if (!packageManagerCli) {
  stderr.write('Run test:e2e through pnpm so the package manager can be resolved safely.\n');
  exit(2);
}

const flakyPolicyCheck = spawnSync(execPath, ['scripts/check-flaky-policy.mjs'], {
  cwd: root,
  env,
  stdio: 'inherit',
});
if (flakyPolicyCheck.error) {
  stderr.write(`${flakyPolicyCheck.error.message}\n`);
  exit(1);
}
if (flakyPolicyCheck.status !== 0) exit(flakyPolicyCheck.status ?? 1);

const buildApiWorkspace = spawnSync(
  execPath,
  [packageManagerCli, '--filter', '@moonwitness/api...', 'build'],
  { cwd: root, env, stdio: 'inherit' }
);
if (buildApiWorkspace.error) {
  stderr.write(`${buildApiWorkspace.error.message}\n`);
  exit(1);
}
if (buildApiWorkspace.status !== 0) exit(buildApiWorkspace.status ?? 1);

const buildBoardPackages = spawnSync(
  execPath,
  [packageManagerCli, '--filter', '@moonwitness/ui', 'build'],
  { cwd: root, env, stdio: 'inherit' }
);
if (buildBoardPackages.error) {
  stderr.write(`${buildBoardPackages.error.message}\n`);
  exit(1);
}
if (buildBoardPackages.status !== 0) exit(buildBoardPackages.status ?? 1);

const e2ePassword = env.MW_E2E_SUPERADMIN_PASSWORD ?? 'e2e-only-password';
const resetE2ECredentials = spawnSync(
  execPath,
  [packageManagerCli, '--filter', '@moonwitness/api', 'run', 'reset:superadmin-password'],
  {
    cwd: root,
    env: {
      ...env,
      DATABASE_URL: env.POSTGRES_TEST_URL,
      SUPERADMIN_PASSWORD: e2ePassword,
    },
    stdio: 'inherit',
  }
);
if (resetE2ECredentials.error) {
  stderr.write(`${resetE2ECredentials.error.message}\n`);
  exit(1);
}
if (resetE2ECredentials.status !== 0) exit(resetE2ECredentials.status ?? 1);

const result = spawnSync(
  execPath,
  [
    packageManagerCli,
    'exec',
    'playwright',
    'test',
    '--config',
    'apps/board/playwright.config.ts',
    ...argv.slice(2),
  ],
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
