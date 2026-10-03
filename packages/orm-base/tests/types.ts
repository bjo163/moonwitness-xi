import { fields, ref, seed } from '@moonwitness/orm';
import { Partner, User } from '../src/index.js';

// Compile-time contracts: invalid declarations must fail without falling back to broad types.
function contracts(user: InstanceType<typeof User>, partner: InstanceType<typeof Partner>) {
  const login: string = user.login;
  const role: 'system' | 'superadmin' | 'user' = user.role;
  const profileId: number = user.partner_id;
  const name: string | undefined = user.partner?.name;
  const email: string | null | undefined = partner.email;
  // @ts-expect-error roles are a closed union
  user.role = 'root';
  // @ts-expect-error user profiles live on Partner
  user.email = 'duplicate@example.test';
  // @ts-expect-error required field name is missing
  seed(Partner, 'invalid.partner', { email: 'missing@example.test' });
  // @ts-expect-error login must be a string
  seed(User, 'invalid.user', { login: 42 });
  // @ts-expect-error seed roles also use the closed union
  seed(User, 'invalid.role', { login: 'bad', role: 'root', partner: ref('base.partner_system') });
  // @ts-expect-error enum defaults must be one of the declared values
  fields.enum(['system', 'user'], { default: 'root' });
  return { login, role, profileId, name, email };
}
void contracts;
