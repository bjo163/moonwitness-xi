import { defineModel, fields } from '@moonwitness/orm';
import { Company, Currency, Partner } from '@moonwitness/orm-base';

/** A deliberately small business record; approval state lives in the reusable workflow engine. */
export const PurchaseRequest = defineModel('request.purchase', {
  table: 'purchase_requests',
  order: 'create_date desc, id desc',
  fields: {
    title: fields.string({ required: true, label: 'Request' }),
    description: fields.text({ required: true, label: 'Business reason' }),
    amount_minor: fields.integer({ required: true, label: 'Amount in minor units' }),
    currency: fields.belongsTo(Currency, { required: true, label: 'Currency' }),
    company: fields.belongsTo(Company, { required: true, label: 'Company' }),
    vendor: fields.belongsTo(Partner, { label: 'Suggested vendor' }),
  },
});
