import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Transaction } from 'objection';
import { CronExpressionParser } from 'cron-parser';
import { Cron, Job, JobRun, OutboxEvent, cancelJob, enqueueJob } from '@moonwitness/jobs';
import type { BaseModel } from '@moonwitness/orm';

function isAdmin(role: string | undefined): boolean {
  return role === 'system' || role === 'superadmin';
}

function adminOnly(role: string | undefined): boolean {
  return isAdmin(role);
}

function countValue(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('count' in value)) return 0;
  const count = value.count;
  return typeof count === 'number' || typeof count === 'string' ? Number(count) : 0;
}

async function logAdminAction(
  req: FastifyRequest,
  model: string,
  recordId: number,
  operation: string,
  trx?: Transaction
): Promise<void> {
  await req.env
    .get('base.audit_log')
    .query(trx)
    .insert({
      model,
      record_id: recordId,
      operation,
      actor_id: req.auth?.userId ?? null,
      changes: JSON.stringify({ admin_control: true }),
    } as Partial<BaseModel>);
}

export const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/admin/jobs/health', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const [queued, running, dead, outboxPending, outboxDead] = await Promise.all([
      Job.query().where({ status: 'queued' }).count({ count: '*' }).first(),
      Job.query().where({ status: 'running' }).count({ count: '*' }).first(),
      Job.query().where({ status: 'dead' }).count({ count: '*' }).first(),
      OutboxEvent.query()
        .whereIn('status', ['pending', 'processing'])
        .count({ count: '*' })
        .first(),
      OutboxEvent.query().where({ status: 'dead' }).count({ count: '*' }).first(),
    ]);
    const oldest = await Job.query()
      .where({ status: 'queued' })
      .orderBy('available_at', 'asc')
      .first();
    return {
      success: true,
      data: {
        queued: countValue(queued),
        running: countValue(running),
        dead: countValue(dead),
        outboxPending: countValue(outboxPending),
        outboxDead: countValue(outboxDead),
        oldestQueuedAt: oldest?.available_at ?? null,
      },
    };
  });

  fastify.get<{ Querystring: { status?: string; limit?: string } }>(
    '/admin/jobs',
    async (req, reply) => {
      if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
      const limit = Number(req.query.limit ?? 50);
      const allowedStatuses = new Set(['queued', 'running', 'succeeded', 'dead', 'cancelled']);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        return reply.code(400).send({ success: false, error: 'limit must be between 1 and 200' });
      if (req.query.status && !allowedStatuses.has(req.query.status))
        return reply.code(400).send({ success: false, error: 'Invalid job status' });
      let query = Job.query().orderBy('id', 'desc').limit(limit);
      if (req.query.status) query = query.where({ status: req.query.status });
      const jobs = await query.select(
        'id',
        'handler',
        'handler_version',
        'company_id',
        'status',
        'priority',
        'available_at',
        'attempts',
        'max_attempts',
        'lease_owner',
        'lease_until',
        'fencing_token',
        'create_date'
      );
      return { success: true, data: jobs };
    }
  );

  fastify.get<{ Params: { id: string } }>('/admin/jobs/:id/runs', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return reply.code(400).send({ success: false, error: 'Invalid job ID' });
    const runs = await JobRun.query()
      .where({ job_id: id })
      .orderBy('attempt', 'desc')
      .select(
        'id',
        'attempt',
        'worker_id',
        'status',
        'started_at',
        'finished_at',
        'error_code',
        'error_message'
      );
    return { success: true, data: runs };
  });

  fastify.get<{ Querystring: { status?: string; limit?: string } }>(
    '/admin/outbox',
    async (req, reply) => {
      if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
      const limit = Number(req.query.limit ?? 50);
      const statuses = new Set(['pending', 'processing', 'published', 'dead']);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        return reply.code(400).send({ success: false, error: 'limit must be between 1 and 200' });
      if (req.query.status && !statuses.has(req.query.status))
        return reply.code(400).send({ success: false, error: 'Invalid outbox status' });
      let query = OutboxEvent.query().orderBy('id', 'desc').limit(limit);
      if (req.query.status) query = query.where({ status: req.query.status });
      const events = await query.select(
        'id',
        'event_type',
        'aggregate_model',
        'aggregate_id',
        'company_id',
        'status',
        'attempts',
        'max_attempts',
        'available_at',
        'last_error',
        'created_at',
        'published_at'
      );
      return { success: true, data: events };
    }
  );

  fastify.post<{ Params: { id: string } }>('/admin/outbox/:id/retry', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return reply.code(400).send({ success: false, error: 'Invalid outbox ID' });
    const retried = await req.server.db.transaction(async (trx) => {
      const event = await OutboxEvent.query(trx).findById(id);
      if (!event || event.status !== 'dead') return false;
      await OutboxEvent.query(trx).findById(id).patch({
        status: 'pending',
        attempts: 0,
        available_at: new Date().toISOString(),
        lease_owner: null,
        lease_until: null,
        last_error: null,
      });
      await logAdminAction(req, 'base.outbox_event', id, 'admin_retry', trx);
      return true;
    });
    if (!retried)
      return reply.code(409).send({ success: false, error: 'Outbox event is not retryable' });
    return { success: true };
  });

  fastify.post<{ Params: { id: string } }>('/admin/jobs/:id/cancel', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return reply.code(400).send({ success: false, error: 'Invalid job ID' });
    const cancelled = await req.server.db.transaction(async (trx) => {
      if (!(await cancelJob(id, trx))) return false;
      await logAdminAction(req, 'base.job', id, 'admin_cancel', trx);
      return true;
    });
    if (!cancelled)
      return reply.code(409).send({ success: false, error: 'Job cannot be cancelled' });
    return { success: true };
  });

  fastify.post<{ Params: { id: string } }>('/admin/jobs/:id/retry', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return reply.code(400).send({ success: false, error: 'Invalid job ID' });
    const retried = await req.server.db.transaction(async (trx) => {
      const job = await Job.query(trx).findById(id);
      if (!job || (job.status !== 'dead' && job.status !== 'cancelled')) return false;
      await Job.query(trx)
        .findById(id)
        .patch({
          status: 'queued',
          max_attempts: Math.max(job.max_attempts, job.attempts + 5),
          available_at: new Date().toISOString(),
          cancel_requested: false,
          lease_owner: null,
          lease_until: null,
        });
      await logAdminAction(req, 'base.job', id, 'admin_retry', trx);
      return true;
    });
    if (!retried) return reply.code(409).send({ success: false, error: 'Job is not retryable' });
    return { success: true };
  });

  fastify.get('/admin/crons', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const crons = await Cron.query()
      .orderBy('name', 'asc')
      .select(
        'id',
        'code',
        'name',
        'handler',
        'company_id',
        'cron_expression',
        'timezone',
        'enabled',
        'next_run_at',
        'misfire_policy',
        'concurrency_policy'
      );
    return { success: true, data: crons };
  });

  fastify.post<{
    Body: {
      code: string;
      name: string;
      handler: string;
      handler_version?: number;
      payload?: unknown;
      company_id?: number;
      cron_expression: string;
      timezone?: string;
      enabled?: boolean;
      misfire_policy?: 'skip' | 'coalesce' | 'catch_up';
      concurrency_policy?: 'allow' | 'forbid' | 'replace';
      max_catch_up?: number;
    };
  }>('/admin/crons', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const body = req.body;
    const companyId = body.company_id ?? req.auth?.companyId;
    if (
      typeof body.code !== 'string' ||
      !/^[a-z][a-z0-9_.-]{2,127}$/.test(body.code) ||
      typeof body.name !== 'string' ||
      body.name.trim().length === 0 ||
      body.name.length > 255 ||
      typeof body.handler !== 'string' ||
      !/^[a-z][a-z0-9_.-]{2,127}$/.test(body.handler) ||
      typeof body.cron_expression !== 'string'
    ) {
      return reply.code(400).send({ success: false, error: 'Invalid cron definition' });
    }
    if (
      companyId !== undefined &&
      req.auth?.companyId !== undefined &&
      companyId !== req.auth.companyId
    ) {
      return reply.code(403).send({ success: false, error: 'Company access denied' });
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean')
      return reply.code(400).send({ success: false, error: 'enabled must be boolean' });
    const version = body.handler_version ?? 1;
    const maxCatchUp = body.max_catch_up ?? 3;
    if (
      !Number.isInteger(version) ||
      version < 1 ||
      !Number.isInteger(maxCatchUp) ||
      maxCatchUp < 1 ||
      maxCatchUp > 100
    ) {
      return reply
        .code(400)
        .send({ success: false, error: 'Invalid handler version or max_catch_up' });
    }
    const payload = body.payload ?? {};
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
      return reply.code(400).send({ success: false, error: 'payload must be a JSON object' });
    const timezone = body.timezone ?? 'UTC';
    let nextRunAt: string;
    try {
      nextRunAt = CronExpressionParser.parse(body.cron_expression, {
        currentDate: new Date(),
        tz: timezone,
      })
        .next()
        .toDate()
        .toISOString();
    } catch {
      return reply.code(400).send({ success: false, error: 'Invalid cron expression or timezone' });
    }
    const misfirePolicy = body.misfire_policy ?? 'coalesce';
    const concurrencyPolicy = body.concurrency_policy ?? 'forbid';
    if (!['skip', 'coalesce', 'catch_up'].includes(misfirePolicy))
      return reply.code(400).send({ success: false, error: 'Invalid misfire policy' });
    if (!['allow', 'forbid', 'replace'].includes(concurrencyPolicy))
      return reply.code(400).send({ success: false, error: 'Invalid concurrency policy' });
    const cron = await req.server.db.transaction(async (trx) => {
      const created = await Cron.query(trx).insertAndFetch({
        code: body.code,
        name: body.name.trim(),
        handler: body.handler,
        handler_version: version,
        payload: JSON.stringify(payload),
        company_id: companyId,
        requested_by_id: req.auth?.userId,
        cron_expression: body.cron_expression,
        timezone,
        enabled: body.enabled ?? false,
        next_run_at: nextRunAt,
        misfire_policy: misfirePolicy,
        concurrency_policy: concurrencyPolicy,
        max_catch_up: maxCatchUp,
      });
      await logAdminAction(req, 'base.cron', created.id, 'admin_create', trx);
      return created;
    });
    return reply.code(201).send({
      success: true,
      data: { id: cron.id, code: cron.code, enabled: cron.enabled, next_run_at: cron.next_run_at },
    });
  });

  fastify.patch<{
    Params: { id: string };
    Body: { enabled?: boolean; cron_expression?: string; timezone?: string };
  }>('/admin/crons/:id', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const id = Number(req.params.id);
    const { enabled, cron_expression: expression, timezone } = req.body ?? {};
    if (!Number.isSafeInteger(id) || id < 1)
      return reply.code(400).send({ success: false, error: 'Invalid cron ID' });
    if (enabled !== undefined && typeof enabled !== 'boolean')
      return reply.code(400).send({ success: false, error: 'enabled must be boolean' });
    if (expression !== undefined && typeof expression !== 'string')
      return reply.code(400).send({ success: false, error: 'cron_expression must be a string' });
    if (timezone !== undefined && typeof timezone !== 'string')
      return reply.code(400).send({ success: false, error: 'timezone must be a string' });
    const updated = await req.server.db.transaction(async (trx) => {
      const cron = await Cron.query(trx).findById(id).forUpdate();
      if (!cron) return null;
      const nextExpression = expression ?? cron.cron_expression;
      const nextTimezone = timezone ?? cron.timezone;
      let nextRunAt: string;
      try {
        nextRunAt = CronExpressionParser.parse(nextExpression, {
          currentDate: new Date(),
          tz: nextTimezone,
        })
          .next()
          .toDate()
          .toISOString();
      } catch {
        return { invalid: true as const };
      }
      const nextEnabled = enabled ?? cron.enabled;
      await Cron.query(trx).findById(id).patch({
        enabled: nextEnabled,
        cron_expression: nextExpression,
        timezone: nextTimezone,
        next_run_at: nextRunAt,
      });
      await logAdminAction(req, 'base.cron', id, 'admin_update', trx);
      return { id, enabled: nextEnabled, next_run_at: nextRunAt };
    });
    if (updated === null) return reply.code(404).send({ success: false, error: 'Cron not found' });
    if ('invalid' in updated)
      return reply.code(400).send({ success: false, error: 'Invalid cron expression or timezone' });
    return {
      success: true,
      data: updated,
    };
  });

  fastify.post<{ Params: { id: string } }>('/admin/crons/:id/trigger', async (req, reply) => {
    if (!adminOnly(req.auth?.role)) return reply.code(403).send({ success: false });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      return reply.code(400).send({ success: false, error: 'Invalid cron ID' });
    const cron = await Cron.query().findById(id);
    if (!cron) return reply.code(404).send({ success: false, error: 'Cron not found' });
    let payload: Record<string, unknown>;
    try {
      payload =
        typeof cron.payload === 'string'
          ? JSON.parse(cron.payload)
          : ((cron.payload as Record<string, unknown>) ?? {});
    } catch {
      payload = {};
    }
    const jobId = await enqueueJob(cron.handler, payload, {
      companyId: cron.company_id ?? undefined,
      requestedBy: req.auth?.userId,
      priority: 10,
    });
    await logAdminAction(req, 'base.cron', id, 'admin_trigger_now');
    return { success: true, data: { jobId } };
  });
};
