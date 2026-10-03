import { defineAddon, defineModel, fields, seed } from '@moonwitness/orm';
import { Company, User } from '@moonwitness/orm-base';

export const Job = defineModel('base.job', {
  table: 'jobs',
  order: 'priority desc, available_at asc, id asc',
  fields: {
    handler: fields.string({ required: true, pattern: '^[a-z][a-z0-9_.-]{2,127}$' }),
    handler_version: fields.integer({ required: true, default: 1 }),
    payload: fields.text({ required: true, default: '{}' }),
    company: fields.belongsTo(Company),
    requested_by: fields.belongsTo(User),
    cron_id: fields.integer(),
    schedule_key: fields.string({ unique: true }),
    idempotency_key: fields.string({ unique: true }),
    status: fields.enum(['queued', 'running', 'succeeded', 'dead', 'cancelled'], {
      required: true,
      default: 'queued',
    }),
    priority: fields.integer({ required: true, default: 0 }),
    available_at: fields.string({ required: true }),
    attempts: fields.integer({ required: true, default: 0 }),
    max_attempts: fields.integer({ required: true, default: 5 }),
    lease_owner: fields.string(),
    lease_until: fields.string(),
    fencing_token: fields.integer({ required: true, default: 0 }),
    cancel_requested: fields.boolean({ required: true, default: false }),
  },
});

export const JobRun = defineModel('base.job_run', {
  table: 'job_runs',
  order: 'started_at desc, id desc',
  unique: [['job', 'attempt']],
  fields: {
    job: fields.belongsTo(Job, { required: true }),
    attempt: fields.integer({ required: true }),
    worker_id: fields.string({ required: true }),
    status: fields.enum(['running', 'succeeded', 'retrying', 'dead', 'cancelled'], {
      required: true,
    }),
    started_at: fields.string({ required: true }),
    finished_at: fields.string(),
    error_code: fields.string(),
    error_message: fields.text(),
    result: fields.text(),
  },
});

export const OutboxEvent = defineModel('base.outbox_event', {
  table: 'outbox_events',
  order: 'created_at asc, id asc',
  fields: {
    event_type: fields.string({ required: true }),
    aggregate_model: fields.string({ required: true }),
    aggregate_id: fields.integer({ required: true }),
    company: fields.belongsTo(Company),
    actor: fields.belongsTo(User),
    payload: fields.text({ required: true }),
    status: fields.enum(['pending', 'processing', 'published', 'dead'], {
      required: true,
      default: 'pending',
    }),
    attempts: fields.integer({ required: true, default: 0 }),
    max_attempts: fields.integer({ required: true, default: 10 }),
    available_at: fields.string({ required: true }),
    lease_owner: fields.string(),
    lease_until: fields.string(),
    fencing_token: fields.integer({ required: true, default: 0 }),
    created_at: fields.string({ required: true, default: new Date().toISOString() }),
    published_at: fields.string(),
    last_error: fields.text(),
  },
});

export const Cron = defineModel('base.cron', {
  table: 'crons',
  order: 'name asc',
  fields: {
    code: fields.string({ required: true, unique: true }),
    name: fields.string({ required: true }),
    handler: fields.string({ required: true, pattern: '^[a-z][a-z0-9_.-]{2,127}$' }),
    handler_version: fields.integer({ required: true, default: 1 }),
    payload: fields.text({ required: true, default: '{}' }),
    company: fields.belongsTo(Company),
    requested_by: fields.belongsTo(User),
    cron_expression: fields.string({ required: true }),
    timezone: fields.string({ required: true, default: 'UTC' }),
    enabled: fields.boolean({ required: true, default: false }),
    next_run_at: fields.string({ required: true }),
    misfire_policy: fields.enum(['skip', 'coalesce', 'catch_up'], {
      required: true,
      default: 'coalesce',
    }),
    concurrency_policy: fields.enum(['allow', 'forbid', 'replace'], {
      required: true,
      default: 'forbid',
    }),
    max_catch_up: fields.integer({ required: true, default: 3 }),
  },
});

export const jobsManifest = defineAddon({
  name: 'jobs',
  version: '1.0.0',
  depends: ['base'],
  models: [Job, JobRun, Cron, OutboxEvent],
  data: [
    seed(Cron, 'jobs.cron_example_disabled', {
      code: 'example.noop',
      name: 'Disabled example schedule',
      handler: 'example.noop',
      payload: '{}',
      cron_expression: '0 0 * * *',
      timezone: 'UTC',
      enabled: false,
      next_run_at: '2099-01-01T00:00:00.000Z',
      misfire_policy: 'skip',
      concurrency_policy: 'forbid',
      max_catch_up: 1,
    }),
  ],
});
