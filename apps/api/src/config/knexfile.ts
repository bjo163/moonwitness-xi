import type { Knex } from 'knex';
import { config } from './env.js';

export const knexConfig: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: config.db.connection,
  },
  production: {
    client: 'pg',
    connection: config.db.connection,
  },
  test: {
    client: 'better-sqlite3',
    connection: {
      filename: ':memory:',
    },
    useNullAsDefault: true,
  },
};

export default knexConfig;
