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
  {
    name: 'api',
    packageName: '@moonwitness/api',
    excludePostgres: true,
    maxWorkers: 2,
    coverage: ['src/auth/policy.ts', 'src/auth/rules.ts'],
  },
  {
    name: 'auth',
    packageName: '@moonwitness/auth',
    typecheck: true,
    coverage: ['src/service.ts', 'src/refresh-token.ts'],
  },
  { name: 'client', packageName: '@moonwitness/client', typecheck: true },
  { name: 'jobs', packageName: '@moonwitness/jobs', typecheck: true, coverage: ['src/runtime.ts'] },
  { name: 'logger', packageName: '@moonwitness/logger' },
  { name: 'orm', packageName: '@moonwitness/orm', coverage: ['src/addon.ts'] },
  {
    name: 'orm-base',
    packageName: '@moonwitness/orm-base',
    typecheck: true,
    coverage: ['src/manifest.ts', 'src/data.ts'],
  },
  {
    name: 'orm-notification',
    packageName: '@moonwitness/orm-notification',
    typecheck: true,
    coverage: ['src/manifest.ts', 'src/runtime.ts'],
  },
  {
    name: 'orm-storage',
    packageName: '@moonwitness/orm-storage',
    typecheck: true,
    coverage: ['src/index.ts'],
  },
  {
    name: 'orm-workflow',
    packageName: '@moonwitness/orm-workflow',
    typecheck: true,
    coverage: ['src/manifest.ts', 'src/runtime.ts'],
  },
  {
    name: 'orm-organization',
    packageName: '@moonwitness/orm-organization',
    typecheck: true,
    coverage: ['src/validation.ts'],
  },
];

for (const suite of suites) {
  if (suite.typecheck) {
    run(
      ['--filter', suite.packageName, 'exec', 'tsc', '-p', 'tsconfig.check.json'],
      `${suite.name} typecheck`
    );
  }
  const args = ['--filter', suite.packageName, 'exec', 'vitest', 'run'];
  if (suite.maxWorkers) args.push(`--maxWorkers=${suite.maxWorkers}`);
  if (suite.excludePostgres) {
    args.push(
      '--exclude',
      'tests/postgres.integration.test.ts',
      '--exclude',
      'tests/postgres.performance.integration.test.ts'
    );
  }
  args.push(
    '--reporter=default',
    '--reporter=junit',
    `--outputFile.junit=${path.join(reportDirectory, `${suite.name}.xml`)}`
  );
  if (suite.coverage) {
    args.push(
      '--coverage',
      '--coverage.provider=v8',
      '--coverage.reporter=json',
      '--coverage.reporter=json-summary',
      ...suite.coverage.map((file) => `--coverage.include=${file}`),
      `--coverage.reportsDirectory=${path.join(root, 'test-results', 'coverage', suite.name)}`
    );
  }
  run(args, `${suite.name} tests`);
}

run(['run', 'test:assets'], 'brand asset contracts');
run(['run', 'test:ui'], 'shared UI token contracts');
run(['exec', 'node', 'scripts/check-coverage.mjs'], 'Critical branch coverage');
process.stdout.write(`JUnit reports written to ${path.relative(root, reportDirectory)}\n`);
