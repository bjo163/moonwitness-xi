import { defineAddon, defineModel, fields, seed } from '@moonwitness/orm';

export const Order = defineModel('sales.order', {
  fields: {
    name: fields.string({ required: true, unique: true }),
    state: fields.enum(['draft', 'confirmed'], { default: 'draft' }),
  },
});

export const manifest = defineAddon({
  name: 'sales',
  version: '1.0.0',
  depends: ['base'],
  models: [Order],
  data: [seed(Order, 'sales.order.example', { name: 'Example order' })],
});
