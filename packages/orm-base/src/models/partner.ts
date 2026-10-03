import { defineModel, fields, type BaseModel } from '@moonwitness/orm';
import { Company } from './company.js';
import { Country } from './country.js';
import { CountryState } from './country-state.js';

function parentPartnerModel(): typeof BaseModel {
  return Partner;
}

export const Partner = defineModel('base.partner', {
  table: 'partners',
  order: 'name asc',
  fields: {
    name: fields.string({ required: true, label: 'Name' }),
    is_company: fields.boolean({ default: false, label: 'Is a Company' }),
    parent: fields.belongsTo(parentPartnerModel, { label: 'Parent Company' }),
    job_title: fields.string({ label: 'Job Position' }),
    vat: fields.string({ label: 'Tax ID / NPWP / VAT' }),
    email: fields.string({ unique: true, label: 'Email' }),
    phone: fields.string({ label: 'Phone' }),
    mobile: fields.string({ label: 'Mobile' }),
    website: fields.string({ label: 'Website' }),
    street: fields.string({ label: 'Street' }),
    city: fields.string({ label: 'City' }),
    state: fields.belongsTo(CountryState, { label: 'State / Province' }),
    postal_code: fields.string({ label: 'Postal Code' }),
    country: fields.belongsTo(Country, { label: 'Country' }),
    company: fields.belongsTo(Company, { label: 'Company' }),
    is_customer: fields.boolean({ default: true, label: 'Is Customer' }),
    is_supplier: fields.boolean({ default: false, label: 'Is Vendor' }),
    notes: fields.text({ label: 'Internal Notes' }),
  },
});

export const PartnerCategory = defineModel('base.partner_category', {
  table: 'partner_categories',
  order: 'name asc',
  fields: {
    code: fields.string({ required: true, unique: true, label: 'Code' }),
    name: fields.string({ required: true, label: 'Name' }),
    color: fields.string({ pattern: '^#[0-9A-Fa-f]{6}$', default: '#64748B', label: 'Color' }),
    description: fields.text({ label: 'Description' }),
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
    partner: fields.belongsTo(Partner, { required: true, label: 'Partner' }),
    label: fields.string({ required: true, label: 'Label' }),
    address_type: fields.enum(['contact', 'invoice', 'delivery', 'other'], {
      required: true,
      default: 'other',
      label: 'Address Type',
    }),
    street: fields.string({ required: true, label: 'Street' }),
    street2: fields.string({ label: 'Street 2' }),
    city: fields.string({ required: true, label: 'City' }),
    state: fields.belongsTo(CountryState, { label: 'State / Province' }),
    postal_code: fields.string({ label: 'Postal Code' }),
    country: fields.belongsTo(Country, { label: 'Country' }),
    is_primary: fields.boolean({ required: true, default: false, label: 'Primary Address' }),
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
  children: {
    relation: Partner.HasManyRelation,
    modelClass: Partner,
    join: { from: 'partners.id', to: 'partners.parent_id' },
  },
};
