import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { defineAddon, defineModel, fields, installAddons, ref, seed } from '@moonwitness/orm';
import { manifest, Partner, User } from '../src/index.js';

describe('declarative addons', () => {
  let db: Knex;
  beforeEach(() => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      pool: {
        afterCreate(
          connection: { pragma(sql: string): unknown },
          done: (error: Error | null, connection: unknown) => void
        ) {
          connection.pragma('foreign_keys = ON');
          done(null, connection);
        },
      },
    });
  });
  afterEach(async () => {
    await db.destroy();
  });

  it('infers schema and relations and seeds exactly 2 users plus 10 partners', async () => {
    await installAddons(db, [manifest]);
    await installAddons(db, [manifest]);
    expect(await db('users').count({ count: '*' }).first()).toMatchObject({ count: 2 });
    expect(await db('partners').count({ count: '*' }).first()).toMatchObject({ count: 10 });
    expect(await db.schema.hasColumn('users', 'name')).toBe(false);
    expect(await db.schema.hasColumn('users', 'email')).toBe(false);
    const admin = await User.query().findOne({ login: 'superadmin' }).withGraphFetched('partner');
    expect(admin?.role).toBe('superadmin');
    expect(admin?.partner?.name).toBe('Super Administrator');
    expect(admin?.active).toBe(true);
  });

  it('keeps seed identities and edits after email and login change', async () => {
    await installAddons(db, [manifest]);
    const admin = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
    await User.query().findById(admin.id).patch({ login: 'owner' });
    await Partner.query().findById(admin.partner_id).patch({ email: 'owner@example.test' });
    await installAddons(db, [manifest]);
    expect(await db('users').count({ count: '*' }).first()).toMatchObject({ count: 2 });
    expect(await db('partners').count({ count: '*' }).first()).toMatchObject({ count: 10 });
    expect((await User.query().findById(admin.id))?.login).toBe('owner');
    expect((await Partner.query().findById(admin.partner_id))?.email).toBe('owner@example.test');
  });

  it('generates input validation, defaults, uniqueness and foreign keys', async () => {
    await installAddons(db, [manifest]);
    await expect(
      // @ts-expect-error deliberate invalid runtime input must also be rejected by validation
      User.query().insert({ login: 'bad', partner_id: 1, role: 'root' })
    ).rejects.toThrow();
    await expect(Partner.query().insert({ name: '' })).rejects.toThrow();
    await expect(User.query().insert({ login: 'orphan', partner_id: 9999 })).rejects.toThrow();
    const partner = await Partner.query().insertAndFetch({ name: 'New Person' });
    const user = await User.query().insertAndFetch({ login: 'new', partner_id: partner.id });
    expect(user.role).toBe('user');
    await expect(User.query().insert({ login: 'new', partner_id: 3 })).rejects.toThrow();
  });

  it('adds optional columns without dropping existing records', async () => {
    await installAddons(db, [manifest]);
    const ExtendedPartner = defineModel('base.partner', {
      table: 'partners',
      fields: { ...Partner.fields, website: fields.string() },
    });
    await installAddons(db, [
      defineAddon({ name: 'base', version: '1.1.0', models: [ExtendedPartner] }),
    ]);
    expect(await db.schema.hasColumn('partners', 'website')).toBe(true);
    expect(await db('partners').count({ count: '*' }).first()).toMatchObject({ count: 10 });
    const UnsafePartner = defineModel('base.partner', {
      table: 'partners',
      fields: { ...Partner.fields, secret: fields.string({ required: true }) },
    });
    await expect(
      installAddons(db, [defineAddon({ name: 'base', version: '2.0.0', models: [UnsafePartner] })])
    ).rejects.toThrow('Cannot safely add');
    expect(await db.schema.hasColumn('partners', 'secret')).toBe(false);
  });

  it('orders dependencies and seed references independently of declaration order', async () => {
    await installAddons(db, [
      defineAddon({
        ...manifest,
        models: [User, Partner],
        data: [...(manifest.data ?? [])].reverse(),
      }),
    ]);
    expect(await User.query().resultSize()).toBe(2);
    await expect(
      installAddons(db, [
        defineAddon({ name: 'missing', version: '1', depends: ['unknown'], models: [] }),
      ])
    ).rejects.toThrow('Missing dependency');
  });

  it('rolls back schema and data if an external reference is missing', async () => {
    const broken = defineAddon({
      ...manifest,
      data: [seed(User, 'broken.user', { login: 'broken', partner: ref('missing.profile') })],
    });
    await expect(installAddons(db, [broken])).rejects.toThrow('Unknown data reference');
    expect(await db.schema.hasTable('users')).toBe(false);
    expect(await db.schema.hasTable('partners')).toBe(false);
  });
});
