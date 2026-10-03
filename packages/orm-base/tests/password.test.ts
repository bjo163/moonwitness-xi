import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { defineAddon, defineModel, installAddons, verifyPassword } from '@moonwitness/orm';
import { manifest, User, Partner, initializeSuperadminPassword } from '../src/index.js';

describe('passwords', () => {
  let db: Knex;
  beforeEach(() => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
  });
  afterEach(async () => {
    await db.destroy();
  });

  it('initializes a salted hash and preserves changed credentials on restart', async () => {
    await installAddons(db, [manifest]);
    await initializeSuperadminPassword(undefined);
    const unset = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
    expect(unset.password).toBeNull();
    await initializeSuperadminPassword('initial-test-password');
    const initial = await User.query().findById(unset.id).throwIfNotFound();
    expect(initial.password).not.toBe('initial-test-password');
    expect(await verifyPassword('initial-test-password', initial.password)).toBe(true);
    expect(await verifyPassword('wrong', initial.password)).toBe(false);
    expect(initial.toJSON()).not.toHaveProperty('password');
    expect((await User.query().findOne({ login: 'system' }))?.password).toBeNull();

    await User.query()
      .findById(initial.id)
      .patch({ login: 'owner', password: 'changed-test-password' });
    await installAddons(db, [manifest]);
    await initializeSuperadminPassword('replacement-env-password');
    const changed = await User.query().findById(initial.id).throwIfNotFound();
    expect(await verifyPassword('changed-test-password', changed.password)).toBe(true);
    expect(await verifyPassword('replacement-env-password', changed.password)).toBe(false);
  }, 15000);

  it('adds the field to previously installed users and initializes by external ID', async () => {
    const { password: _password, ...oldFields } = User.fields;
    const LegacyUser = defineModel('base.user', { table: 'users', fields: oldFields });
    await installAddons(db, [
      defineAddon({
        ...manifest,
        models: [Partner, LegacyUser],
        data: manifest.data?.map((record) => ({
          ...record,
          model: record.model === User ? LegacyUser : record.model,
        })),
      }),
    ]);
    expect(await db.schema.hasColumn('users', 'password')).toBe(false);
    await db('users').where({ login: 'superadmin' }).update({ login: 'owner' });
    await installAddons(db, [manifest]);
    await initializeSuperadminPassword('upgrade-test-password');
    const user = await User.query().findOne({ login: 'owner' }).throwIfNotFound();
    expect(await verifyPassword('upgrade-test-password', user.password)).toBe(true);
    await expect(User.search_read([], { fields: ['password as login'] })).rejects.toThrow(
      'private field'
    );
    await expect(User.search_read([], { fields: ['password'] })).rejects.toThrow('private field');
    expect(await User.search_read()).toEqual(
      expect.arrayContaining([expect.objectContaining({ login: 'owner' })])
    );
    expect(JSON.stringify(await User.search_read())).not.toContain('scrypt$');
  }, 15000);
});
