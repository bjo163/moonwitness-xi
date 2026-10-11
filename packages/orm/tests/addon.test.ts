import knex, { type Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import { defineAddon, installAddons, seed } from '../src/addon.js';
import { defineModel, fields } from '../src/model-definition.js';
import { Registry } from '../src/registry.js';
import { manifest as documentedManifest } from '../examples/sales/manifest.js';

const Parent = defineModel('test.parent', {
  table: 'test_parents',
  fields: { name: fields.string({ required: true, unique: true }) },
});
const Child = defineModel('test.child', {
  table: 'test_children',
  fields: { name: fields.string({ required: true }), parent: fields.belongsTo(Parent) },
});
const addon = (version: string, models = [Parent], data = []) =>
  defineAddon({ name: 'test', version, models, data });

describe('programmatic addon installer', () => {
  let db: Knex;
  afterEach(async () => {
    if (db) await db.destroy();
  });
  const database = () =>
    (db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    }));

  it('rejects fields that collide with inherited ORM instance members', () => {
    expect(() => defineModel('test.colliding', { fields: { update: fields.boolean() } })).toThrow(
      'Invalid or duplicate field: test.colliding.update'
    );
  });

  it('installs dependency-ordered models and idempotent referenced seed data', async () => {
    const connection = database();
    await installAddons(connection, [
      defineAddon({
        name: 'child',
        version: '1.0.0',
        depends: ['parent'],
        models: [Child],
        data: [seed(Child, 'child.one', { name: 'C', parent: { $ref: 'parent.one' } })],
      }),
      defineAddon({
        name: 'parent',
        version: '1.0.0',
        models: [Parent],
        data: [seed(Parent, 'parent.one', { name: 'P' })],
      }),
    ]);
    await installAddons(connection, [
      defineAddon({
        name: 'parent',
        version: '1.0.0',
        models: [Parent],
        data: [seed(Parent, 'parent.one', { name: 'Changed' })],
      }),
      defineAddon({
        name: 'child',
        version: '1.0.0',
        depends: ['parent'],
        models: [Child],
        data: [seed(Child, 'child.one', { name: 'C', parent: { $ref: 'parent.one' } })],
      }),
    ]);
    expect(await connection('test_parents').count({ count: '*' }).first()).toMatchObject({
      count: 1,
    });
    expect(await connection('test_parents').first('name')).toMatchObject({ name: 'P' });
    expect(await connection('test_children').first('parent_id')).toMatchObject({ parent_id: 1 });
    expect(Registry.get('test.parent')).toBe(Parent);
  });

  it('installs the documented addon example and its stable seed into a test database', async () => {
    const connection = database();
    await installAddons(connection, [
      defineAddon({ name: 'base', version: '1.0.0', models: [] }),
      documentedManifest,
    ]);
    await installAddons(connection, [
      defineAddon({ name: 'base', version: '1.0.0', models: [] }),
      documentedManifest,
    ]);
    expect(await connection('sales_order').count({ count: '*' }).first()).toMatchObject({
      count: 1,
    });
    expect(await connection('sales_order').first('name', 'state')).toMatchObject({
      name: 'Example order',
      state: 'draft',
    });
  });

  it('rejects downgrade and rolls back new schema changes', async () => {
    const connection = database();
    await installAddons(connection, [addon('2.0.0')]);
    const Later = defineModel('test.later', { fields: { name: fields.string() } });
    await expect(installAddons(connection, [addon('1.0.0', [Parent, Later])])).rejects.toThrow(
      'Addon downgrade rejected'
    );
    expect(await connection.schema.hasTable('test_laters')).toBe(false);
  });

  it('runs an explicit prior-version programmatic upgrade once and records the installed version', async () => {
    const connection = database();
    await installAddons(connection, [addon('1.0.0')]);
    await Parent.query(connection).insert({ name: 'pre-upgrade' });
    let upgradeCalls = 0;
    const upgraded = defineAddon({
      name: 'test',
      version: '1.1.0',
      models: [Parent],
      upgrade: {
        '1.0.0': async (transaction) => {
          upgradeCalls += 1;
          await transaction('test_parents').where({ name: 'pre-upgrade' }).update({
            name: 'backfilled',
          });
        },
      },
    });

    await installAddons(connection, [upgraded]);
    await installAddons(connection, [upgraded]);

    expect(upgradeCalls).toBe(1);
    expect(await connection('test_parents').first('name')).toMatchObject({ name: 'backfilled' });
    expect(await connection('_orm_addons').where({ name: 'test' }).first('version')).toMatchObject({
      version: '1.1.0',
    });
  });

  it('rejects unsafe required field additions to populated tables', async () => {
    const connection = database();
    await installAddons(connection, [addon('1.0.0')]);
    await Parent.query(connection).insert({ name: 'existing' });
    const Extended = defineModel('test.parent', {
      table: 'test_parents',
      fields: {
        name: fields.string({ required: true, unique: true }),
        code: fields.string({ required: true }),
      },
    });
    await expect(installAddons(connection, [addon('1.1.0', [Extended])])).rejects.toThrow(
      'backfill explicitly first'
    );
    expect(await connection.schema.hasColumn('test_parents', 'code')).toBe(false);
  });

  it('rejects invalid manifests, dependencies, relations, seeds and constraints', async () => {
    expect(() => defineAddon({ name: 'bad', version: 'v1', models: [Parent] })).toThrow(
      'semantic version'
    );
    expect(() =>
      defineAddon({
        name: 'bad',
        version: '1.0.0',
        models: [Parent],
        menus: [{ model: 'missing', group: 'x' }],
      })
    ).toThrow('not in addon');
    await expect(
      installAddons(database(), [
        defineAddon({ name: 'one', version: '1.0.0', depends: ['missing'], models: [Parent] }),
      ])
    ).rejects.toThrow('Missing dependency');
  });
});
