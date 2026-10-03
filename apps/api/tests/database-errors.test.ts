import { describe, expect, it } from 'vitest';
import { databaseErrorCode, databaseErrorContext } from '../src/database/errors.js';

describe('database error diagnostics', () => {
  it('keeps SQLSTATE and safe identifiers while excluding SQL and parameter details', () => {
    const error = {
      code: '42803',
      column: 'users.login',
      table: 'users',
      message: 'private input must not be logged',
      detail: 'password=private-input',
      hint: 'private hint',
      sql: 'select private-input',
      bindings: ['private-input'],
    };

    expect(databaseErrorCode(error)).toBe('42803');
    const context = databaseErrorContext(error);
    expect(context).toEqual({
      code: '42803',
      category: 'grouping_error',
      table: 'users',
      column: 'users.login',
    });
    expect(JSON.stringify(context)).not.toContain('private-input');
  });

  it('unwraps native driver errors and recognizes safe unique constraints', () => {
    const error = {
      code: 'DATABASE_ERROR',
      nativeError: {
        code: '23505',
        constraint: 'users_login_unique',
        detail: 'Key contains private-value',
      },
    };

    expect(databaseErrorCode(error)).toBe('23505');
    expect(databaseErrorContext(error)).toEqual({
      code: '23505',
      category: 'unique_violation',
      constraint: 'users_login_unique',
    });
  });
});
