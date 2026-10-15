import { defineModel, fields } from '@moonwitness/orm';
import type { StaticHookArguments } from 'objection';

/** Append-only audit events written by the API layer. Secret fields are never copied here. */
export const AuditLog = defineModel('base.audit_log', {
  table: 'audit_logs',
  order: 'id desc',
  fields: {
    model: fields.string({ required: true }),
    record_id: fields.integer({ required: true }),
    operation: fields.string({ required: true }),
    actor_id: fields.integer(),
    changes: fields.text({ required: true }),
  },
});

/** Audit history is append-only even for callers that bypass generic API policy. */
const rejectAuditMutation = (): never => {
  throw new Error('Audit log records are append-only');
};

AuditLog.beforeUpdate = (_args: StaticHookArguments<InstanceType<typeof AuditLog>>): never =>
  rejectAuditMutation();
AuditLog.beforeDelete = (_args: StaticHookArguments<InstanceType<typeof AuditLog>>): never =>
  rejectAuditMutation();
AuditLog.prototype.$beforeUpdate = rejectAuditMutation;
AuditLog.prototype.$beforeDelete = rejectAuditMutation;
