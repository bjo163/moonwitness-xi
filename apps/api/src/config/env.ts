import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnvConfig } from '@moonwitness/types';

const apiDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(apiDirectory, '../../../');
dotenv.config({ path: path.join(repositoryRoot, '.env') });

function readPort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }
  return port;
}

export const config: EnvConfig = {
  env: process.env.NODE_ENV ?? 'development',
  host: process.env.API_HOST ?? process.env.HOST ?? '0.0.0.0',
  port: readPort(process.env.API_PORT ?? process.env.PORT),
  db: {
    client: 'pg',
    connection:
      process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/moonwitness_db',
  },
};
