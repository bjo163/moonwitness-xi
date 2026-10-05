import type { FastifyPluginAsync } from 'fastify';
import { Registry, applyDomain } from '@moonwitness/orm';
import { startWorkflow, transitionWorkflow, WorkflowError } from '@moonwitness/orm-workflow';
import { canAccess } from '../auth/policy.js';
import { getRecordRuleDomain } from '../auth/rules.js';

interface StartBody {
  code: string;
  resource_model: string;
  resource_id: number;
  idempotency_key: string;
}

interface TransitionBody {
  action: string;
  expected_revision: number;
  idempotency_key: string;
  comment?: string;
}

interface IdParams {
  id: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseStart(value: unknown): StartBody | null {
  const body = record(value);
  if (
    !body ||
    Object.keys(body).some(
      (key) => !['code', 'resource_model', 'resource_id', 'idempotency_key'].includes(key)
    ) ||
    typeof body.code !== 'string' ||
    typeof body.resource_model !== 'string' ||
    !Number.isSafeInteger(body.resource_id) ||
    Number(body.resource_id) < 1 ||
    typeof body.idempotency_key !== 'string'
  )
    return null;
  return {
    code: body.code,
    resource_model: body.resource_model,
    resource_id: Number(body.resource_id),
    idempotency_key: body.idempotency_key,
  };
}

function parseTransition(value: unknown): TransitionBody | null {
  const body = record(value);
  if (
    !body ||
    Object.keys(body).some(
      (key) => !['action', 'expected_revision', 'idempotency_key', 'comment'].includes(key)
    ) ||
    typeof body.action !== 'string' ||
    !Number.isSafeInteger(body.expected_revision) ||
    Number(body.expected_revision) < 0 ||
    typeof body.idempotency_key !== 'string' ||
    (body.comment !== undefined && typeof body.comment !== 'string') ||
    (typeof body.comment === 'string' && body.comment.length > 2000)
  )
    return null;
  return {
    action: body.action,
    expected_revision: Number(body.expected_revision),
    idempotency_key: body.idempotency_key,
    ...(typeof body.comment === 'string' ? { comment: body.comment } : {}),
  };
}

function workflowFailure(error: unknown): { status: number; message: string } | null {
  if (!(error instanceof WorkflowError)) return null;
  const status =
    error.code === 'FORBIDDEN'
      ? 403
      : error.code === 'INSTANCE_NOT_FOUND' || error.code === 'DEFINITION_NOT_FOUND'
        ? 404
        : error.code === 'STALE_REVISION' ||
            error.code === 'DUPLICATE_APPROVAL' ||
            error.code === 'INSTANCE_CLOSED'
          ? 409
          : 400;
  return { status, message: error.message };
}

export const workflowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string } }>('/workflows/instances', async (req, reply) => {
    if (!req.auth)
      return reply.code(401).send({ success: false, error: 'Authentication required' });
    if (!req.auth.companyId)
      return reply.code(403).send({ success: false, error: 'Active company is required' });
    const limit = Number(req.query.limit ?? 50);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      return reply.code(400).send({ success: false, error: 'limit must be between 1 and 100' });
    const data = await fastify
      .db('workflow_instances')
      .where({ company_id: req.auth.companyId })
      .orderBy('create_date', 'desc')
      .limit(limit)
      .select(
        'id',
        'definition_id',
        'definition_version',
        'resource_model',
        'resource_id',
        'started_by_id',
        'current_state',
        'status',
        'revision',
        'due_at',
        'completed_at',
        'create_date'
      );
    return { success: true, data };
  });

  fastify.post<{ Body: unknown }>('/workflows/instances', async (req, reply) => {
    if (!req.auth)
      return reply.code(401).send({ success: false, error: 'Authentication required' });
    if (!req.auth.companyId)
      return reply.code(403).send({ success: false, error: 'Active company is required' });
    const body = parseStart(req.body);
    if (!body)
      return reply.code(400).send({ success: false, error: 'Invalid workflow start request' });
    if (
      !Registry.has(body.resource_model) ||
      !canAccess(req.auth.role, body.resource_model, 'read', req.auth.groupPermissions)
    )
      return reply.code(404).send({ success: false, error: 'Resource not found' });
    const resourceModel = req.env.get(body.resource_model);
    const domain = await getRecordRuleDomain(req, body.resource_model);
    const resource = await applyDomain(
      resourceModel.query().where({ id: body.resource_id, active: true }),
      domain
    ).first();
    if (!resource) return reply.code(404).send({ success: false, error: 'Resource not found' });
    try {
      const data = await startWorkflow(fastify.db, {
        code: body.code,
        companyId: req.auth.companyId,
        actorId: req.auth.userId,
        role: req.auth.role,
        resourceModel: body.resource_model,
        resourceId: body.resource_id,
        idempotencyKey: body.idempotency_key,
      });
      return reply.code(201).send({ success: true, data });
    } catch (error) {
      const failure = workflowFailure(error);
      if (failure)
        return reply.code(failure.status).send({ success: false, error: failure.message });
      throw error;
    }
  });

  fastify.get<{ Params: IdParams }>('/workflows/instances/:id', async (req, reply) => {
    if (!req.auth)
      return reply.code(401).send({ success: false, error: 'Authentication required' });
    if (!req.auth.companyId)
      return reply.code(403).send({ success: false, error: 'Active company is required' });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return reply.code(400).send({ success: false, error: 'Invalid workflow ID' });
    const data = await fastify
      .db('workflow_instances')
      .where({ id, company_id: req.auth.companyId })
      .first(
        'id',
        'definition_id',
        'definition_version',
        'resource_model',
        'resource_id',
        'started_by_id',
        'current_state',
        'status',
        'revision',
        'due_at',
        'completed_at',
        'create_date'
      );
    if (!data) return reply.code(404).send({ success: false, error: 'Workflow not found' });
    const [events, approvals] = await Promise.all([
      fastify
        .db('workflow_events')
        .where({ instance_id: id })
        .orderBy('sequence', 'asc')
        .select(
          'sequence',
          'actor_id',
          'action',
          'from_state',
          'to_state',
          'revision',
          'comment',
          'created_at'
        ),
      fastify
        .db('workflow_approvals')
        .where({ instance_id: id })
        .orderBy('decided_at', 'asc')
        .select('action', 'actor_id', 'decision', 'comment', 'decided_at'),
    ]);
    return { success: true, data: { ...data, events, approvals } };
  });

  fastify.post<{ Params: IdParams; Body: unknown }>(
    '/workflows/instances/:id/actions',
    async (req, reply) => {
      if (!req.auth)
        return reply.code(401).send({ success: false, error: 'Authentication required' });
      if (!req.auth.companyId)
        return reply.code(403).send({ success: false, error: 'Active company is required' });
      const id = Number(req.params.id);
      const body = parseTransition(req.body);
      if (!Number.isSafeInteger(id) || id < 1 || !body)
        return reply.code(400).send({ success: false, error: 'Invalid workflow action request' });
      try {
        const data = await transitionWorkflow(fastify.db, {
          instanceId: id,
          companyId: req.auth.companyId,
          actorId: req.auth.userId,
          role: req.auth.role,
          action: body.action,
          expectedRevision: body.expected_revision,
          idempotencyKey: body.idempotency_key,
          ...(body.comment === undefined ? {} : { comment: body.comment }),
        });
        return { success: true, data };
      } catch (error) {
        const failure = workflowFailure(error);
        if (failure)
          return reply.code(failure.status).send({ success: false, error: failure.message });
        throw error;
      }
    }
  );
};
