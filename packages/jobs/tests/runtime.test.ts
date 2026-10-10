import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest, Company, CompanyMembership, User } from '@moonwitness/orm-base';
import { Cron, Job, JobRun, OutboxEvent, jobsManifest } from '../src/models.js';
import {
  enqueueDueCrons,
  enqueueJob,
  registerJobHandler,
  runOneJob,
  cancelJob,
  registerOutboxConsumer,
  dispatchOneOutboxEvent,
  runWorkerLoop,
  runSchedulerLoop,
  runOutboxLoop,
} from '../src/runtime.js';

describe('durable job runtime', () => {
  let db: Knex;

  beforeEach(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await installAddons(db, [baseManifest, jobsManifest]);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('validates typed payloads, deduplicates enqueue requests, and records a fenced run', async () => {
    const unregister = registerJobHandler({
      name: 'test.echo',
      version: 1,
      parse(payload: unknown): { message: string } {
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('message' in payload) ||
          typeof payload.message !== 'string'
        )
          throw new Error('message is required');
        return { message: payload.message };
      },
      async run(payload, context) {
        return {
          message: payload.message.toUpperCase(),
          companyId: context.env.context.companyId,
          actorId: context.env.context.userId,
        };
      },
    });
    try {
      const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
      const admin = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
      const firstId = await enqueueJob(
        'test.echo',
        { message: 'hello' },
        { idempotencyKey: 'once', companyId: company.id, requestedBy: admin.id }
      );
      const secondId = await enqueueJob(
        'test.echo',
        { message: 'ignored' },
        { idempotencyKey: 'once' }
      );
      expect(secondId).toBe(firstId);
      expect(await runOneJob({ workerId: 'worker-a' })).toBe(true);
      expect(await Job.query().findById(firstId)).toMatchObject({
        status: 'succeeded',
        attempts: 1,
        fencing_token: 1,
      });
      expect(await JobRun.query().where({ job_id: firstId }).first()).toMatchObject({
        status: 'succeeded',
        worker_id: 'worker-a',
        result: JSON.stringify({ message: 'HELLO', companyId: company.id, actorId: admin.id }),
      });
    } finally {
      unregister();
    }
  });

  it('allows only one concurrent worker to claim the same queued job', async () => {
    let invocations = 0;
    let signalStarted: (() => void) | undefined;
    let releaseHandler: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const unregister = registerJobHandler({
      name: 'test.single-claim',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        invocations += 1;
        signalStarted?.();
        await hold;
      },
    });
    try {
      const jobId = await enqueueJob('test.single-claim', { run: true });
      const firstWorker = runOneJob({
        workerId: 'worker-one',
        leaseSeconds: 6,
        heartbeatSeconds: 2,
      });
      await started;
      expect(await runOneJob({ workerId: 'worker-two' })).toBe(false);
      releaseHandler?.();
      expect(await firstWorker).toBe(true);
      expect(invocations).toBe(1);
      expect(await Job.query().findById(jobId)).toMatchObject({
        status: 'succeeded',
        lease_owner: null,
        fencing_token: 1,
      });
    } finally {
      releaseHandler?.();
      unregister();
    }
  });

  it('retries a transient failure and dead-letters a permanent failure', async () => {
    let calls = 0;
    const unregister = registerJobHandler({
      name: 'test.retry',
      version: 1,
      parse(payload: unknown): { ok: true } {
        if (typeof payload !== 'object' || payload === null || !('ok' in payload))
          throw new Error('invalid payload');
        return { ok: true };
      },
      async run() {
        calls += 1;
        if (calls === 1) throw new Error('temporary');
        return { ok: true };
      },
    });
    try {
      const id = await enqueueJob('test.retry', { ok: true }, { maxAttempts: 2 });
      const firstAttemptAt = Date.now();
      expect(await runOneJob({ workerId: 'worker-b', retryBaseSeconds: 2 })).toBe(true);
      const waiting = await Job.query().findById(id).throwIfNotFound();
      expect(Date.parse(waiting.available_at)).toBeGreaterThan(firstAttemptAt + 1000);
      expect(await runOneJob({ workerId: 'worker-b' })).toBe(false);
      await Job.query()
        .findById(id)
        .patch({ available_at: new Date(0).toISOString() });
      expect(await runOneJob({ workerId: 'worker-b' })).toBe(true);
      expect(await Job.query().findById(id)).toMatchObject({
        status: 'succeeded',
        attempts: 2,
        fencing_token: 2,
      });
      expect(await JobRun.query().where({ job_id: id }).orderBy('attempt')).toHaveLength(2);
    } finally {
      unregister();
    }
  });

  it('reclaims an expired lease with a new fencing token and preserves attempt history', async () => {
    const unregister = registerJobHandler({
      name: 'test.reclaim',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        return { recovered: true };
      },
    });
    try {
      const expired = await Job.query().insertAndFetch({
        handler: 'test.reclaim',
        handler_version: 1,
        payload: '{"run":true}',
        status: 'running',
        attempts: 1,
        max_attempts: 3,
        fencing_token: 1,
        lease_owner: 'crashed-worker',
        lease_until: new Date(0).toISOString(),
        available_at: new Date(0).toISOString(),
      });
      const previousRun = await JobRun.query().insertAndFetch({
        job_id: expired.id,
        attempt: 1,
        worker_id: 'crashed-worker',
        status: 'running',
        started_at: new Date(0).toISOString(),
      });

      expect(await runOneJob({ workerId: 'recovery-worker' })).toBe(true);
      expect(await Job.query().findById(expired.id)).toMatchObject({
        status: 'succeeded',
        attempts: 2,
        fencing_token: 2,
      });
      expect(await JobRun.query().findById(previousRun.id)).toMatchObject({
        status: 'retrying',
        error_code: 'LEASE_EXPIRED',
      });
      expect(await JobRun.query().where({ job_id: expired.id })).toHaveLength(2);
    } finally {
      unregister();
    }
  });

  it('dead-letters a user job after its company membership is revoked', async () => {
    let invoked = false;
    const unregister = registerJobHandler({
      name: 'test.secure',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        invoked = true;
      },
    });
    try {
      const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
      const admin = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
      const membership = await CompanyMembership.query()
        .findOne({ user_id: admin.id, company_id: company.id })
        .throwIfNotFound();
      const jobId = await enqueueJob(
        'test.secure',
        { run: true },
        {
          companyId: company.id,
          requestedBy: admin.id,
        }
      );
      await CompanyMembership.query().findById(membership.id).patch({ active: false });
      await runOneJob({ workerId: 'worker-secure' });
      expect(invoked).toBe(false);
      expect(await Job.query().findById(jobId)).toMatchObject({ status: 'dead', attempts: 1 });
      expect(await JobRun.query().where({ job_id: jobId }).first()).toMatchObject({
        error_code: 'COMPANY_ACCESS_REVOKED',
      });
    } finally {
      unregister();
    }
  });

  it('cancels cooperatively and never exceeds attempts after a lost lease', async () => {
    const unregister = registerJobHandler({
      name: 'test.cancel',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      run(_payload, context) {
        return new Promise<void>((resolve) => {
          context.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
    });
    try {
      const cancellableId = await enqueueJob('test.cancel', { run: true });
      const worker = runOneJob({ workerId: 'worker-cancel', leaseSeconds: 3, heartbeatSeconds: 1 });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const current = await Job.query().findById(cancellableId);
        if (current?.status === 'running') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(await cancelJob(cancellableId)).toBe(true);
      await worker;
      expect(await Job.query().findById(cancellableId)).toMatchObject({ status: 'cancelled' });

      const exhausted = await Job.query().insertAndFetch({
        handler: 'test.cancel',
        payload: '{"run":true}',
        status: 'running',
        attempts: 1,
        max_attempts: 1,
        fencing_token: 1,
        lease_owner: 'dead-worker',
        lease_until: new Date(0).toISOString(),
        available_at: new Date(0).toISOString(),
      });
      await JobRun.query().insert({
        job_id: exhausted.id,
        attempt: 1,
        worker_id: 'dead-worker',
        status: 'running',
        started_at: new Date(0).toISOString(),
      });
      expect(await runOneJob({ workerId: 'worker-reclaim' })).toBe(false);
      expect(await Job.query().findById(exhausted.id)).toMatchObject({
        status: 'dead',
        attempts: 1,
      });
      expect(await JobRun.query().where({ job_id: exhausted.id }).first()).toMatchObject({
        status: 'dead',
        error_code: 'LEASE_EXPIRED',
      });
    } finally {
      unregister();
    }
  });

  it('coalesces missed cron occurrences, deduplicates them, and advances the schedule', async () => {
    const unregister = registerJobHandler({
      name: 'test.cron',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        return null;
      },
    });
    try {
      const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
      const now = new Date('2026-10-03T12:03:00.000Z');
      const cron = await Cron.query().insertAndFetch({
        code: 'test.minute',
        name: 'Minute schedule',
        handler: 'test.cron',
        payload: '{"run":true}',
        company_id: company.id,
        cron_expression: '* * * * *',
        timezone: 'UTC',
        enabled: true,
        next_run_at: '2026-10-03T12:00:00.000Z',
        misfire_policy: 'coalesce',
        concurrency_policy: 'allow',
        max_catch_up: 3,
      });
      expect(await enqueueDueCrons({ now })).toBe(1);
      expect(await enqueueDueCrons({ now })).toBe(0);
      expect(await Job.query().where({ cron_id: cron.id })).toHaveLength(1);
      const advanced = await Cron.query().findById(cron.id);
      expect(Date.parse(advanced?.next_run_at ?? '')).toBeGreaterThan(now.getTime());
    } finally {
      unregister();
    }
  });

  it('coalesces repeated wall-clock cron occurrences across a daylight-saving transition', async () => {
    const unregister = registerJobHandler({
      name: 'test.dst',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        return null;
      },
    });
    try {
      const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
      const now = new Date('2026-11-01T07:00:00.000Z');
      const cron = await Cron.query().insertAndFetch({
        code: 'test.dst-fallback',
        name: 'DST fallback schedule',
        handler: 'test.dst',
        payload: '{"run":true}',
        company_id: company.id,
        cron_expression: '30 1 * * *',
        timezone: 'America/New_York',
        enabled: true,
        next_run_at: '2026-11-01T05:30:00.000Z',
        misfire_policy: 'coalesce',
        concurrency_policy: 'allow',
        max_catch_up: 3,
      });

      expect(await enqueueDueCrons({ now })).toBe(1);
      expect(await Job.query().where({ cron_id: cron.id })).toHaveLength(1);
      const advanced = await Cron.query().findById(cron.id).throwIfNotFound();
      expect(Date.parse(advanced.next_run_at)).toBeGreaterThan(now.getTime());
    } finally {
      unregister();
    }
  });

  it('fences and retries durable outbox delivery with a stable event id', async () => {
    const delivered: number[] = [];
    const unregister = registerOutboxConsumer('record.created', async (_payload, eventId) => {
      delivered.push(eventId);
    });
    try {
      const event = await OutboxEvent.query().insertAndFetch({
        event_type: 'record.created',
        aggregate_model: 'base.partner',
        aggregate_id: 123,
        payload: '{"record":{"id":123}}',
        available_at: new Date().toISOString(),
      });
      expect(await dispatchOneOutboxEvent('outbox-a')).toBe(true);
      expect(delivered).toEqual([event.id]);
      expect(await OutboxEvent.query().findById(event.id)).toMatchObject({
        status: 'published',
        attempts: 1,
        fencing_token: 1,
      });
      expect(await dispatchOneOutboxEvent('outbox-a')).toBe(false);
    } finally {
      unregister();
    }
  });

  it('dispatches a matching event after deferring an older event without a consumer', async () => {
    const delivered: number[] = [];
    const unregister = registerOutboxConsumer('record.created', async (_payload, eventId) => {
      delivered.push(eventId);
    });
    try {
      const unavailable = await OutboxEvent.query().insertAndFetch({
        event_type: 'unregistered.event',
        aggregate_model: 'base.partner',
        aggregate_id: 122,
        payload: '{}',
        created_at: new Date(0).toISOString(),
        available_at: new Date(0).toISOString(),
      });
      const target = await OutboxEvent.query().insertAndFetch({
        event_type: 'record.created',
        aggregate_model: 'base.partner',
        aggregate_id: 123,
        payload: '{"record":{"id":123}}',
        available_at: new Date().toISOString(),
      });

      expect(await dispatchOneOutboxEvent('outbox-missing-consumer')).toBe(true);
      expect(await OutboxEvent.query().findById(unavailable.id)).toMatchObject({
        status: 'pending',
        last_error: expect.stringContaining('OUTBOX_CONSUMER_UNAVAILABLE'),
      });
      expect(await dispatchOneOutboxEvent('outbox-missing-consumer')).toBe(true);
      expect(delivered).toEqual([target.id]);
      expect(await OutboxEvent.query().findById(target.id)).toMatchObject({
        status: 'published',
        attempts: 1,
      });
    } finally {
      unregister();
    }
  });

  it('retries after a successful receiver effect and lets an idempotent receiver deduplicate it', async () => {
    const deliveries: number[] = [];
    const appliedEffects = new Set<number>();
    let effectCount = 0;
    const unregister = registerOutboxConsumer('receiver.deduplicate', async (_payload, eventId) => {
      deliveries.push(eventId);
      if (!appliedEffects.has(eventId)) {
        appliedEffects.add(eventId);
        effectCount += 1;
      }
    });
    try {
      const event = await OutboxEvent.query().insertAndFetch({
        event_type: 'receiver.deduplicate',
        aggregate_model: 'base.partner',
        aggregate_id: 456,
        payload: '{"record":{"id":456}}',
        available_at: new Date(0).toISOString(),
        max_attempts: 3,
      });
      await db.raw(`
        CREATE TRIGGER fail_outbox_ack
        BEFORE UPDATE ON outbox_events
        WHEN NEW.status = 'published'
        BEGIN SELECT RAISE(ABORT, 'simulated acknowledgement failure'); END;
      `);

      expect(await dispatchOneOutboxEvent('outbox-retry')).toBe(true);
      expect(await OutboxEvent.query().findById(event.id)).toMatchObject({
        status: 'pending',
        attempts: 1,
      });
      expect(await dispatchOneOutboxEvent('outbox-retry')).toBe(false);
      await db.raw('DROP TRIGGER fail_outbox_ack');
      await OutboxEvent.query()
        .findById(event.id)
        .patch({ available_at: new Date(0).toISOString() });

      expect(await dispatchOneOutboxEvent('outbox-retry')).toBe(true);
      expect(deliveries).toEqual([event.id, event.id]);
      expect(effectCount).toBe(1);
      expect(await OutboxEvent.query().findById(event.id)).toMatchObject({
        status: 'published',
        attempts: 2,
        fencing_token: 2,
      });
    } finally {
      await db.raw('DROP TRIGGER IF EXISTS fail_outbox_ack');
      unregister();
    }
  });

  it('stops idle worker, scheduler, and outbox loops when shutdown is signaled', async () => {
    const stop = new AbortController();
    const loops = Promise.all([
      runWorkerLoop({ workerId: 'shutdown-worker' }, stop.signal, 60_000),
      runSchedulerLoop(stop.signal, 60_000),
      runOutboxLoop('shutdown-outbox', stop.signal, 60_000),
    ]);
    setTimeout(() => stop.abort(), 10);
    await expect(loops).resolves.toEqual([undefined, undefined, undefined]);
  });

  it('drains the currently claimed job before a worker loop exits', async () => {
    let announceStarted: () => void = () => undefined;
    let finishHandler: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      announceStarted = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      finishHandler = resolve;
    });
    const unregister = registerJobHandler({
      name: 'test.shutdown-drain',
      version: 1,
      parse(payload: unknown): { run: true } {
        if (typeof payload !== 'object' || payload === null || !('run' in payload))
          throw new Error('invalid payload');
        return { run: true };
      },
      async run() {
        announceStarted();
        await hold;
        return { completed: true };
      },
    });
    try {
      const jobId = await enqueueJob('test.shutdown-drain', { run: true });
      const stop = new AbortController();
      const loop = runWorkerLoop({ workerId: 'draining-worker' }, stop.signal, 60_000);
      await started;
      stop.abort();
      let loopFinished = false;
      void loop.then(() => {
        loopFinished = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(loopFinished).toBe(false);
      finishHandler();
      await loop;
      expect(await Job.query().findById(jobId)).toMatchObject({ status: 'succeeded' });
    } finally {
      finishHandler();
      unregister();
    }
  });
});
