import { defineAddon, defineView, ref, seed } from '@moonwitness/orm';
import { ModelAccess } from '@moonwitness/orm-base';
import { WebhookDelivery, WebhookEndpoint } from './models.js';

const adminModels = [WebhookEndpoint, WebhookDelivery] as const;

export const manifest = defineAddon({
  name: 'orm-integration',
  version: '1.0.0',
  depends: ['base', 'jobs'],
  models: [...adminModels],
  data: [
    seed(WebhookEndpoint, 'orm-integration.endpoint_example_disabled', {
      company: ref('base.company_default'),
      name: 'Example disabled webhook',
      url: 'https://example.invalid/moonwitness-webhook',
      event_types: '["base.partner.updated"]',
      secret_ref: 'MW_WEBHOOK_SECRET_C1_EXAMPLE',
      enabled: false,
    }),
    ...adminModels.map((model) =>
      seed(
        ModelAccess,
        `orm-integration.access_superadmin_${model.modelName.replaceAll('.', '_')}`,
        {
          group: ref('base.group_superadmin'),
          model_name: model.modelName,
          read: true,
          create: true,
          write: true,
          unlink: true,
        }
      )
    ),
  ],
  views: [
    defineView(WebhookEndpoint, {
      title: 'Webhook Endpoints',
      list: { columns: ['name', 'company', 'enabled'], order: 'name asc' },
      form: {
        sections: [
          {
            title: 'Endpoint',
            fields: ['name', 'company', 'url', 'event_types', 'secret_ref', 'enabled'],
          },
        ],
      },
      search: { fields: ['name'] },
    }),
    defineView(WebhookDelivery, {
      title: 'Webhook Deliveries',
      list: {
        columns: ['endpoint', 'company', 'event_type', 'status', 'attempts', 'response_status'],
      },
      form: {
        sections: [
          {
            title: 'Delivery',
            fields: [
              'endpoint',
              'company',
              'event_type',
              'status',
              'attempts',
              'response_status',
              'delivered_at',
            ],
          },
        ],
      },
      search: { fields: ['event_type'] },
    }),
  ],
  menus: [
    {
      model: WebhookEndpoint.modelName,
      label: 'Webhook Endpoints',
      group: 'Technical',
      sequence: 490,
      developmentOnly: true,
    },
    {
      model: WebhookDelivery.modelName,
      label: 'Webhook Deliveries',
      group: 'Technical',
      sequence: 491,
      developmentOnly: true,
    },
  ],
});
