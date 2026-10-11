import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createAuthService, RefreshToken } from '@moonwitness/auth';
import { createDatabase } from '../database/knex.js';
import { config } from '../config/env.js';
import { validateJwtSecret } from '../plugins/auth.plugin.js';

export interface RevokeAuthSessionsOptions {
  readonly apply: boolean;
  readonly confirmAll: boolean;
  readonly confirmedHost: string | undefined;
  readonly confirmedPort: number | undefined;
  readonly confirmedDatabase: string | undefined;
}

export function parseOptions(args: readonly string[]): RevokeAuthSessionsOptions {
  let apply = false;
  let confirmAll = false;
  let confirmedHost: string | undefined;
  let confirmedPort: number | undefined;
  let confirmedDatabase: string | undefined;
  for (const argument of args) {
    if (argument === '--apply') {
      if (apply) throw new Error('--apply must be specified once');
      apply = true;
      continue;
    }
    if (argument === '--all') {
      if (confirmAll) throw new Error('--all must be specified once');
      confirmAll = true;
      continue;
    }
    if (argument.startsWith('--confirm-host=')) {
      if (confirmedHost !== undefined) throw new Error('--confirm-host must be specified once');
      confirmedHost = argument.slice('--confirm-host='.length);
      if (!confirmedHost) throw new Error('--confirm-host requires a hostname');
      continue;
    }
    if (argument.startsWith('--confirm-port=')) {
      if (confirmedPort !== undefined) throw new Error('--confirm-port must be specified once');
      const port = Number(argument.slice('--confirm-port='.length));
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        throw new Error('--confirm-port must be an integer from 1 to 65535');
      }
      confirmedPort = port;
      continue;
    }
    if (argument.startsWith('--confirm-database=')) {
      if (confirmedDatabase !== undefined)
        throw new Error('--confirm-database must be specified once');
      confirmedDatabase = argument.slice('--confirm-database='.length);
      if (!confirmedDatabase) throw new Error('--confirm-database requires a database name');
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (apply && (!confirmAll || !confirmedHost || !confirmedPort || !confirmedDatabase)) {
    throw new Error(
      '--apply requires --all and exact --confirm-host, --confirm-port, and --confirm-database values'
    );
  }
  if (
    !apply &&
    (confirmAll ||
      confirmedHost !== undefined ||
      confirmedPort !== undefined ||
      confirmedDatabase !== undefined)
  ) {
    throw new Error('confirmation options are only valid together with --apply');
  }
  return { apply, confirmAll, confirmedHost, confirmedPort, confirmedDatabase };
}

interface DatabaseTarget {
  readonly host: string;
  readonly port: number;
  readonly database: string;
}

export function confirmsDatabaseTarget(
  options: RevokeAuthSessionsOptions,
  target: DatabaseTarget
): boolean {
  return (
    options.confirmedHost === target.host &&
    options.confirmedPort === target.port &&
    options.confirmedDatabase === target.database
  );
}

function configuredDatabaseTarget(): DatabaseTarget {
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new Error('Set DATABASE_URL explicitly before inspecting auth sessions');
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connection);
  } catch {
    throw new Error('DATABASE_URL must identify the target PostgreSQL database');
  }
  const database = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (!database) throw new Error('DATABASE_URL must include a database name');
  return { host: databaseUrl.hostname, port: Number(databaseUrl.port || '5432'), database };
}

async function main(args: readonly string[]): Promise<void> {
  const options = parseOptions(args);
  const target = configuredDatabaseTarget();
  if (options.apply && !confirmsDatabaseTarget(options, target)) {
    throw new Error(
      'Confirmed database target does not match DATABASE_URL; no sessions were changed'
    );
  }

  const db = createDatabase();
  try {
    const service = createAuthService({
      refreshTokenSecret: validateJwtSecret(config.auth?.jwtSecret),
    });
    if (!options.apply) {
      const outstandingCount = await RefreshToken.query().where({ revoked: false }).resultSize();
      process.stdout.write(
        `${JSON.stringify({ mode: 'plan-only', ...target, outstandingSessions: outstandingCount })}\n`
      );
      return;
    }

    const revokedCount = await service.revokeAllSessions();
    process.stdout.write(
      `${JSON.stringify({ mode: 'applied', ...target, revokedSessions: revokedCount })}\n`
    );
  } finally {
    await db.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Session revocation failed'}\n`
    );
    process.exitCode = 1;
  });
}
