import type { Knex } from 'knex';
import { config } from './env.js';

export function createPostgresKnexConfig(
  connectionString: string,
  limits: Pick<typeof config.db, 'poolMin' | 'poolMax' | 'acquireTimeoutMs' | 'statementTimeoutMs'>,
  overrides: Pick<Knex.Config, 'searchPath'> = {}
): Knex.Config {
  return {
    client: 'pg',
    connection: {
      connectionString,
      statement_timeout: limits.statementTimeoutMs,
    },
    pool: {
      min: limits.poolMin,
      max: limits.poolMax,
      acquireTimeoutMillis: limits.acquireTimeoutMs,
    },
    ...overrides,
  };
}

export const knexConfig: Record<string, Knex.Config> = {
  development: createPostgresKnexConfig(config.db.connection, config.db),
  production: createPostgresKnexConfig(config.db.connection, config.db),
  test: {
    client: 'better-sqlite3',
    connection: {
      filename: ':memory:',
    },
    useNullAsDefault: true,
  },
};

export default knexConfig;
