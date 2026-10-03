import { ref, seed } from '@moonwitness/orm';
import { Partner } from './models/partner.js';
import { User } from './models/user.js';

export const data = [
  seed(Partner, 'base.partner_system', {
    name: 'System User',
    email: 'system@moonwitness.local',
    company: 'MoonWitness',
  }),
  seed(Partner, 'base.partner_superadmin', {
    name: 'Super Administrator',
    email: 'superadmin@moonwitness.local',
    company: 'MoonWitness',
  }),
  seed(Partner, 'base.partner_acme', {
    name: 'Acme Studio',
    email: 'hello@acme.local',
    company: 'Acme Studio',
  }),
  seed(Partner, 'base.partner_northstar', {
    name: 'Northstar Labs',
    email: 'contact@northstar.local',
    company: 'Northstar Labs',
  }),
  seed(Partner, 'base.partner_meridian', {
    name: 'Meridian Works',
    email: 'team@meridian.local',
    company: 'Meridian Works',
  }),
  seed(Partner, 'base.partner_bluebird', {
    name: 'Bluebird Market',
    email: 'support@bluebird.local',
    company: 'Bluebird Market',
  }),
  seed(Partner, 'base.partner_cedar', {
    name: 'Cedar House',
    email: 'hello@cedar.local',
    company: 'Cedar House',
  }),
  seed(Partner, 'base.partner_kite', {
    name: 'Kite and Co',
    email: 'contact@kite.local',
    company: 'Kite and Co',
  }),
  seed(Partner, 'base.partner_openfield', {
    name: 'Open Field',
    email: 'team@openfield.local',
    company: 'Open Field',
  }),
  seed(Partner, 'base.partner_riverstone', {
    name: 'Riverstone Group',
    email: 'info@riverstone.local',
    company: 'Riverstone Group',
  }),
  seed(User, 'base.user_system', {
    login: 'system',
    role: 'system',
    partner: ref('base.partner_system'),
  }),
  seed(User, 'base.user_superadmin', {
    login: 'superadmin',
    role: 'superadmin',
    partner: ref('base.partner_superadmin'),
  }),
];
