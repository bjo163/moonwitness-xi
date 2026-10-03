import { defineModel, fields } from '@moonwitness/orm';

export const Country = defineModel('base.country', {
  table: 'countries',
  order: 'name asc',
  fields: {
    code: fields.string({
      required: true,
      unique: true,
      label: 'ISO Alpha-2 Code',
      pattern: '^[A-Z]{2}$',
    }),
    name: fields.string({ required: true, unique: true, label: 'Country Name' }),
    phone_code: fields.string({ label: 'Calling Code' }),
    code_alpha3: fields.string({ label: 'ISO Alpha-3 Code', pattern: '^[A-Z]{3}$' }),
    vat_label: fields.string({ label: 'Tax ID Label (e.g. NPWP, VAT, EIN)' }),
  },
});
