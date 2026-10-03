import { ref, seed } from '@moonwitness/orm';
import { Partner, PartnerAddress, PartnerCategory, PartnerCategoryLink } from './models/partner.js';
import { Company } from './models/company.js';
import { User } from './models/user.js';
import { Country } from './models/country.js';
import { Currency } from './models/currency.js';
import { Language } from './models/language.js';
import { countries } from './countries.js';
import { AccessGroup, GroupMembership, ModelAccess } from './models/access-group.js';
import { Tag, TagLink } from './models/tag.js';
import { Attachment } from './models/attachment.js';
import { Activity } from './models/activity.js';
import { Sequence } from './models/sequence.js';
import { CompanyMembership } from './models/company-membership.js';

export const data = [
  ...countries.map(({ code, name }) =>
    seed(Country, `base.country_${code.toLowerCase()}`, { code, name })
  ),
  seed(Currency, 'base.currency_usd', { code: 'USD', name: 'US Dollar', symbol: '$' }),
  seed(Language, 'base.language_en_us', { code: 'en-US', name: 'English (US)' }),
  seed(Company, 'base.company_default', {
    name: 'MoonWitness',
    email: 'company@moonwitness.local',
    website: 'https://moonwitness.local',
    country: ref('base.country_us'),
    currency: ref('base.currency_usd'),
    language: ref('base.language_en_us'),
    timezone: 'UTC',
  }),
  seed(Partner, 'base.partner_system', {
    name: 'System User',
    email: 'system@moonwitness.local',
    company: ref('base.company_default'),
  }),
  seed(Partner, 'base.partner_superadmin', {
    name: 'Super Administrator',
    email: 'superadmin@moonwitness.local',
    company: ref('base.company_default'),
  }),
  seed(Partner, 'base.partner_acme', {
    name: 'Acme Studio',
    email: 'hello@acme.local',
  }),
  seed(Partner, 'base.partner_northstar', {
    name: 'Northstar Labs',
    email: 'contact@northstar.local',
  }),
  seed(Partner, 'base.partner_meridian', {
    name: 'Meridian Works',
    email: 'team@meridian.local',
  }),
  seed(Partner, 'base.partner_bluebird', {
    name: 'Bluebird Market',
    email: 'support@bluebird.local',
  }),
  seed(Partner, 'base.partner_cedar', {
    name: 'Cedar House',
    email: 'hello@cedar.local',
  }),
  seed(Partner, 'base.partner_kite', {
    name: 'Kite and Co',
    email: 'contact@kite.local',
  }),
  seed(Partner, 'base.partner_openfield', {
    name: 'Open Field',
    email: 'team@openfield.local',
  }),
  seed(Partner, 'base.partner_riverstone', {
    name: 'Riverstone Group',
    email: 'info@riverstone.local',
  }),
  seed(PartnerCategory, 'base.partner_category_customer', {
    code: 'customer',
    name: 'Customer',
    color: '#2563EB',
    description: 'Organizations or people that purchase products or services.',
  }),
  seed(PartnerCategory, 'base.partner_category_vendor', {
    code: 'vendor',
    name: 'Vendor',
    color: '#16A34A',
    description: 'Organizations that provide products or services.',
  }),
  seed(PartnerCategoryLink, 'base.partner_category_acme_customer', {
    partner: ref('base.partner_acme'),
    category: ref('base.partner_category_customer'),
  }),
  seed(PartnerCategoryLink, 'base.partner_category_northstar_vendor', {
    partner: ref('base.partner_northstar'),
    category: ref('base.partner_category_vendor'),
  }),
  seed(PartnerAddress, 'base.partner_address_acme_headquarters', {
    partner: ref('base.partner_acme'),
    label: 'Headquarters',
    address_type: 'contact',
    street: '123 Market Street',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94105',
    country: ref('base.country_us'),
    is_primary: true,
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
  seed(AccessGroup, 'base.group_system', {
    code: 'system',
    name: 'System',
    description: 'Built-in full access role.',
  }),
  seed(AccessGroup, 'base.group_superadmin', {
    code: 'superadmin',
    name: 'Super Administrator',
    description: 'Built-in administration role.',
  }),
  seed(AccessGroup, 'base.group_user', {
    code: 'user',
    name: 'User',
    description: 'Default group for registered users.',
  }),
  seed(Tag, 'base.tag_customer', {
    name: 'Customer',
    color: '#2563EB',
    description: 'Example tag for customer records.',
  }),
  seed(TagLink, 'base.tag_link_acme_customer', {
    tag: ref('base.tag_customer'),
    resource_model: Partner.modelName,
    resource_id: 3,
  }),
  seed(Attachment, 'base.attachment_acme_proposal', {
    name: 'acme-proposal.pdf',
    resource_model: Partner.modelName,
    resource_id: 3,
    mimetype: 'application/pdf',
    size_bytes: 0,
    storage_key: 'examples/acme-proposal.pdf',
    checksum: '0000000000000000000000000000000000000000000000000000000000000000',
  }),
  seed(Activity, 'base.activity_acme_follow_up', {
    summary: 'Example: follow up with Acme Studio',
    activity_type: 'call',
    state: 'planned',
    deadline: '2099-12-31',
    note: 'Seed example only; update or remove when using real activity data.',
    assigned_to: ref('base.user_superadmin'),
    resource_model: Partner.modelName,
    resource_id: 3,
  }),
  seed(Sequence, 'base.sequence_sales_order', {
    code: 'sales.order',
    prefix: 'SO-',
    padding: 4,
    next_number: 1,
  }),
  seed(GroupMembership, 'base.membership_superadmin', {
    user: ref('base.user_superadmin'),
    group: ref('base.group_superadmin'),
  }),
  seed(CompanyMembership, 'base.company_membership_superadmin_default', {
    user: ref('base.user_superadmin'),
    company: ref('base.company_default'),
    is_default: true,
  }),
  seed(CompanyMembership, 'base.company_membership_system_default', {
    user: ref('base.user_system'),
    company: ref('base.company_default'),
    is_default: true,
  }),
  seed(ModelAccess, 'base.access_user_partner_read', {
    group: ref('base.group_user'),
    model_name: Partner.modelName,
    read: true,
    create: false,
    write: false,
    unlink: false,
  }),
];
