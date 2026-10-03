import { defineModel, fields } from '@moonwitness/orm';
import { Country } from './country.js';
import { Currency } from './currency.js';
import { Company } from './company.js';
import { Partner } from './partner.js';

export const Bank = defineModel('base.bank', {
  table: 'banks',
  order: 'name asc',
  unique: [['bic'], ['country', 'code']],
  fields: {
    name: fields.string({ required: true, label: 'Bank Name' }),
    bic: fields.string({ label: 'Bank Identifier Code (BIC / SWIFT)' }),
    code: fields.string({ label: 'Bank Code' }),
    country: fields.belongsTo(Country, { label: 'Country' }),
    phone: fields.string({ label: 'Phone' }),
    website: fields.string({ label: 'Website' }),
  },
});

export const PartnerBank = defineModel('base.partner_bank', {
  table: 'partner_banks',
  order: 'is_primary desc, id desc',
  fields: {
    acc_number: fields.string({ required: true, label: 'Account Number' }),
    sanitized_acc_number: fields.string({ label: 'Sanitized Account Number' }),
    acc_holder_name: fields.string({ label: 'Account Holder Name' }),
    partner: fields.belongsTo(Partner, { required: true, label: 'Account Owner / Partner' }),
    bank: fields.belongsTo(Bank, { label: 'Bank' }),
    currency: fields.belongsTo(Currency, { label: 'Account Currency' }),
    company: fields.belongsTo(Company, { label: 'Company' }),
    is_primary: fields.boolean({ default: false, label: 'Primary Account' }),
  },
});
