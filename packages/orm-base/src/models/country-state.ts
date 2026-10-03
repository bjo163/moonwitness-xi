import { defineModel, fields } from '@moonwitness/orm';
import { Country } from './country.js';

export const CountryState = defineModel('base.country_state', {
  table: 'country_states',
  order: 'name asc',
  unique: [['country', 'code']],
  fields: {
    code: fields.string({ required: true, label: 'State Code' }),
    name: fields.string({ required: true, label: 'State / Province Name' }),
    country: fields.belongsTo(Country, { required: true, label: 'Country' }),
    type: fields.string({ label: 'Subdivision Type' }),
  },
});
