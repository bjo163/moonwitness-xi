import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnvConfig } from '@moonwitness/types';

const apiDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(apiDirectory, '../../../../');
dotenv.config({ path: path.join(repositoryRoot, '.env') });

const metricsToken = process.env.METRICS_TOKEN || undefined;
if (metricsToken && metricsToken.length < 32) {
  throw new Error('METRICS_TOKEN must be at least 32 characters when configured');
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }
  return port;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function readDatabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol and include a host');
  }
  return value;
}

const databaseUrl = readDatabaseUrl(
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/moonwitness_db'
);

export const config: EnvConfig = {
  superadminPassword: process.env.SUPERADMIN_PASSWORD || undefined,
  metricsToken,
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.API_HOST ?? process.env.HOST ?? '0.0.0.0',
  port: readPort(process.env.API_PORT ?? process.env.PORT),
  db: {
    client: 'pg',
    connection: databaseUrl,
  },
  log: {
    level: process.env.LOG_LEVEL,
    dir: path.resolve(repositoryRoot, process.env.LOG_DIR || 'logs'),
    fileName: process.env.LOG_FILE_NAME || 'api.log',
    enableFile: process.env.LOG_TO_FILE !== 'false',
    prettyPrint: process.env.LOG_PRETTY !== 'false',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || undefined,
    accessTtlSeconds: readPositiveInt('ACCESS_TOKEN_TTL_SECONDS', 15 * 60),
    refreshTtlSeconds: readPositiveInt('REFRESH_TOKEN_TTL_SECONDS', 14 * 24 * 60 * 60),
    loginRateMax: readPositiveInt('AUTH_LOGIN_RATE_MAX', 10),
  },
};
