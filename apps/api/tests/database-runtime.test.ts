import { describe, expect, it } from 'vitest';
import { readDatabaseRuntimeLimits } from '../src/config/database-runtime.js';
import knexConfig from '../src/config/knexfile.js';

describe('database runtime limits', () => {
  it('uses bounded pool and statement timeout defaults for PostgreSQL', () => {
    expect(readDatabaseRuntimeLimits({})).toEqual({
      poolMin: 0,
      poolMax: 10,
      acquireTimeoutMs: 30_000,
      statementTimeoutMs: 30_000,
    });
    expect(knexConfig.production).toMatchObject({
      pool: { min: 0, max: 10, acquireTimeoutMillis: 30_000 },
      connection: { statement_timeout: 30_000 },
    });
  });

  it('accepts supported overrides and rejects invalid or inconsistent limits', () => {
    expect(
      readDatabaseRuntimeLimits({
        DB_POOL_MIN: '2',
        DB_POOL_MAX: '16',
        DB_ACQUIRE_TIMEOUT_MS: '15000',
        DB_STATEMENT_TIMEOUT_MS: '90000',
      })
    ).toEqual({
      poolMin: 2,
      poolMax: 16,
      acquireTimeoutMs: 15_000,
      statementTimeoutMs: 90_000,
    });
    expect(() => readDatabaseRuntimeLimits({ DB_POOL_MIN: '4', DB_POOL_MAX: '3' })).toThrow(
      'DB_POOL_MIN must not exceed DB_POOL_MAX'
    );
    expect(() => readDatabaseRuntimeLimits({ DB_POOL_MAX: '0' })).toThrow(
      'DB_POOL_MAX must be an integer between 1 and 100'
    );
    expect(() => readDatabaseRuntimeLimits({ DB_STATEMENT_TIMEOUT_MS: '-1' })).toThrow(
      'DB_STATEMENT_TIMEOUT_MS must be an integer between 100 and 600000'
    );
  });
});
