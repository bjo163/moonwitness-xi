import { defineView } from '@moonwitness/orm';
import { PurchaseRequest } from './models.js';

export const views = [
  defineView(PurchaseRequest, {
    title: 'Purchase Requests',
    list: {
      columns: ['title', 'amount_minor', 'currency', 'vendor', 'create_date'],
      order: 'create_date desc',
    },
    form: {
      sections: [
        {
          title: 'Request details',
          fields: ['title', 'description', 'amount_minor', 'currency', 'company', 'vendor'],
        },
      ],
    },
    search: { fields: ['title', 'description'] },
  }),
];
