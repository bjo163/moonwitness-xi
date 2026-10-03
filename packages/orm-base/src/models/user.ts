import { defineModel, fields } from '@moonwitness/orm';
import { Partner } from './partner.js';

export const User = defineModel('base.user', {
  table: 'users',
  order: 'login asc',
  fields: {
    login: fields.string({ required: true, unique: true }),
    password: fields.password(),
    partner: fields.belongsTo(Partner, { required: true, unique: true }),
    role: fields.enum(['system', 'superadmin', 'user'], { required: true, default: 'user' }),
  },
});

/** Initialize only the seeded superadmin whose password has never been set. */
export async function initializeSuperadminPassword(password: string | undefined): Promise<void> {
  if (!password) return;
  const identity = User.knex()('_orm_data')
    .select('record_id')
    .where({ id: 'base.user_superadmin', model: User.modelName });
  const user = await User.query().whereIn('id', identity).whereNull('password').first();
  if (!user) return;
  await User.query().findById(user.id).whereNull('password').patch({ password });
}
