import { defineModel, fields } from '@moonwitness/orm';

export const Language = defineModel('base.language', {
  table: 'languages',
  order: 'code asc',
  fields: {
    code: fields.string({
      required: true,
      unique: true,
      label: 'BCP 47 Code',
      pattern: '^(?:[A-Za-z]{2,8}|x)(?:-[A-Za-z0-9]{1,8})*$',
    }),
    name: fields.string({ required: true, unique: true }),
  },
});
