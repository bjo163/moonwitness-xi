import { describe, expect, it } from 'vitest';
import { confirmsDatabaseTarget, parseOptions } from '../src/commands/revoke-auth-sessions.js';

describe('revoke auth sessions command options', () => {
  it('defaults to a read-only plan', () => {
    expect(parseOptions([])).toEqual({
      apply: false,
      confirmAll: false,
      confirmedHost: undefined,
      confirmedPort: undefined,
      confirmedDatabase: undefined,
    });
  });

  it('requires explicit all-session and target-database confirmation to apply', () => {
    expect(
      parseOptions([
        '--apply',
        '--all',
        '--confirm-host=localhost',
        '--confirm-port=55432',
        '--confirm-database=moonwitness',
      ])
    ).toEqual({
      apply: true,
      confirmAll: true,
      confirmedHost: 'localhost',
      confirmedPort: 55432,
      confirmedDatabase: 'moonwitness',
    });
    expect(() => parseOptions(['--apply'])).toThrow('exact --confirm-host');
    expect(() => parseOptions(['--apply', '--all'])).toThrow('exact --confirm-host');
    expect(() => parseOptions(['--all'])).toThrow('only valid together with --apply');
  });

  it('rejects unknown, duplicate, and empty target options', () => {
    expect(() => parseOptions(['--force'])).toThrow('Unknown option');
    expect(() => parseOptions(['--apply', '--apply', '--all'])).toThrow(
      '--apply must be specified once'
    );
    expect(() => parseOptions(['--apply', '--all', '--confirm-port=65536'])).toThrow(
      '--confirm-port must be an integer'
    );
    expect(() => parseOptions(['--apply', '--all', '--confirm-database='])).toThrow(
      '--confirm-database requires a database name'
    );
  });

  it('requires the exact configured host, port, and database before applying', () => {
    const options = parseOptions([
      '--apply',
      '--all',
      '--confirm-host=database.internal',
      '--confirm-port=5432',
      '--confirm-database=moonwitness',
    ]);
    const target = { host: 'database.internal', port: 5432, database: 'moonwitness' };

    expect(confirmsDatabaseTarget(options, target)).toBe(true);
    expect(confirmsDatabaseTarget(options, { ...target, host: 'other.internal' })).toBe(false);
    expect(confirmsDatabaseTarget(options, { ...target, port: 5433 })).toBe(false);
    expect(confirmsDatabaseTarget(options, { ...target, database: 'other' })).toBe(false);
  });
});
