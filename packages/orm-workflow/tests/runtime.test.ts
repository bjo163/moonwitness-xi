import { Model } from 'objection';
import knex, { type Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import { manifest } from '../src/manifest.js';
import {
  expireDueWorkflows,
  listAvailableWorkflowDefinitions,
  startWorkflow,
  transitionWorkflow,
  WorkflowError,
} from '../src/runtime.js';
import { WorkflowEvent, WorkflowInstance } from '../src/models.js';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest } from '@moonwitness/jobs';
import { manifest as notificationManifest } from '@moonwitness/orm-notification';

let db: Knex | undefined;

async function setup(): Promise<Knex> {
  db = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  Model.knex(db);
  await installAddons(db, [baseManifest, jobsManifest, notificationManifest, manifest]);
  return db;
}

afterEach(async () => {
  if (db) await db.destroy();
  db = undefined;
});

async function actors(database: Knex) {
  const system = await database('users').where({ login: 'system' }).first('id');
  const admin = await database('users').where({ login: 'superadmin' }).first('id');
  const company = await database('companies').first('id');
  const partner = await database('partners').first('id');
  if (!system || !admin || !company || !partner) throw new Error('Base addon fixtures are missing');
  return {
    systemId: Number(system.id),
    adminId: Number(admin.id),
    companyId: Number(company.id),
    resourceId: Number(partner.id),
  };
}

describe('workflow addon', () => {
  it('seeds versioned example definition, access, menus, and views programmatically', async () => {
    const database = await setup();
    expect(await database('workflow_definitions').count({ count: '*' }).first()).toMatchObject({
      count: 1,
    });
    expect(await database('workflow_events').count({ count: '*' }).first()).toMatchObject({
      count: 0,
    });
    expect(
      await database('model_access')
        .where({ model_name: 'workflow.instance' })
        .count({ count: '*' })
        .first()
    ).toMatchObject({ count: 1 });
    expect(
      await database('_orm_addons').where({ name: 'workflow', version: '1.0.0' }).first()
    ).toBeDefined();
    await installAddons(database, [baseManifest, jobsManifest, notificationManifest, manifest]);
    expect(await database('workflow_definitions').count({ count: '*' }).first()).toMatchObject({
      count: 1,
    });
  });

  it('exposes reviewer workflows while distinguishing definitions the reviewer cannot start', async () => {
    const database = await setup();
    const definition = await database('workflow_definitions')
      .where({ code: 'sample.request_approval' })
      .first();
    if (!definition) throw new Error('Example workflow definition is missing');
    const config = JSON.parse(String(definition.config)) as Record<string, unknown>;
    await database('workflow_definitions')
      .where({ id: definition.id })
      .update({ config: JSON.stringify({ ...config, startRoles: ['system'] }) });

    await expect(
      listAvailableWorkflowDefinitions(database, 'base.partner', 'user')
    ).resolves.toMatchObject([{ code: 'sample.request_approval', canStart: false }]);
  });

  it('enforces submitter separation, optimistic revision, approval quorum, snapshots, and idempotent retries', async () => {
    const database = await setup();
    const { systemId, adminId, companyId, resourceId } = await actors(database);
    const reviewerPartner = await database('partners')
      .insert({ name: 'Workflow reviewer' })
      .returning('id');
    const reviewerPartnerId = Number(
      typeof reviewerPartner[0] === 'object' ? reviewerPartner[0].id : reviewerPartner[0]
    );
    const reviewerUser = await database('users')
      .insert({ login: 'workflow-reviewer', partner_id: reviewerPartnerId, role: 'user' })
      .returning('id');
    const reviewerId = Number(
      typeof reviewerUser[0] === 'object' ? reviewerUser[0].id : reviewerUser[0]
    );
    const definition = await database('workflow_definitions')
      .where({ code: 'sample.request_approval' })
      .first();
    if (!definition) throw new Error('Example workflow definition is missing');
    const config = JSON.parse(String(definition.config)) as Record<string, unknown>;
    const transitions = config.transitions;
    if (!Array.isArray(transitions)) throw new Error('Example transitions are missing');
    const revisedTransitions = transitions.map((item) => {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('action' in item) ||
        item.action !== 'approve'
      )
        return item;
      return { ...item, requiredApprovals: 2 };
    });
    await database('workflow_definitions')
      .where({ id: definition.id })
      .update({ config: JSON.stringify({ ...config, transitions: revisedTransitions }) });

    const now = new Date('2026-10-05T00:00:00.000Z');
    const started = await startWorkflow(database, {
      code: 'sample.request_approval',
      companyId,
      actorId: adminId,
      role: 'superadmin',
      resourceModel: 'base.partner',
      resourceId,
      idempotencyKey: 'start-request-0001',
      now,
    });
    expect(started).toMatchObject({ currentState: 'draft', revision: 0, status: 'active' });
    expect(
      await startWorkflow(database, {
        code: 'sample.request_approval',
        companyId,
        actorId: adminId,
        role: 'superadmin',
        resourceModel: 'base.partner',
        resourceId,
        idempotencyKey: 'start-request-0001',
        now,
      })
    ).toMatchObject({ id: started.id, revision: 0 });

    const submitted = await transitionWorkflow(database, {
      instanceId: started.id,
      companyId,
      actorId: adminId,
      role: 'superadmin',
      action: 'submit',
      expectedRevision: 0,
      idempotencyKey: 'submit-request-0001',
      now,
    });
    expect(submitted).toMatchObject({ currentState: 'submitted', revision: 1, status: 'active' });
    await expect(
      transitionWorkflow(database, {
        instanceId: started.id,
        companyId,
        actorId: adminId,
        role: 'superadmin',
        action: 'approve',
        expectedRevision: 1,
        idempotencyKey: 'self-approval-0001',
        now,
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      transitionWorkflow(database, {
        instanceId: started.id,
        companyId,
        actorId: systemId,
        role: 'system',
        action: 'approve',
        expectedRevision: 0,
        idempotencyKey: 'stale-approval-0001',
        now,
      })
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });

    await database('workflow_definitions')
      .where({ id: definition.id })
      .update({ config: JSON.stringify({ ...config, transitions }) });
    const firstVote = await transitionWorkflow(database, {
      instanceId: started.id,
      companyId,
      actorId: systemId,
      role: 'system',
      action: 'approve',
      expectedRevision: 1,
      idempotencyKey: 'approve-vote-0001',
      now,
    });
    expect(firstVote).toMatchObject({ currentState: 'submitted', revision: 2, status: 'active' });
    await expect(
      transitionWorkflow(database, {
        instanceId: started.id,
        companyId,
        actorId: systemId,
        role: 'system',
        action: 'approve',
        expectedRevision: 2,
        idempotencyKey: 'duplicate-vote-0001',
        now,
      })
    ).rejects.toMatchObject({ code: 'DUPLICATE_APPROVAL' });
    const completed = await transitionWorkflow(database, {
      instanceId: started.id,
      companyId,
      actorId: reviewerId,
      role: 'user',
      action: 'approve',
      expectedRevision: 2,
      idempotencyKey: 'approve-vote-0002',
      now,
    });
    expect(completed).toMatchObject({ currentState: 'approved', revision: 3, status: 'completed' });
    expect(
      await transitionWorkflow(database, {
        instanceId: started.id,
        companyId,
        actorId: reviewerId,
        role: 'user',
        action: 'approve',
        expectedRevision: 2,
        idempotencyKey: 'approve-vote-0002',
        now,
      })
    ).toMatchObject({ revision: 3, status: 'completed' });
    expect(
      await database('workflow_events')
        .where({ instance_id: started.id })
        .count({ count: '*' })
        .first()
    ).toMatchObject({ count: 4 });
    expect(
      await database('workflow_approvals')
        .where({ instance_id: started.id })
        .count({ count: '*' })
        .first()
    ).toMatchObject({ count: 2 });
    const stored = await WorkflowInstance.query().findById(started.id);
    expect(stored?.definition_version).toBe(1);
  });

  it('isolates companies, records rejections, and expires overdue requests once', async () => {
    const database = await setup();
    const { systemId, adminId, companyId, resourceId } = await actors(database);
    const otherCompany = await database('companies')
      .insert({ name: 'Workflow Example Company' })
      .returning('id');
    const otherCompanyId = Number(
      typeof otherCompany[0] === 'object' ? otherCompany[0].id : otherCompany[0]
    );
    const now = new Date('2026-10-05T00:00:00.000Z');
    const rejected = await startWorkflow(database, {
      code: 'sample.request_approval',
      companyId,
      actorId: systemId,
      role: 'system',
      resourceModel: 'base.partner',
      resourceId,
      idempotencyKey: 'reject-start-0001',
      now,
    });
    await expect(
      transitionWorkflow(database, {
        instanceId: rejected.id,
        companyId: otherCompanyId,
        actorId: adminId,
        role: 'superadmin',
        action: 'submit',
        expectedRevision: 0,
        idempotencyKey: 'cross-company-0001',
        now,
      })
    ).rejects.toMatchObject({ code: 'INSTANCE_NOT_FOUND' });
    await transitionWorkflow(database, {
      instanceId: rejected.id,
      companyId,
      actorId: adminId,
      role: 'superadmin',
      action: 'submit',
      expectedRevision: 0,
      idempotencyKey: 'reject-submit-0001',
      now,
    });
    const decision = await transitionWorkflow(database, {
      instanceId: rejected.id,
      companyId,
      actorId: adminId,
      role: 'superadmin',
      action: 'reject',
      expectedRevision: 1,
      idempotencyKey: 'reject-decision-0001',
      comment: 'Example rejection',
      now,
    });
    expect(decision).toMatchObject({ status: 'rejected', currentState: 'rejected' });
    expect(
      await database('workflow_approvals')
        .where({ instance_id: rejected.id, decision: 'rejected' })
        .count({ count: '*' })
        .first()
    ).toMatchObject({ count: 1 });

    const overdue = await startWorkflow(database, {
      code: 'sample.request_approval',
      companyId,
      actorId: systemId,
      role: 'system',
      resourceModel: 'base.partner',
      resourceId,
      idempotencyKey: 'timeout-start-0001',
      now: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
    });
    expect(await expireDueWorkflows(database, now)).toBe(1);
    expect(await expireDueWorkflows(database, now)).toBe(0);
    expect(await WorkflowInstance.query().findById(overdue.id)).toMatchObject({
      status: 'timed_out',
      revision: 1,
    });
    const timeoutEvents = await WorkflowEvent.query().where({
      instance_id: overdue.id,
      action: 'timeout',
    });
    expect(timeoutEvents).toHaveLength(1);
  });

  it('rejects malformed definitions and unauthorized resource models', async () => {
    const database = await setup();
    const { adminId, companyId, resourceId } = await actors(database);
    await expect(
      startWorkflow(database, {
        code: 'missing.workflow',
        companyId,
        actorId: adminId,
        role: 'superadmin',
        resourceModel: 'base.partner',
        resourceId,
        idempotencyKey: 'missing-definition-1',
      })
    ).rejects.toBeInstanceOf(WorkflowError);
    await expect(
      startWorkflow(database, {
        code: 'sample.request_approval',
        companyId,
        actorId: adminId,
        role: 'superadmin',
        resourceModel: 'base.user',
        resourceId,
        idempotencyKey: 'forbidden-resource-1',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
