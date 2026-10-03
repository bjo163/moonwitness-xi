import { defineModel, fields } from '@moonwitness/orm';

export const Currency = defineModel('base.currency', {
  table: 'currencies',
  order: 'code asc',
  fields: {
    code: fields.string({
      required: true,
      unique: true,
      label: 'ISO Alpha-3 Code',
      pattern: '^[A-Z]{3}$',
    }),
    name: fields.string({ required: true, unique: true }),
    symbol: fields.string(),
  },
});
