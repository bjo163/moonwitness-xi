import { defineModel, fields } from '@moonwitness/orm';
import { Country } from './country.js';
import { Currency } from './currency.js';
import { Language } from './language.js';

export const Company = defineModel('base.company', {
  table: 'companies',
  order: 'name asc',
  fields: {
    name: fields.string({ required: true, unique: true }),
    email: fields.string({ unique: true }),
    phone: fields.string(),
    website: fields.string(),
    street: fields.string(),
    city: fields.string(),
    postal_code: fields.string(),
    country: fields.belongsTo(Country),
    currency: fields.belongsTo(Currency),
    language: fields.belongsTo(Language),
    timezone: fields.string({
      required: true,
      default: 'UTC',
      pattern: '^(?:UTC|[A-Za-z_+-]+(?:/[A-Za-z0-9_+-]+)+)$',
    }),
  },
});
