import { existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, stderr, stdout, exit, execPath, argv } from 'node:process';
import { URL } from 'node:url';
import { writeE2EPreflightFailure } from './e2e-preflight-report.mjs';
import { renderWorkspaceBuildFailure } from './ci/workspace-build-diagnostics.mjs';

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
const junitDirectory = resolve(root, 'test-results/junit');
await mkdir(junitDirectory, { recursive: true });
await Promise.all(
  ['board-e2e.xml', 'board-e2e-retries.json'].map(async (file) => {
    try {
      await unlink(resolve(junitDirectory, file));
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  })
);

async function runPreflight(stage, command, args, commandEnv = env) {
  stderr.write(`Running Board E2E preflight: ${stage}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: commandEnv,
    ...(stage === 'build-api'
      ? { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      : { stdio: 'inherit' }),
  });
  if (stage === 'build-api') stdout.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.error || result.status !== 0) {
    if (result.error) stderr.write(`Could not start Board E2E preflight stage: ${stage}.\n`);
    const details =
      stage === 'build-api'
        ? renderWorkspaceBuildFailure(
            `${result.stdout ?? ''}${result.stderr ?? ''}`,
            result.status ?? 1
          )
        : undefined;
    await writeE2EPreflightFailure(junitDirectory, stage, result.status ?? 1, details);
    exit(result.status ?? 1);
  }
}

const packageManagerCli = env.npm_execpath;
if (!packageManagerCli) {
  stderr.write('Run test:e2e through pnpm so the package manager can be resolved safely.\n');
  await writeE2EPreflightFailure(junitDirectory, 'pnpm-invocation', 2);
  exit(2);
}

await runPreflight('flaky-policy', execPath, ['scripts/check-flaky-policy.mjs']);
await runPreflight('build-api', execPath, [
  'scripts/ci/build-workspace.mjs',
  '@moonwitness/api...',
]);
await runPreflight('build-ui', execPath, [
  packageManagerCli,
  '--filter',
  '@moonwitness/ui',
  'build',
]);

const e2ePassword = env.MW_E2E_SUPERADMIN_PASSWORD ?? 'e2e-only-password';
await runPreflight(
  'reset-superadmin-password',
  execPath,
  [packageManagerCli, '--filter', '@moonwitness/api', 'run', 'reset:superadmin-password'],
  {
    ...env,
    DATABASE_URL: env.POSTGRES_TEST_URL,
    SUPERADMIN_PASSWORD: e2ePassword,
  }
);

stderr.write('Starting Board E2E tests with Playwright.\n');
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
if (
  result.error ||
  (result.status !== 0 && !existsSync(resolve(junitDirectory, 'board-e2e.xml')))
) {
  if (result.error) stderr.write('Could not start the Playwright test process.\n');
  await writeE2EPreflightFailure(junitDirectory, 'start-playwright', result.status ?? 1);
}
exit(result.status ?? 1);
