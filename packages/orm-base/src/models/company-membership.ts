import { defineModel, fields } from '@moonwitness/orm';
import type { Transaction } from 'objection';
import { Company } from './company.js';
import { User } from './user.js';

/** A user's explicit access to a company; request headers never grant membership. */
export const CompanyMembership = defineModel('base.company_membership', {
  table: 'company_memberships',
  order: 'user_id asc, is_default desc, company_id asc',
  unique: [['user', 'company']],
  fields: {
    user: fields.belongsTo(User, { required: true }),
    company: fields.belongsTo(Company, { required: true }),
    is_default: fields.boolean({ required: true, default: false }),
  },
});

export async function assignDefaultCompanyMembership(userId: number, transaction?: Transaction) {
  const existing = await CompanyMembership.query(transaction).where({ user_id: userId }).first();
  if (existing) return existing;
  const user = await User.query(transaction).findById(userId).withGraphFetched('partner');
  if (!user) throw new Error(`User ${userId} does not exist`);
  const company = user.partner?.company_id
    ? await Company.query(transaction).where({ id: user.partner.company_id, active: true }).first()
    : await Company.query(transaction).where({ active: true }).orderBy('id', 'asc').first();
  if (!company) throw new Error('An active company is required to assign a user membership');
  return CompanyMembership.query(transaction).insertAndFetch({
    user_id: userId,
    company_id: company.id,
    is_default: true,
  });
}
