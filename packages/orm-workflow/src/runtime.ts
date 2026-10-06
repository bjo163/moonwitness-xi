import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { registerJobHandler } from '@moonwitness/jobs';
import { enqueueNotification } from '@moonwitness/orm-notification';
import { WorkflowApproval, WorkflowDefinition, WorkflowEvent, WorkflowInstance } from './models.js';

export type WorkflowRole = 'system' | 'superadmin' | 'user';
export interface WorkflowTransitionDefinition {
  readonly action: string;
  readonly from: string;
  readonly to: string;
  readonly roles: readonly WorkflowRole[];
  readonly requiredApprovals?: number;
  readonly requireDifferentActor?: boolean;
  /** Optional in-app notification sent to the workflow starter in the action transaction. */
  readonly notifyStarter?: string;
}

export interface WorkflowDefinitionConfig {
  readonly startState: string;
  readonly startRoles: readonly WorkflowRole[];
  readonly timeoutMinutes: number;
  readonly resourceModels: readonly string[];
  readonly transitions: readonly WorkflowTransitionDefinition[];
}

export interface AvailableWorkflowDefinition {
  readonly code: string;
  readonly name: string;
  readonly version: number;
  readonly startState: string;
  readonly canStart: boolean;
  readonly transitions: readonly WorkflowTransitionDefinition[];
}

interface DefinitionRow {
  id: number;
  code: string;
  version: number;
  config: string;
  enabled: boolean;
}

interface InstanceRow {
  id: number;
  definition_id: number;
  definition_version: number;
  definition_snapshot: string;
  company_id: number;
  resource_model: string;
  resource_id: number;
  started_by_id: number;
  current_state: string;
  status: 'active' | 'completed' | 'rejected' | 'timed_out' | 'cancelled';
  revision: number;
  due_at: string | null;
  completed_at: string | null;
}

export class WorkflowError extends Error {
  constructor(
    readonly code:
      | 'INVALID_DEFINITION'
      | 'DEFINITION_NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_TRANSITION'
      | 'STALE_REVISION'
      | 'DUPLICATE_APPROVAL'
      | 'INSTANCE_NOT_FOUND'
      | 'INSTANCE_CLOSED'
      | 'IDEMPOTENCY_CONFLICT',
    message: string
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is WorkflowRole {
  return value === 'system' || value === 'superadmin' || value === 'user';
}

function isRoleList(value: unknown): value is WorkflowRole[] {
  return Array.isArray(value) && value.every(isRole);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseConfig(raw: string): WorkflowDefinitionConfig {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new WorkflowError('INVALID_DEFINITION', 'Workflow config must be valid JSON');
  }
  if (
    !isRecord(value) ||
    typeof value.startState !== 'string' ||
    !isRoleList(value.startRoles) ||
    typeof value.timeoutMinutes !== 'number' ||
    !Number.isSafeInteger(value.timeoutMinutes) ||
    value.timeoutMinutes < 1 ||
    value.timeoutMinutes > 525600 ||
    !isStringList(value.resourceModels) ||
    !value.resourceModels.every(
      (model) => typeof model === 'string' && /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(model)
    ) ||
    !Array.isArray(value.transitions) ||
    value.transitions.length === 0
  )
    throw new WorkflowError('INVALID_DEFINITION', 'Workflow config has an invalid shape');

  const actions = new Set<string>();
  const states = new Set([value.startState]);
  const transitions: WorkflowTransitionDefinition[] = [];
  for (const item of value.transitions as unknown[]) {
    if (
      !isRecord(item) ||
      typeof item.action !== 'string' ||
      !/^[a-z][a-z0-9_.-]{0,63}$/u.test(item.action) ||
      typeof item.from !== 'string' ||
      typeof item.to !== 'string' ||
      !isRoleList(item.roles) ||
      item.roles.length === 0 ||
      (item.requiredApprovals !== undefined &&
        (!Number.isSafeInteger(item.requiredApprovals) ||
          Number(item.requiredApprovals) < 1 ||
          Number(item.requiredApprovals) > 100)) ||
      (item.requireDifferentActor !== undefined &&
        typeof item.requireDifferentActor !== 'boolean') ||
      (item.notifyStarter !== undefined &&
        (typeof item.notifyStarter !== 'string' ||
          !/^[a-z][a-z0-9_.-]{2,127}$/u.test(item.notifyStarter)))
    )
      throw new WorkflowError('INVALID_DEFINITION', 'Workflow transition has an invalid shape');
    if (actions.has(item.action))
      throw new WorkflowError('INVALID_DEFINITION', `Duplicate action '${item.action}'`);
    actions.add(item.action);
    states.add(item.from);
    states.add(item.to);
    transitions.push({
      action: item.action,
      from: item.from,
      to: item.to,
      roles: item.roles,
      ...(item.requiredApprovals === undefined
        ? {}
        : { requiredApprovals: Number(item.requiredApprovals) }),
      ...(item.requireDifferentActor === undefined
        ? {}
        : { requireDifferentActor: item.requireDifferentActor }),
      ...(item.notifyStarter === undefined ? {} : { notifyStarter: item.notifyStarter }),
    });
  }
  for (const transition of transitions) {
    if (!states.has(transition.from) || !states.has(transition.to))
      throw new WorkflowError('INVALID_DEFINITION', 'Transition references an unknown state');
  }
  return {
    startState: value.startState,
    startRoles: value.startRoles,
    timeoutMinutes: value.timeoutMinutes,
    resourceModels: value.resourceModels,
    transitions,
  };
}

function rowFrom(instance: InstanceRow) {
  return {
    id: instance.id,
    definitionId: instance.definition_id,
    definitionVersion: instance.definition_version,
    companyId: instance.company_id,
    resourceModel: instance.resource_model,
    resourceId: instance.resource_id,
    startedById: instance.started_by_id,
    currentState: instance.current_state,
    status: instance.status,
    revision: instance.revision,
    dueAt: instance.due_at,
    completedAt: instance.completed_at,
  };
}

async function insertEvent(
  trx: Knex.Transaction,
  values: {
    instanceId: number;
    sequence: number;
    actorId: number | null;
    action: string;
    fromState: string;
    toState: string;
    revision: number;
    idempotencyKey: string;
    comment: string | null;
    createdAt: string;
  }
): Promise<void> {
  await WorkflowEvent.query(trx).insert({
    instance_id: values.instanceId,
    sequence: values.sequence,
    actor_id: values.actorId,
    action: values.action,
    from_state: values.fromState,
    to_state: values.toState,
    revision: values.revision,
    idempotency_key: values.idempotencyKey,
    comment: values.comment,
    created_at: values.createdAt,
  });
}

export interface StartWorkflowInput {
  readonly code: string;
  readonly companyId: number;
  readonly actorId: number;
  readonly role: WorkflowRole;
  readonly resourceModel: string;
  readonly resourceId: number;
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export async function listAvailableWorkflowDefinitions(
  db: Knex,
  resourceModel: string,
  role: WorkflowRole
): Promise<AvailableWorkflowDefinition[]> {
  const definitions = await db<DefinitionRow>('workflow_definitions')
    .where({ enabled: true })
    .orderBy([
      { column: 'code', order: 'asc' },
      { column: 'version', order: 'desc' },
    ])
    .select('code', 'name', 'version', 'config');
  const latest = new Set<string>();
  const available: AvailableWorkflowDefinition[] = [];
  for (const definition of definitions) {
    if (latest.has(definition.code)) continue;
    latest.add(definition.code);
    const config = parseConfig(definition.config);
    const canStart = config.startRoles.includes(role);
    const canTransition = config.transitions.some((transition) => transition.roles.includes(role));
    if (!config.resourceModels.includes(resourceModel) || (!canStart && !canTransition)) continue;
    available.push({
      code: definition.code,
      name: definition.name,
      version: definition.version,
      startState: config.startState,
      canStart,
      transitions: config.transitions,
    });
  }
  return available;
}

export async function startWorkflow(db: Knex, input: StartWorkflowInput) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(input.idempotencyKey))
    throw new WorkflowError('IDEMPOTENCY_CONFLICT', 'A valid idempotency key is required');
  const now = input.now ?? new Date();
  return db.transaction(async (trx) => {
    const prior = await trx('workflow_events')
      .where({ idempotency_key: `start:${input.idempotencyKey}` })
      .first('instance_id');
    if (prior) {
      const existing = await trx<InstanceRow>('workflow_instances')
        .where({ id: prior.instance_id })
        .first();
      if (
        !existing ||
        existing.company_id !== input.companyId ||
        existing.started_by_id !== input.actorId ||
        existing.resource_model !== input.resourceModel ||
        existing.resource_id !== input.resourceId
      )
        throw new WorkflowError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key belongs to a different workflow start'
        );
      const existingDefinition = await trx<DefinitionRow>('workflow_definitions')
        .where({ id: existing.definition_id })
        .first();
      if (existingDefinition?.code !== input.code)
        throw new WorkflowError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key belongs to a different workflow definition'
        );
      return rowFrom(existing);
    }
    const definition = await trx<DefinitionRow>('workflow_definitions')
      .where({ code: input.code, enabled: true })
      .orderBy('version', 'desc')
      .first();
    if (!definition)
      throw new WorkflowError('DEFINITION_NOT_FOUND', 'Workflow definition not found');
    const config = parseConfig(definition.config);
    if (!config.startRoles.includes(input.role))
      throw new WorkflowError('FORBIDDEN', 'Role cannot start this workflow');
    if (!config.resourceModels.includes(input.resourceModel))
      throw new WorkflowError('FORBIDDEN', 'Resource model is not allowed by this workflow');
    const dueAt = new Date(now.getTime() + config.timeoutMinutes * 60_000).toISOString();
    const created = await WorkflowInstance.query(trx).insertAndFetch({
      definition_id: definition.id,
      definition_version: definition.version,
      definition_snapshot: JSON.stringify(config),
      company_id: input.companyId,
      resource_model: input.resourceModel,
      resource_id: input.resourceId,
      started_by_id: input.actorId,
      current_state: config.startState,
      status: 'active',
      revision: 0,
      due_at: dueAt,
    });
    await insertEvent(trx, {
      instanceId: created.id,
      sequence: 0,
      actorId: input.actorId,
      action: 'start',
      fromState: config.startState,
      toState: config.startState,
      revision: 0,
      idempotencyKey: `start:${input.idempotencyKey}`,
      comment: null,
      createdAt: now.toISOString(),
    });
    return rowFrom(created as unknown as InstanceRow);
  });
}

export interface TransitionWorkflowInput {
  readonly instanceId: number;
  readonly companyId: number;
  readonly actorId: number;
  readonly role: WorkflowRole;
  readonly action: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly comment?: string;
  readonly now?: Date;
}

export async function transitionWorkflow(db: Knex, input: TransitionWorkflowInput) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(input.idempotencyKey))
    throw new WorkflowError('IDEMPOTENCY_CONFLICT', 'A valid idempotency key is required');
  const now = input.now ?? new Date();
  return db.transaction(async (trx) => {
    const prior = await trx('workflow_events')
      .where({ idempotency_key: input.idempotencyKey })
      .first('instance_id', 'actor_id', 'action');
    if (prior) {
      if (
        prior.instance_id !== input.instanceId ||
        prior.actor_id !== input.actorId ||
        prior.action !== input.action
      )
        throw new WorkflowError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key belongs to a different workflow action'
        );
      const existing = await trx<InstanceRow>('workflow_instances')
        .where({ id: prior.instance_id, company_id: input.companyId })
        .first();
      if (!existing)
        throw new WorkflowError('IDEMPOTENCY_CONFLICT', 'Event has no matching instance');
      return rowFrom(existing);
    }
    const instance = await trx<InstanceRow>('workflow_instances')
      .where({ id: input.instanceId, company_id: input.companyId })
      .forUpdate()
      .first();
    if (!instance) throw new WorkflowError('INSTANCE_NOT_FOUND', 'Workflow instance not found');
    if (instance.status !== 'active')
      throw new WorkflowError('INSTANCE_CLOSED', 'Workflow is closed');
    if (instance.revision !== input.expectedRevision)
      throw new WorkflowError('STALE_REVISION', 'Workflow changed; reload before retrying');
    if (instance.due_at && new Date(instance.due_at).getTime() <= now.getTime())
      throw new WorkflowError('INSTANCE_CLOSED', 'Workflow has reached its timeout');

    const config = parseConfig(instance.definition_snapshot);
    const transition = config.transitions.find(
      (candidate) => candidate.action === input.action && candidate.from === instance.current_state
    );
    if (!transition)
      throw new WorkflowError('INVALID_TRANSITION', 'Action is not valid in this state');
    if (!transition.roles.includes(input.role))
      throw new WorkflowError('FORBIDDEN', 'Role cannot perform this action');
    if (transition.requireDifferentActor && input.actorId === instance.started_by_id)
      throw new WorkflowError('FORBIDDEN', 'The requester cannot approve their own request');

    let toState = transition.to;
    if (transition.requiredApprovals) {
      const previousApproval = await trx('workflow_approvals')
        .where({
          instance_id: instance.id,
          action: transition.action,
          actor_id: input.actorId,
        })
        .first('id');
      if (previousApproval)
        throw new WorkflowError('DUPLICATE_APPROVAL', 'Actor already voted on this transition');
      await WorkflowApproval.query(trx).insert({
        instance_id: instance.id,
        action: transition.action,
        actor_id: input.actorId,
        decision: 'approved',
        comment: input.comment ?? null,
        decided_at: now.toISOString(),
      });
      const result = await trx('workflow_approvals')
        .where({ instance_id: instance.id, action: transition.action, decision: 'approved' })
        .count({ count: '*' })
        .first();
      const approvals =
        typeof result?.count === 'number' ? result.count : Number(result?.count ?? 0);
      if (approvals < transition.requiredApprovals) toState = instance.current_state;
    } else if (input.action === 'reject') {
      await WorkflowApproval.query(trx).insert({
        instance_id: instance.id,
        action: transition.action,
        actor_id: input.actorId,
        decision: 'rejected',
        comment: input.comment ?? null,
        decided_at: now.toISOString(),
      });
    }

    const nextRevision = instance.revision + 1;
    const status =
      toState === 'approved' ? 'completed' : toState === 'rejected' ? 'rejected' : 'active';
    const patch = await trx('workflow_instances')
      .where({ id: instance.id, revision: input.expectedRevision, status: 'active' })
      .update({
        current_state: toState,
        status,
        revision: nextRevision,
        ...(status === 'active' ? {} : { completed_at: now.toISOString() }),
        write_uid: input.actorId,
        write_date: now.toISOString(),
      });
    if (patch !== 1)
      throw new WorkflowError('STALE_REVISION', 'Workflow changed; reload before retrying');
    await insertEvent(trx, {
      instanceId: instance.id,
      sequence: nextRevision,
      actorId: input.actorId,
      action: input.action,
      fromState: instance.current_state,
      toState,
      revision: nextRevision,
      idempotencyKey: input.idempotencyKey,
      comment: input.comment ?? null,
      createdAt: now.toISOString(),
    });
    if (transition.notifyStarter && toState === transition.to) {
      await enqueueNotification(
        {
          recipientId: instance.started_by_id,
          companyId: instance.company_id,
          actorId: input.actorId,
          templateCode: transition.notifyStarter,
          resource: { model: instance.resource_model, id: instance.resource_id },
        },
        trx
      );
    }
    return {
      ...rowFrom(instance),
      currentState: toState,
      status,
      revision: nextRevision,
      completedAt: status === 'active' ? null : now.toISOString(),
    };
  });
}

export async function expireDueWorkflows(db: Knex, now = new Date(), limit = 100): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Workflow expiry limit must be from 1 to 1000');
  const due = await db<InstanceRow>('workflow_instances')
    .where({ status: 'active' })
    .whereNotNull('due_at')
    .where('due_at', '<=', now.toISOString())
    .orderBy('due_at', 'asc')
    .limit(limit)
    .select('*');
  let expired = 0;
  for (const item of due) {
    const changed = await db.transaction(async (trx) => {
      const revision = item.revision + 1;
      const count = await trx('workflow_instances')
        .where({ id: item.id, status: 'active', revision: item.revision })
        .update({
          status: 'timed_out',
          current_state: 'timed_out',
          revision,
          completed_at: now.toISOString(),
        });
      if (count !== 1) return false;
      await insertEvent(trx, {
        instanceId: item.id,
        sequence: revision,
        actorId: null,
        action: 'timeout',
        fromState: item.current_state,
        toState: 'timed_out',
        revision,
        idempotencyKey: `timeout:${item.id}`,
        comment: null,
        createdAt: now.toISOString(),
      });
      return true;
    });
    if (changed) expired += 1;
  }
  return expired;
}

export function createWorkflowIdempotencyKey(): string {
  return randomUUID();
}

export function registerWorkflowExpiryHandler(): () => void {
  return registerJobHandler({
    name: 'workflow.expire_due',
    version: 1,
    parse(payload: unknown) {
      if (!isRecord(payload) || Object.keys(payload).length !== 0)
        throw new WorkflowError(
          'INVALID_DEFINITION',
          'Workflow expiry payload must be an empty object'
        );
      return payload;
    },
    async run(_payload, context) {
      if (context.signal.aborted) return { expired: 0 };
      return { expired: await expireDueWorkflows(WorkflowInstance.knex()) };
    },
  });
}

export { WorkflowApproval, WorkflowDefinition, WorkflowEvent, WorkflowInstance };
