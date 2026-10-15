import { afterEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { Model } from 'objection';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest, dispatchOneOutboxEvent } from '@moonwitness/jobs';
import {
  manifest as notificationManifest,
  Notification,
  registerNotificationOutboxConsumer,
} from '@moonwitness/orm-notification';
import {
  manifest as workflowManifest,
  startWorkflow,
  transitionWorkflow,
} from '@moonwitness/orm-workflow';
import { manifest, PurchaseRequest } from '../src/index.js';

let db: Knex | undefined;
let unregisterConsumer: (() => void) | undefined;

async function setup(): Promise<Knex> {
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
  Model.knex(db);
  await installAddons(db, [
    manifest,
    workflowManifest,
    notificationManifest,
    jobsManifest,
    baseManifest,
  ]);
  return db;
}

afterEach(async () => {
  unregisterConsumer?.();
  unregisterConsumer = undefined;
  if (db) await db.destroy();
  db = undefined;
});

describe('purchase request example addon', () => {
  it('installs its example records, generic view, access and workflow without fake history', async () => {
    const database = await setup();
    expect(manifest.depends).toEqual(['base', 'jobs', 'notification', 'workflow']);
    expect(manifest.views?.map((view) => view.model)).toEqual([PurchaseRequest.modelName]);
    expect(PurchaseRequest.fields).not.toHaveProperty('requester');
    expect(manifest.menus?.map((menu) => menu.model)).toEqual([PurchaseRequest.modelName]);
    expect(await PurchaseRequest.query().count({ count: '*' }).first()).toMatchObject({ count: 2 });
    expect(
      await database('workflow_definitions').where({ code: 'request.purchase_approval' }).first()
    ).toBeDefined();
    expect(
      await database('notification_templates')
        .where('code', 'like', 'request.%')
        .count({ count: '*' })
        .first()
    ).toMatchObject({ count: 3 });
    expect(await database('workflow_instances').count({ count: '*' }).first()).toMatchObject({
      count: 0,
    });
    expect(await database('workflow_events').count({ count: '*' }).first()).toMatchObject({
      count: 0,
    });
    expect(await database('notifications').count({ count: '*' }).first()).toMatchObject({
      count: 0,
    });
  });

  it('uses the generic workflow and notification outbox for submit, approval, and history', async () => {
    const database = await setup();
    const requester = await database('users').where({ login: 'system' }).first('id');
    const reviewer = await database('users').where({ login: 'superadmin' }).first('id');
    const company = await database('companies').first('id');
    const request = await PurchaseRequest.query().findOne({ title: 'Laptop replacement' });
    if (!requester || !reviewer || !company || !request)
      throw new Error('Sample fixtures are missing');

    const instance = await startWorkflow(database, {
      code: 'request.purchase_approval',
      companyId: Number(company.id),
      actorId: Number(requester.id),
      role: 'system',
      resourceModel: PurchaseRequest.modelName,
      resourceId: request.id,
      idempotencyKey: 'request-start-0001',
    });
    unregisterConsumer = registerNotificationOutboxConsumer();
    await expect(
      transitionWorkflow(database, {
        instanceId: instance.id,
        companyId: Number(company.id),
        actorId: Number(requester.id),
        role: 'system',
        action: 'submit',
        expectedRevision: 0,
        idempotencyKey: 'request-submit-0001',
      })
    ).resolves.toMatchObject({ currentState: 'submitted', revision: 1 });
    await expect(
      transitionWorkflow(database, {
        instanceId: instance.id,
        companyId: Number(company.id),
        actorId: Number(requester.id),
        role: 'system',
        action: 'approve',
        expectedRevision: 1,
        idempotencyKey: 'request-self-approve-0001',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      transitionWorkflow(database, {
        instanceId: instance.id,
        companyId: Number(company.id),
        actorId: Number(reviewer.id),
        role: 'superadmin',
        action: 'approve',
        expectedRevision: 1,
        idempotencyKey: 'request-approve-0001',
      })
    ).resolves.toMatchObject({ currentState: 'approved', status: 'completed', revision: 2 });

    await expect(dispatchOneOutboxEvent('request-example-test')).resolves.toBe(true);

    const secondRequest = await PurchaseRequest.query().findOne({ title: 'Security training' });
    if (!secondRequest) throw new Error('Second sample request is missing');
    const rejectedInstance = await startWorkflow(database, {
      code: 'request.purchase_approval',
      companyId: Number(company.id),
      actorId: Number(requester.id),
      role: 'system',
      resourceModel: PurchaseRequest.modelName,
      resourceId: secondRequest.id,
      idempotencyKey: 'request-start-0002',
    });
    await transitionWorkflow(database, {
      instanceId: rejectedInstance.id,
      companyId: Number(company.id),
      actorId: Number(requester.id),
      role: 'system',
      action: 'submit',
      expectedRevision: 0,
      idempotencyKey: 'request-submit-0002',
    });
    await expect(
      transitionWorkflow(database, {
        instanceId: rejectedInstance.id,
        companyId: Number(company.id),
        actorId: Number(reviewer.id),
        role: 'superadmin',
        action: 'reject',
        expectedRevision: 1,
        idempotencyKey: 'request-reject-0002',
        comment: "Outside this quarter's budget.",
      })
    ).resolves.toMatchObject({ currentState: 'rejected', status: 'rejected', revision: 2 });
    await expect(dispatchOneOutboxEvent('request-example-test')).resolves.toBe(true);
    await expect(dispatchOneOutboxEvent('request-example-test')).resolves.toBe(true);
    await expect(dispatchOneOutboxEvent('request-example-test')).resolves.toBe(true);
    await expect(dispatchOneOutboxEvent('request-example-test')).resolves.toBe(false);
    expect(
      await Notification.query()
        .where({ recipient_id: requester.id })
        .orderBy('title')
        .select('title', 'state', 'resource_model')
    ).toEqual([
      { title: 'Request approved', state: 'unread', resource_model: 'request.purchase' },
      { title: 'Request declined', state: 'unread', resource_model: 'request.purchase' },
      { title: 'Request submitted', state: 'unread', resource_model: 'request.purchase' },
      { title: 'Request submitted', state: 'unread', resource_model: 'request.purchase' },
    ]);
    expect(
      await database('workflow_events')
        .where({ instance_id: instance.id })
        .orderBy('sequence')
        .select('action', 'from_state', 'to_state')
    ).toEqual([
      { action: 'start', from_state: 'draft', to_state: 'draft' },
      { action: 'submit', from_state: 'draft', to_state: 'submitted' },
      { action: 'approve', from_state: 'submitted', to_state: 'approved' },
    ]);
  });
});
