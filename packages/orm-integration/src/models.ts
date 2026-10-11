import { defineModel, fields } from '@moonwitness/orm';
import { Company } from '@moonwitness/orm-base';

export const WebhookEndpoint = defineModel('integration.webhook_endpoint', {
  table: 'integration_webhook_endpoints',
  order: 'name asc, id asc',
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    name: fields.string({ required: true }),
    url: fields.string({ required: true }),
    event_types: fields.text({ required: true, default: '[]' }),
    secret_ref: fields.string({
      required: true,
      pattern: '^MW_WEBHOOK_SECRET_C[1-9][0-9]*_[A-Z0-9_]{1,100}$',
      help: 'Company-specific environment variable name only; secret material is never stored here.',
    }),
    enabled: fields.boolean({ required: true, default: false }),
  },
});

export const WebhookDelivery = defineModel('integration.webhook_delivery', {
  table: 'integration_webhook_deliveries',
  order: 'create_date desc, id desc',
  unique: [['endpoint', 'outbox_event_id']],
  fields: {
    endpoint: fields.belongsTo(WebhookEndpoint, { required: true }),
    company: fields.belongsTo(Company, { required: true }),
    outbox_event_id: fields.integer({ required: true, hidden: true }),
    event_type: fields.string({ required: true }),
    status: fields.enum(['delivered', 'retrying', 'dead'], { required: true }),
    attempts: fields.integer({ required: true, default: 0 }),
    response_status: fields.integer(),
    last_error_code: fields.string({ hidden: true }),
    delivered_at: fields.string(),
  },
});
