import { defineModel, fields } from '@moonwitness/orm';
import { User } from './user.js';

/** Lightweight reminder attached to an installed addon record. */
export const Activity = defineModel('base.activity', {
  table: 'activities',
  order: 'deadline asc',
  fields: {
    summary: fields.string({ required: true }),
    activity_type: fields.enum(['todo', 'call', 'meeting', 'email'], {
      required: true,
      default: 'todo',
    }),
    state: fields.enum(['planned', 'done', 'cancelled'], {
      required: true,
      default: 'planned',
    }),
    deadline: fields.string({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    note: fields.text(),
    assigned_to: fields.belongsTo(User),
    resource_model: fields.string({
      required: true,
      pattern: '^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$',
    }),
    resource_id: fields.integer({ required: true }),
  },
});
