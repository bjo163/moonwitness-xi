import { defineModel, fields } from '@moonwitness/orm';
import { Company, User } from '@moonwitness/orm-base';

export const NotificationTemplate = defineModel('notification.template', {
  table: 'notification_templates',
  order: 'code asc',
  fields: {
    code: fields.string({ required: true, unique: true, pattern: '^[a-z][a-z0-9_.-]{2,127}$' }),
    channel: fields.enum(['in_app', 'email'], { required: true, default: 'in_app' }),
    locale: fields.string({ required: true, default: 'en' }),
    title: fields.string({ required: true }),
    body: fields.text({ required: true }),
  },
});

export const NotificationPreference = defineModel('notification.preference', {
  table: 'notification_preferences',
  order: 'user_id asc, company_id asc, channel asc',
  unique: [['user', 'company', 'channel']],
  fields: {
    user: fields.belongsTo(User, { required: true }),
    company: fields.belongsTo(Company, { required: true }),
    channel: fields.enum(['in_app', 'email'], { required: true }),
    enabled: fields.boolean({ required: true, default: true }),
  },
});

export const Notification = defineModel('notification.notification', {
  table: 'notifications',
  order: 'create_date desc, id desc',
  fields: {
    recipient: fields.belongsTo(User, { required: true }),
    company: fields.belongsTo(Company, { required: true }),
    template: fields.belongsTo(NotificationTemplate, { required: true }),
    channel: fields.enum(['in_app', 'email'], { required: true }),
    title: fields.string({ required: true }),
    body: fields.text({ required: true }),
    delivery_status: fields.enum(['delivered', 'suppressed'], { required: true }),
    state: fields.enum(['unread', 'read', 'archived'], { required: true, default: 'unread' }),
    idempotency_key: fields.string({ required: true, unique: true, hidden: true }),
    resource_model: fields.string({
      pattern: '^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$',
    }),
    resource_id: fields.integer(),
    delivered_at: fields.string(),
    read_at: fields.string(),
  },
});
