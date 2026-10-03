import { defineModel, fields } from '@moonwitness/orm';
import type { Transaction } from 'objection';
import { User } from './user.js';

export const AccessGroup = defineModel('base.access_group', {
  table: 'access_groups',
  order: 'name asc',
  fields: {
    code: fields.string({ required: true, unique: true }),
    name: fields.string({ required: true }),
    description: fields.text(),
  },
});

/** Connects a user to a reusable access group. */
export const GroupMembership = defineModel('base.group_membership', {
  table: 'group_memberships',
  order: 'id asc',
  unique: [['user', 'group']],
  fields: {
    user: fields.belongsTo(User, { required: true }),
    group: fields.belongsTo(AccessGroup, { required: true }),
  },
});

/** Per-model grants; system and superadmin roles retain their existing behavior. */
export const ModelAccess = defineModel('base.model_access', {
  table: 'model_access',
  order: 'model_name asc',
  unique: [['group', 'model_name']],
  fields: {
    group: fields.belongsTo(AccessGroup, { required: true }),
    model_name: fields.string({
      required: true,
      pattern: '^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$',
    }),
    read: fields.boolean({ required: true, default: false }),
    create: fields.boolean({ required: true, default: false }),
    write: fields.boolean({ required: true, default: false }),
    unlink: fields.boolean({ required: true, default: false }),
  },
});

export async function assignDefaultUserGroup(userId: number, transaction?: Transaction) {
  const group = await AccessGroup.query(transaction).findOne({ code: 'user' });
  if (!group) throw new Error('Default user access group is missing');
  const membership = await GroupMembership.query(transaction)
    .where({ user_id: userId, group_id: group.id })
    .first();
  if (!membership) {
    await GroupMembership.query(transaction).insert({ user_id: userId, group_id: group.id });
  }
}
