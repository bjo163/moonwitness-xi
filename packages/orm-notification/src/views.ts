import { defineView } from '@moonwitness/orm';
import { Notification, NotificationPreference, NotificationTemplate } from './models.js';

export const views = [
  defineView(Notification, {
    title: 'Notifications',
    list: {
      columns: ['title', 'channel', 'delivery_status', 'state', 'delivered_at'],
      order: 'create_date desc, id desc',
    },
    form: {
      sections: [
        { title: 'Message', fields: ['title', 'body', 'template', 'channel'] },
        { title: 'Delivery', fields: ['delivery_status', 'state', 'delivered_at', 'read_at'] },
        { title: 'Source', fields: ['resource_model', 'resource_id'] },
      ],
    },
    search: {
      fields: ['title', 'body'],
      filters: [{ label: 'Unread', domain: [['state', '=', 'unread']] }],
    },
  }),
  defineView(NotificationPreference, {
    title: 'Notification Preferences',
    list: { columns: ['company', 'channel', 'enabled'], order: 'channel asc' },
    form: {
      sections: [{ title: 'Delivery preferences', fields: ['company', 'channel', 'enabled'] }],
    },
    search: { fields: ['channel'] },
  }),
  defineView(NotificationTemplate, {
    title: 'Notification Templates',
    list: { columns: ['code', 'channel', 'locale', 'title'], order: 'code asc' },
    form: {
      sections: [{ title: 'Template', fields: ['code', 'channel', 'locale', 'title', 'body'] }],
    },
    search: { fields: ['code', 'title', 'body'] },
  }),
];
