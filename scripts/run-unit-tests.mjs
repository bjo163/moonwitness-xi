import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDirectory = path.join(root, 'test-results', 'junit');
const packageManagerCli = process.env.npm_execpath;
if (!packageManagerCli) {
  process.stderr.write(
    'Run test:unit:ci through pnpm so the package manager can be resolved safely.\n'
  );
  process.exit(2);
}

await mkdir(reportDirectory, { recursive: true });

function run(args, label) {
  const result = spawnSync(process.execPath, [packageManagerCli, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`${label} failed with exit code ${result.status ?? 1}\n`);
    process.exit(result.status ?? 1);
  }
}

run(['build'], 'Build');

const suites = [
  { name: 'api', packageName: '@moonwitness/api', excludePostgres: true },
  { name: 'auth', packageName: '@moonwitness/auth', typecheck: true },
  { name: 'client', packageName: '@moonwitness/client', typecheck: true },
  { name: 'jobs', packageName: '@moonwitness/jobs', typecheck: true },
  { name: 'logger', packageName: '@moonwitness/logger' },
  { name: 'orm', packageName: '@moonwitness/orm' },
  { name: 'orm-base', packageName: '@moonwitness/orm-base', typecheck: true },
];

for (const suite of suites) {
  if (suite.typecheck) {
    run(
      ['--filter', suite.packageName, 'exec', 'tsc', '-p', 'tsconfig.check.json'],
      `${suite.name} typecheck`
    );
  }
  const args = ['--filter', suite.packageName, 'exec', 'vitest', 'run'];
  if (suite.excludePostgres) args.push('--exclude', 'tests/postgres.integration.test.ts');
  args.push(
    '--reporter=default',
    '--reporter=junit',
    `--outputFile.junit=${path.join(reportDirectory, `${suite.name}.xml`)}`
  );
  if (suite.name === 'api') {
    args.push(
      '--coverage',
      '--coverage.provider=v8',
      '--coverage.reporter=text',
      '--coverage.reporter=json-summary',
      `--coverage.reportsDirectory=${path.join(root, 'test-results', 'coverage', 'api')}`
    );
  }
  run(args, `${suite.name} tests`);
}

process.stdout.write(`JUnit reports written to ${path.relative(root, reportDirectory)}\n`);
