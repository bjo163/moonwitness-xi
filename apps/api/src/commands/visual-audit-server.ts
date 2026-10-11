import knex from 'knex';
import { buildApp } from '../app.js';

const database = knex({
  client: 'better-sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
});

const app = await buildApp({
  db: database,
  superadminPassword: process.env.SUPERADMIN_PASSWORD ?? 'e2e-only-password',
  jwtSecret: process.env.JWT_SECRET ?? 'e2e-only-jwt-secret-that-is-never-used-outside-tests',
  loginRateMax: 100,
});

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await app.close();
};

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await app.listen({
  host: process.env.API_HOST ?? '127.0.0.1',
  port: Number(process.env.API_PORT ?? 3017),
});
