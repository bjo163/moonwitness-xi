import { defineModel, fields } from '@moonwitness/orm';
import { Partner } from './partner.js';
import { Language } from './language.js';

export const User = defineModel('base.user', {
  table: 'users',
  order: 'login asc',
  fields: {
    login: fields.string({ required: true, unique: true, label: 'Login' }),
    password: fields.password({ label: 'Password', help: 'Leave empty to keep the current one' }),
    partner: fields.belongsTo(Partner, { required: true, unique: true, label: 'Contact' }),
    language: fields.belongsTo(Language, { label: 'Preferred Language' }),
    timezone: fields.string({
      label: 'Preferred Timezone',
      pattern: '^(?:UTC|[A-Za-z_+-]+(?:/[A-Za-z0-9_+-]+)+)$',
    }),
    role: fields.enum(['system', 'superadmin', 'user'], {
      required: true,
      default: 'user',
      label: 'Role',
    }),
  },
});

export interface UserPreferences {
  language: string;
  timezone: string;
}

/** Resolve user overrides, then company defaults, then stable application defaults. */
export async function resolveUserPreferences(userId: number): Promise<UserPreferences> {
  const user = await User.query()
    .findById(userId)
    .withGraphFetched('[language, partner.company.language]')
    .throwIfNotFound();
  return {
    language: user.language?.code ?? user.partner?.company?.language?.code ?? 'en-US',
    timezone: user.timezone || user.partner?.company?.timezone || 'UTC',
  };
}

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

/** Replace the seeded superadmin password after an explicit administrative reset. */
export async function resetSuperadminPassword(password: string): Promise<void> {
  if (password.length < 6 || password.length > 1024) {
    throw new Error('Superadmin password must be between 6 and 1024 characters');
  }
  const identity = User.knex()('_orm_data')
    .select('record_id')
    .where({ id: 'base.user_superadmin', model: User.modelName });
  const user = await User.query().whereIn('id', identity).first();
  if (!user) throw new Error('Seeded superadmin account was not found');
  await User.query().findById(user.id).patch({ password });
}
