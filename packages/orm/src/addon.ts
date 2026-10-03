import type { Knex } from 'knex';
import { Registry } from './registry.js';
import type { BaseModel } from './base.model.js';
import { columnName, type DefinedModel, type Field, type FieldMap } from './model-definition.js';

type AddonModel = typeof BaseModel & { readonly fields: FieldMap };
export interface SeedReference {
  readonly $ref: string;
}
export const ref = (id: string): SeedReference => ({ $ref: id });
type SeedValue = string | number | boolean | null | SeedReference;
type Value<F> = F extends { kind: 'belongsTo' }
  ? SeedReference
  : F extends Field<infer V>
    ? V
    : never;
type SeedValues<F extends FieldMap> = {
  [
    K in keyof F as F[K] extends { required: true }
      ? F[K] extends { default: unknown }
        ? never
        : K
      : never
  ]: Value<F[K]>;
} & {
  [
    K in keyof F as F[K] extends { required: true }
      ? F[K] extends { default: unknown }
        ? K
        : never
      : K
  ]?: Value<F[K]> | null;
};

export interface SeedRecord {
  readonly id: string;
  readonly model: AddonModel;
  readonly values: Readonly<Record<string, SeedValue>>;
}

export function seed<const F extends FieldMap>(
  model: DefinedModel<F>,
  id: string,
  values: SeedValues<NoInfer<F>>
): SeedRecord {
  return { id, model, values };
}

export interface Addon {
  readonly name: string;
  readonly version: string;
  readonly depends?: readonly string[];
  readonly models: readonly AddonModel[];
  readonly data?: readonly SeedRecord[];
}
export function defineAddon(addon: Addon): Readonly<Addon> {
  return Object.freeze(addon);
}

function sort<T>(
  items: readonly T[],
  key: (item: T) => string,
  dependencies: (item: T) => readonly string[]
): T[] {
  const lookup = new Map(items.map((item) => [key(item), item]));
  if (lookup.size !== items.length) throw new Error('Duplicate addon or model name');
  const visiting = new Set<string>();
  const done = new Set<string>();
  const sorted: T[] = [];
  function visit(name: string) {
    if (done.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular dependency: ${name}`);
    const item = lookup.get(name);
    if (!item) throw new Error(`Missing dependency: ${name}`);
    visiting.add(name);
    for (const dependency of dependencies(item)) visit(dependency);
    visiting.delete(name);
    done.add(name);
    sorted.push(item);
  }
  for (const item of items) visit(key(item));
  return sorted;
}

function addField(table: Knex.CreateTableBuilder, name: string, field: Field) {
  const column = columnName(name, field);
  const builder =
    field.kind === 'integer' || field.kind === 'belongsTo'
      ? table.integer(column)
      : field.kind === 'boolean'
        ? table.boolean(column)
        : table.string(column, 255);
  if (field.required || field.default !== undefined) builder.notNullable();
  else builder.nullable();
  if (field.default !== undefined) builder.defaultTo(field.default);
  if (field.unique) builder.unique();
  if (field.values) builder.checkIn([...field.values]);
  if (field.target) builder.references('id').inTable(field.target.tableName).onDelete('RESTRICT');
}

async function syncModel(db: Knex.Transaction, model: AddonModel) {
  const entries = Object.entries(model.fields);
  if (!(await db.schema.hasTable(model.tableName))) {
    await db.schema.createTable(model.tableName, (table) => {
      table.increments('id').primary();
      table.boolean('active').notNullable().defaultTo(true);
      table.timestamp('create_date').notNullable().defaultTo(db.fn.now());
      table.timestamp('write_date').notNullable().defaultTo(db.fn.now());
      table.integer('create_uid').nullable();
      table.integer('write_uid').nullable();
      for (const [name, field] of entries) addField(table, name, field);
    });
    return;
  }
  for (const [name, field] of entries) {
    if (await db.schema.hasColumn(model.tableName, columnName(name, field))) continue;
    const populated: unknown = await db(model.tableName).first('id');
    if (
      populated &&
      ((field.required && field.default === undefined) ||
        field.unique ||
        field.kind === 'belongsTo')
    ) {
      throw new Error(
        `Cannot safely add ${model.modelName}.${name} to an existing populated table; backfill explicitly first`
      );
    }
    await db.schema.alterTable(model.tableName, (table) => addField(table, name, field));
  }
}

interface ExternalRecord {
  id: string;
  model: string;
  record_id: number;
}
interface Identity {
  id: number;
}

async function installData(db: Knex.Transaction, data: readonly SeedRecord[]) {
  if (!(await db.schema.hasTable('_orm_data'))) {
    await db.schema.createTable('_orm_data', (table) => {
      table.string('id').primary();
      table.string('model').notNullable();
      table.integer('record_id').notNullable();
      table.unique(['model', 'record_id']);
    });
  }
  const pending = new Map(data.map((record) => [record.id, record]));
  if (pending.size !== data.length) throw new Error('Duplicate external data ID');
  const resolving = new Set<string>();
  async function ensure(id: string): Promise<ExternalRecord> {
    const known = await db<ExternalRecord>('_orm_data').where({ id }).first();
    const record = pending.get(id);
    if (known) {
      if (record && known.model !== record.model.modelName)
        throw new Error(`Data ID ${id} changed model`);
      if (
        record &&
        !(await db<Identity>(record.model.tableName).where({ id: known.record_id }).first())
      ) {
        throw new Error(`Seed record ${id} was deleted; restore it explicitly`);
      }
      return known;
    }
    if (!record) throw new Error(`Unknown data reference: ${id}`);
    if (resolving.has(id)) throw new Error(`Circular data reference: ${id}`);
    resolving.add(id);
    const values: Record<string, string | number | boolean | null> = {};
    for (const [name, value] of Object.entries(record.values)) {
      const field = record.model.fields[name];
      if (!field) throw new Error(`Unknown seed field: ${record.model.modelName}.${name}`);
      if (typeof value === 'object' && value !== null) {
        const linked = await ensure(value.$ref);
        if (field.target?.modelName !== linked.model)
          throw new Error(`Invalid relation for ${id}.${name}`);
        values[columnName(name, field)] = linked.record_id;
      } else values[columnName(name, field)] = value;
    }
    // Adopt existing default records once, then track only immutable external IDs.
    let existing: Identity | undefined;
    for (const [name, field] of Object.entries(record.model.fields)) {
      const value = values[columnName(name, field)];
      if (!field.unique || value === undefined || value === null || field.kind === 'belongsTo')
        continue;
      const match = await db<Identity>(record.model.tableName)
        .where(columnName(name, field), value)
        .first('id');
      if (existing && match && existing.id !== match.id)
        throw new Error(`Conflicting seed identity: ${id}`);
      existing = match ?? existing;
    }
    const created = existing ?? (await record.model.query(db).insertAndFetch(values));
    const identity = { id, model: record.model.modelName, record_id: created.id };
    await db<ExternalRecord>('_orm_data').insert(identity);
    resolving.delete(id);
    return identity;
  }
  for (const record of data) await ensure(record.id);
}

/** Install an ordered set of addons atomically; restart preserves user-edited seed values. */
export async function installAddons(db: Knex, addons: readonly Addon[]): Promise<void> {
  const ordered = sort(
    addons,
    (addon) => addon.name,
    (addon) => addon.depends ?? []
  );
  const models = sort(
    ordered.flatMap((addon) => [...addon.models]),
    (model) => model.modelName,
    (model) =>
      Object.values(model.fields).flatMap((field) => (field.target ? [field.target.modelName] : []))
  );
  if (new Set(models.map((model) => model.tableName)).size !== models.length)
    throw new Error('Duplicate addon table');
  const data = ordered.flatMap((addon) => [...(addon.data ?? [])]);
  for (const record of data) {
    if (!models.includes(record.model))
      throw new Error(`Seed model not installed: ${record.model.modelName}`);
  }
  await db.transaction(async (trx) => {
    for (const model of models) await syncModel(trx, model);
    await installData(trx, data);
  });
  for (const model of models) {
    model.knex(db);
    Registry.register(model);
  }
}
