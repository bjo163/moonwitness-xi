import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knex, { type Knex } from 'knex';
import { Model } from 'objection';
import type { QueryContext } from 'objection';
import { BaseModel, Registry, Environment } from '@moonwitness/orm';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

class TestItem extends BaseModel {
  static override modelName = 'test.item';
  static override tableName = 'test_items';
  static override defaultOrder = 'name asc';
  static override exposedActions = [...BaseModel.exposedActions, 'action_toggle_company'];

  name!: string;
  email?: string;
  is_company?: boolean;
  parent_id?: number | null;
  city?: string;
  state?: 'draft' | 'confirmed' | 'cancelled';

  override async $beforeInsert(context: QueryContext) {
    await super.$beforeInsert(context);
    if (this.is_company === undefined) this.is_company = false;
    if (!this.state) this.state = 'draft';
  }

  async action_toggle_company(): Promise<this> {
    return this.write({ is_company: !this.is_company });
  }

  async action_confirm(): Promise<this> {
    return this.write({ state: 'confirmed' });
  }

  async action_cancel(): Promise<this> {
    return this.write({ state: 'cancelled' });
  }

  static override jsonSchema = {
    type: 'object',
    required: ['name'],
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      email: { type: 'string' },
      is_company: { type: 'boolean' },
      active: { type: 'boolean' },
    },
  };
}

Registry.register(TestItem);

describe('Enterprise BaseModel & Fastify Integration', () => {
  let testDb: Knex;
  let app: FastifyInstance;

  beforeAll(async () => {
    testDb = knex({
      client: 'better-sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    });

    Model.knex(testDb);

    await testDb.schema.createTable('test_items', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('email');
      table.boolean('is_company').defaultTo(false);
      table.integer('parent_id').nullable();
      table.string('city');
      table.string('state').defaultTo('draft');
      table.boolean('active').defaultTo(true);
      table.timestamp('create_date').defaultTo(testDb.fn.now());
      table.timestamp('write_date').defaultTo(testDb.fn.now());
      table.integer('create_uid').nullable();
      table.integer('write_uid').nullable();
    });

    process.env.NODE_ENV = 'test';
    app = await buildApp({ db: testDb });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await testDb.destroy();
  });

  it('should register models in Registry', () => {
    expect(Registry.has('test.item')).toBe(true);
  });

  it('should create and search records with BaseModel', async () => {
    const env = new Environment({ userId: 1 });
    const Items = env.get<typeof TestItem>('test.item');

    const item = await Items.create({
      name: 'Acme Corp',
      email: 'acme@test.local',
      is_company: true,
    });

    expect(item.id).toBeDefined();
    expect(item.name).toBe('Acme Corp');
    expect(item.create_uid).toBe(1);
    expect(item.active).toBe(true);
    expect(item.create_date).toBeDefined();

    const child = await Items.create({
      name: 'John Doe',
      email: 'john@test.local',
      is_company: false,
      parent_id: item.id,
    });

    expect(child.id).toBeDefined();
    expect(child.parent_id).toBe(item.id);
  });

  it('should search with domain notation and activeTest', async () => {
    const companies = await TestItem.search([['is_company', '=', true]]);
    expect(companies.length).toBeGreaterThanOrEqual(1);
    expect(companies[0].name).toBe('Acme Corp');

    const searchRes = await TestItem.search([['name', 'like', '%John%']]);
    expect(searchRes.length).toBe(1);
    expect(searchRes[0].name).toBe('John Doe');

    const readData = await TestItem.search_read([['id', '=', companies[0].id]], {
      fields: ['name', 'email'],
    });
    expect(readData[0]).toHaveProperty('id');
    expect(readData[0]).toHaveProperty('name', 'Acme Corp');
    expect(readData[0]).toHaveProperty('email', 'acme@test.local');

    const count = await TestItem.search_count([['is_company', '=', true]]);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('should handle write and unlink (archive vs hard-delete)', async () => {
    const temp = await TestItem.create({ name: 'Temp Item' });
    expect(temp.active).toBe(true);

    await temp.write({ city: 'Jakarta' });
    expect(temp.city).toBe('Jakarta');

    // Soft delete (archive)
    await temp.unlink();
    expect(temp.active).toBe(false);

    // Filtered by active_test by default
    const activeSearch = await TestItem.search([['id', '=', temp.id]]);
    expect(activeSearch.length).toBe(0);

    // Search with activeTest = false includes inactive
    const inactiveSearch = await TestItem.search([['id', '=', temp.id]], { activeTest: false });
    expect(inactiveSearch.length).toBe(1);
    expect(inactiveSearch[0].active).toBe(false);

    // Unarchive
    await temp.action_unarchive();
    expect(temp.active).toBe(true);

    // Hard delete
    const hardDeleted = await temp.unlink(true);
    expect(hardDeleted).toBe(true);
    const notFound = await TestItem.browse(temp.id);
    expect(notFound).toBeNull();
  });

  it('should execute custom model actions', async () => {
    const record = await TestItem.create({ name: 'Action Test', state: 'draft' });
    expect(record.state).toBe('draft');

    await record.action_confirm();
    expect(record.state).toBe('confirmed');

    await record.action_cancel();
    expect(record.state).toBe('cancelled');
  });

  it('should test Fastify Generic REST API endpoints', async () => {
    const resModels = await app.inject({
      method: 'GET',
      url: '/api/models',
    });
    expect(resModels.statusCode).toBe(200);
    const bodyModels = JSON.parse(resModels.payload);
    expect(bodyModels.success).toBe(true);
    expect(bodyModels.models.some((model: { model: string }) => model.model === 'test.item')).toBe(
      true
    );

    // Create via POST
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/test.item',
      payload: {
        name: 'REST API Item',
        email: 'rest@api.local',
        is_company: true,
      },
    });
    expect(resCreate.statusCode).toBe(201);
    const createdData = JSON.parse(resCreate.payload).data;
    const itemId = createdData.id;

    // Search via GET
    const resSearch = await app.inject({
      method: 'GET',
      url: `/api/test.item?domain=${encodeURIComponent(JSON.stringify([['id', '=', itemId]]))}`,
    });
    expect(resSearch.statusCode).toBe(200);
    const searchBody = JSON.parse(resSearch.payload);
    expect(searchBody.data.length).toBe(1);
    expect(searchBody.data[0].name).toBe('REST API Item');

    // Update via PUT
    const resUpdate = await app.inject({
      method: 'PUT',
      url: `/api/test.item/${itemId}`,
      payload: { city: 'Bandung' },
    });
    expect(resUpdate.statusCode).toBe(200);
    expect(JSON.parse(resUpdate.payload).data.city).toBe('Bandung');

    // Model Action
    const resAction = await app.inject({
      method: 'POST',
      url: `/api/test.item/${itemId}/action/action_toggle_company`,
    });
    expect(resAction.statusCode).toBe(200);
    const actionResult = JSON.parse(resAction.payload);
    expect(actionResult.result.is_company).toBe(false);

    // Delete (archive)
    const resDelete = await app.inject({
      method: 'DELETE',
      url: `/api/test.item/${itemId}`,
    });
    expect(resDelete.statusCode).toBe(200);
  });

  it('should handle JSON-RPC execute_kw call', async () => {
    const rpcRes = await app.inject({
      method: 'POST',
      url: '/jsonrpc',
      payload: {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            'test.item',
            'search_read',
            [[['name', 'like', '%Acme%']]],
            { fields: ['id', 'name'], limit: 5 },
          ],
        },
        id: 42,
      },
    });

    expect(rpcRes.statusCode).toBe(200);
    const rpcBody = JSON.parse(rpcRes.payload);
    expect(rpcBody.id).toBe(42);
    expect(Array.isArray(rpcBody.result)).toBe(true);
    expect(rpcBody.result.length).toBeGreaterThan(0);
  });
});
