import { spawnSync } from 'node:child_process';
import { env, stderr, exit, execPath } from 'node:process';

const connectionString = env.POSTGRES_TEST_URL;
if (!connectionString) {
  stderr.write('POSTGRES_TEST_URL is required for test:integration.\n');
  exit(2);
}

const packageManagerCli = env.npm_execpath;
if (!packageManagerCli) {
  stderr.write(
    'Run test:integration through pnpm so the package manager can be resolved safely.\n'
  );
  exit(2);
}
const childEnvironment = {
  ...env,
  REQUIRE_POSTGRES_TESTS: 'true',
};

for (const args of [
  ['build'],
  ['--filter', '@moonwitness/api', 'exec', 'vitest', 'run', 'tests/postgres.integration.test.ts'],
]) {
  const result = spawnSync(execPath, [packageManagerCli, ...args], {
    env: childEnvironment,
    stdio: 'inherit',
  });
  if (result.error) {
    stderr.write(`${result.error.message}\n`);
    exit(1);
  }
  if (result.status !== 0) exit(result.status ?? 1);
}
