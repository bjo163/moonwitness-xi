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
    name: fields.string({ required: true, unique: true }),
  },
});
