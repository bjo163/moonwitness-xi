import { defineModel, fields } from '@moonwitness/orm';

export const Partner = defineModel('base.partner', {
  table: 'partners',
  order: 'name asc',
  fields: {
    name: fields.string({ required: true }),
    email: fields.string({ unique: true }),
    phone: fields.string(),
    company: fields.string(),
  },
});
