import type { Knex } from 'knex';

const REQUIRED_MODELS = ['base.user', 'base.partner', 'base.company'] as const;
const DEFAULT_USERS = [
  { externalId: 'base.user_system', role: 'system' },
  { externalId: 'base.user_superadmin', role: 'superadmin' },
] as const;

type DefaultUser = {
  role: string;
  partner_id: number | null;
  active: boolean | number;
  password: string | null;
};

export async function verifyDefaultBaseAccounts(db: Knex, requireAdminPassword: boolean) {
  const identities = await db('_orm_data')
    .select('id', 'record_id')
    .where({ model: 'base.user' })
    .whereIn(
      'id',
      DEFAULT_USERS.map(({ externalId }) => externalId)
    );
  const recordIds = new Map(identities.map(({ id, record_id }) => [String(id), Number(record_id)]));

  for (const expected of DEFAULT_USERS) {
    const recordId = recordIds.get(expected.externalId);
    if (recordId === undefined) {
      throw new Error(`Required default account '${expected.externalId}' is missing`);
    }
    const user = (await db('users')
      .select('role', 'partner_id', 'active', 'password')
      .where({ id: recordId })
      .first()) as DefaultUser | undefined;
    if (!user || user.role !== expected.role || !user.partner_id) {
      throw new Error(`Required default account '${expected.externalId}' is inconsistent`);
    }
    if (user.active === false || user.active === 0) {
      throw new Error(`Required default account '${expected.externalId}' is inactive`);
    }
    const partner = await db('partners')
      .select('id', 'active')
      .where({ id: user.partner_id })
      .first();
    if (!partner || partner.active === false || partner.active === 0) {
      throw new Error(`Required default account '${expected.externalId}' has no active partner`);
    }
    if (requireAdminPassword && expected.role === 'superadmin' && !user.password) {
      throw new Error(
        'The seeded superadmin has no password; set SUPERADMIN_PASSWORD in the repository .env and restart.'
      );
    }
  }
}

export function verifyRequiredModels(registeredModels: readonly string[]): void {
  const missing = REQUIRED_MODELS.filter((model) => !registeredModels.includes(model));
  if (missing.length > 0) {
    throw new Error(`Required base addon models are missing: ${missing.join(', ')}`);
  }
}
