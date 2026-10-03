import { defineModel, fields } from '@moonwitness/orm';
import { Company } from './company.js';
import { Country } from './country.js';

export const Partner = defineModel('base.partner', {
  table: 'partners',
  order: 'name asc',
  fields: {
    name: fields.string({ required: true }),
    email: fields.string({ unique: true }),
    phone: fields.string(),
    street: fields.string(),
    city: fields.string(),
    postal_code: fields.string(),
    company: fields.belongsTo(Company),
    country: fields.belongsTo(Country),
  },
});

export const PartnerCategory = defineModel('base.partner_category', {
  table: 'partner_categories',
  order: 'name asc',
  fields: {
    code: fields.string({ required: true, unique: true }),
    name: fields.string({ required: true }),
    color: fields.string({ pattern: '^#[0-9A-Fa-f]{6}$', default: '#64748B' }),
    description: fields.text(),
  },
});

export const PartnerCategoryLink = defineModel('base.partner_category_link', {
  table: 'partner_category_links',
  order: 'id asc',
  unique: [['partner', 'category']],
  fields: {
    partner: fields.belongsTo(Partner, { required: true }),
    category: fields.belongsTo(PartnerCategory, { required: true }),
  },
});

export const PartnerAddress = defineModel('base.partner_address', {
  table: 'partner_addresses',
  order: 'is_primary desc, id asc',
  fields: {
    partner: fields.belongsTo(Partner, { required: true }),
    label: fields.string({ required: true }),
    address_type: fields.enum(['contact', 'invoice', 'delivery', 'other'], {
      required: true,
      default: 'other',
    }),
    street: fields.string({ required: true }),
    street2: fields.string(),
    city: fields.string({ required: true }),
    state: fields.string(),
    postal_code: fields.string(),
    country: fields.belongsTo(Country),
    is_primary: fields.boolean({ required: true, default: false }),
  },
});

Partner.relationMappings = {
  ...Partner.relationMappings,
  addresses: {
    relation: Partner.HasManyRelation,
    modelClass: PartnerAddress,
    join: { from: 'partners.id', to: 'partner_addresses.partner_id' },
  },
  category_links: {
    relation: Partner.HasManyRelation,
    modelClass: PartnerCategoryLink,
    join: { from: 'partners.id', to: 'partner_category_links.partner_id' },
  },
};
