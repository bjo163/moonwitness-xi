import { spawnSync } from 'node:child_process';
import { env, stderr, exit } from 'node:process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolvePackageManager } from './package-manager.mjs';

const connectionString = env.POSTGRES_TEST_URL;
if (!connectionString) {
  stderr.write('POSTGRES_TEST_URL is required for test:integration.\n');
  exit(2);
}
const packageManager = resolvePackageManager();
if (!packageManager) {
  stderr.write(
    'Run test:integration through pnpm so the package manager can be resolved safely.\n'
  );
  exit(2);
}

const childEnvironment = {
  ...env,
  REQUIRE_POSTGRES_TESTS: 'true',
};
const reportDirectory = resolve('test-results/junit');
await mkdir(reportDirectory, { recursive: true });

for (const args of [
  ['build'],
  ['--filter', '@moonwitness/api', 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.integration.json'],
  [
    '--filter',
    '@moonwitness/api',
    'exec',
    'vitest',
    'run',
    'tests/postgres.integration.test.ts',
    'tests/postgres.performance.integration.test.ts',
    '--reporter=default',
    '--reporter=junit',
    `--outputFile.junit=${resolve(reportDirectory, 'postgres.xml')}`,
  ],
]) {
  const result = spawnSync(packageManager.command, [...packageManager.prefixArgs, ...args], {
    env: childEnvironment,
    stdio: 'inherit',
    ...(packageManager.shell ? { shell: true } : {}),
  });
  if (result.error) {
    stderr.write(`${result.error.message}\n`);
    exit(1);
  }
  if (result.status !== 0) exit(result.status ?? 1);
}
