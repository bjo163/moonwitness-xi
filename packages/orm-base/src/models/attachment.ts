import { defineModel, fields } from '@moonwitness/orm';

/** Attachment metadata; storage keys are server-managed and never returned to clients. */
export const Attachment = defineModel('base.attachment', {
  table: 'attachments',
  order: 'id desc',
  fields: {
    name: fields.string({ required: true }),
    resource_model: fields.string({
      required: true,
      pattern: '^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$',
    }),
    resource_id: fields.integer({ required: true }),
    mimetype: fields.string({ required: true }),
    size_bytes: fields.integer({ required: true }),
    storage_key: fields.string({ required: true, hidden: true }),
    checksum: fields.string({ pattern: '^[A-Fa-f0-9]{64}$' }),
  },
});
