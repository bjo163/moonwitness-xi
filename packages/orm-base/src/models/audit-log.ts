import { defineModel, fields } from '@moonwitness/orm';

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
