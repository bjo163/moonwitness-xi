import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';

const maintenanceUrl = process.env.POSTGRES_TEST_URL;
if (!maintenanceUrl) {
  process.stderr.write('POSTGRES_TEST_URL is required for the isolated restore drill.\n');
  process.exit(2);
}

let parsedMaintenanceUrl;
try {
  parsedMaintenanceUrl = new URL(maintenanceUrl);
} catch {
  process.stderr.write('POSTGRES_TEST_URL must be a PostgreSQL URL.\n');
  process.exit(2);
}
if (!['postgres:', 'postgresql:'].includes(parsedMaintenanceUrl.protocol)) {
  process.stderr.write('POSTGRES_TEST_URL must use the PostgreSQL protocol.\n');
  process.exit(2);
}
const normalizedHost = parsedMaintenanceUrl.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
const loopbackHost =
  normalizedHost === 'localhost' ||
  normalizedHost === '::1' ||
  /^127(?:\.\d{1,3}){3}$/u.test(normalizedHost);
const maintenanceDatabase = decodeURIComponent(parsedMaintenanceUrl.pathname.slice(1));
if (!loopbackHost || !/(?:^|[_-])(?:test|e2e|ci)(?:$|[_-])/iu.test(maintenanceDatabase)) {
  process.stderr.write(
    'Restore drill refused: POSTGRES_TEST_URL must use a loopback host and a test/e2e/ci database name.\n'
  );
  process.exit(2);
}

const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
const sourceName = `mw_restore_src_${suffix}`;
const targetName = `mw_restore_dst_${suffix}`;
const sourceUrl = new URL(maintenanceUrl);
sourceUrl.pathname = `/${sourceName}`;
const targetUrl = new URL(maintenanceUrl);
targetUrl.pathname = `/${targetName}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'moonwitness-restore-drill-'));
const expectationsFile = join(temporaryDirectory, 'expectations.json');
await chmod(temporaryDirectory, 0o700);
const fixturePassword = randomBytes(32).toString('base64url');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
  if (result.error || result.status !== 0) {
    const diagnostics = [result.stderr, result.stdout]
      .filter((output) => typeof output === 'string' && output.length > 0)
      .join('\n')
      .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, '[PostgreSQL URL redacted]')
      .replace(/((?:password|secret|token)(?:_hash)?\s*(?:=|:)\s*)[^,\s)]+/giu, '$1[redacted]')
      .split(/\r?\n/u)
      .slice(-10)
      .join('\n')
      .slice(-1600);
    throw new Error(
      `${command} failed${result.status === null ? '' : ` with exit ${result.status}`}${diagnostics ? `:\n${diagnostics}` : ''}`
    );
  }
  return result.stdout.trim();
}

function invokeFixture(mode, databaseUrl) {
  return JSON.parse(
    run(
      'pnpm',
      [
        '--filter',
        '@moonwitness/api',
        'exec',
        'tsx',
        'src/commands/restore-drill-fixture.ts',
        mode,
      ],
      {
        env: {
          ...process.env,
          RESTORE_DRILL_DATABASE_URL: databaseUrl,
          RESTORE_DRILL_EXPECTATIONS_FILE: expectationsFile,
          RESTORE_DRILL_PASSWORD: fixturePassword,
        },
      }
    )
  );
}

async function main() {
  const report = {};
  const backupFileDirectory = join(temporaryDirectory, 'backups');
  let createdSource = false;
  let createdTarget = false;
  try {
    run('createdb', [`--maintenance-db=${maintenanceUrl}`, sourceName]);
    createdSource = true;
    run('createdb', [`--maintenance-db=${maintenanceUrl}`, targetName]);
    createdTarget = true;

    report.fixtureSeed = invokeFixture('seed', sourceUrl.toString());
    const backupStarted = performance.now();
    const backupFile = run('bash', ['scripts/backup-postgres.sh'], {
      env: {
        ...process.env,
        DATABASE_URL: sourceUrl.toString(),
        BACKUP_DIR: backupFileDirectory,
      },
    });
    report.backupDurationMs = Math.round(performance.now() - backupStarted);
    report.backupFileMode = '0600';

    const restoreEnvironment = {
      ...process.env,
      DATABASE_URL: targetUrl.toString(),
      BACKUP_FILE: backupFile,
      ALLOW_DATABASE_RESTORE: 'true',
    };
    run('psql', [
      targetUrl.toString(),
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      "CREATE TABLE restore_drill_confirmation_sentinel (value text PRIMARY KEY); INSERT INTO restore_drill_confirmation_sentinel VALUES ('unchanged');",
    ]);
    const mismatch = spawnSync('bash', ['scripts/restore-postgres.sh'], {
      encoding: 'utf8',
      input: 'wrong-database-confirmation\n',
      env: restoreEnvironment,
    });
    if (mismatch.error || mismatch.status !== 2 || !mismatch.stderr.includes('restore cancelled')) {
      throw new Error('Restore script did not reject a mismatched database confirmation');
    }
    const targetAfterMismatch = run('psql', [
      targetUrl.toString(),
      '-X',
      '-A',
      '-t',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'SELECT value FROM restore_drill_confirmation_sentinel',
    ]);
    if (targetAfterMismatch !== 'unchanged') {
      throw new Error('Target database changed after the mismatched confirmation');
    }
    run('psql', [
      targetUrl.toString(),
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'DROP TABLE restore_drill_confirmation_sentinel',
    ]);

    const restoreStarted = performance.now();
    const restore = spawnSync('bash', ['scripts/restore-postgres.sh'], {
      encoding: 'utf8',
      input: `${targetName}\n`,
      env: restoreEnvironment,
    });
    if (restore.error || restore.status !== 0) throw new Error('PostgreSQL restore failed');
    report.restoreDurationMs = Math.round(performance.now() - restoreStarted);

    report.fixtureVerification = invokeFixture('verify', targetUrl.toString());
    report.status = 'passed';
    report.sourceAndTargetWereIsolated = true;
    report.mismatchedConfirmationRejected = true;
    report.rpo = 'not-established-by-this-one-off-drill; backup scheduling is infrastructure-owned';
    report.rtoScope =
      'measured backup and PostgreSQL restore duration for this synthetic dataset only; excludes infrastructure provisioning and traffic cutover';
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    try {
      if (createdTarget) {
        run('dropdb', [`--maintenance-db=${maintenanceUrl}`, '--if-exists', targetName]);
      }
      if (createdSource) {
        run('dropdb', [`--maintenance-db=${maintenanceUrl}`, '--if-exists', sourceName]);
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Restore drill failed'}\n`);
  process.exitCode = 1;
});
