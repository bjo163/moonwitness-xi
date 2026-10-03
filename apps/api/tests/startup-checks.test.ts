import { afterEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { initializeSuperadminPassword, manifest } from '@moonwitness/orm-base';
import { manifest as authManifest } from '@moonwitness/auth';
import { verifyDefaultBaseAccounts, verifyRequiredModels } from '../src/startup-checks.js';
import { validateJwtSecret } from '../src/plugins/auth.plugin.js';

describe('startup checks', () => {
  let db: Knex | undefined;

  afterEach(async () => {
    if (db) await db.destroy();
    db = undefined;
  });

  it('verifies addon models, seeded user identities and configured admin access', async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await installAddons(db, [manifest, authManifest]);
    await initializeSuperadminPassword('startup-check-password');

    verifyRequiredModels(['base.user', 'base.partner', 'base.company']);
    await expect(verifyDefaultBaseAccounts(db, true)).resolves.toBeUndefined();
  });

  it('fails early with actionable errors for missing required models and credentials', async () => {
    expect(() => validateJwtSecret(undefined)).toThrow('JWT_SECRET is required');
    expect(() => validateJwtSecret('too-short')).toThrow('at least 32 characters');
    expect(validateJwtSecret('startup-test-jwt-secret-at-least-32-chars')).toBe(
      'startup-test-jwt-secret-at-least-32-chars'
    );
    expect(() => verifyRequiredModels(['base.user'])).toThrow(
      'Required base addon models are missing: base.partner, base.company'
    );

    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await installAddons(db, [manifest, authManifest]);
    await expect(verifyDefaultBaseAccounts(db, true)).rejects.toThrow(
      'The seeded superadmin has no password'
    );
  });
});
