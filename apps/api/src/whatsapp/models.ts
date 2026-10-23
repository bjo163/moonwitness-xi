import { defineModel, fields } from '@moonwitness/orm';
import { Company } from '@moonwitness/orm-base';

export const WhatsappAccount = defineModel('whatsapp.account', {
  table: 'whatsapp_accounts',
  order: 'id asc',
  unique: [['company']],
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    status: fields.enum(
      ['disconnected', 'connecting', 'qr', 'connected', 'reconnecting', 'error'],
      { required: true, default: 'disconnected' }
    ),
    phone_number: fields.string(),
    qr_code: fields.text({ hidden: true, sensitive: true }),
    last_error: fields.string(),
    auth_state: fields.text({ hidden: true, sensitive: true }),
  },
});

export const WhatsappConversation = defineModel('whatsapp.conversation', {
  table: 'whatsapp_conversations',
  order: 'last_message_at desc, id desc',
  unique: [['company', 'jid']],
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    account: fields.belongsTo(WhatsappAccount, { required: true }),
    jid: fields.string({ required: true }),
    name: fields.string({ required: true }),
    is_group: fields.boolean({ required: true, default: false }),
    unread_count: fields.integer({ required: true, default: 0 }),
    last_message: fields.text(),
    last_message_at: fields.string(),
  },
});

export const WhatsappMessage = defineModel('whatsapp.message', {
  table: 'whatsapp_messages',
  order: 'create_date desc, id desc',
  unique: [['company', 'external_id']],
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    account: fields.belongsTo(WhatsappAccount, { required: true }),
    conversation: fields.belongsTo(WhatsappConversation, { required: true }),
    external_id: fields.string({ required: true }),
    direction: fields.enum(['inbound', 'outbound'], { required: true }),
    message_type: fields.enum(['text', 'image', 'video', 'audio', 'document', 'sticker'], {
      required: true,
      default: 'text',
    }),
    content: fields.text(),
    status: fields.enum(['received', 'queued', 'sent', 'delivered', 'read', 'failed'], {
      required: true,
      default: 'received',
    }),
    media_key: fields.string({ hidden: true, sensitive: true }),
    media_mime_type: fields.string(),
    media_file_name: fields.string(),
    sender_jid: fields.string(),
  },
});

export const WhatsappJob = defineModel('whatsapp.job', {
  table: 'whatsapp_jobs',
  order: 'create_date asc, id asc',
  fields: {
    company: fields.belongsTo(Company, { required: true }),
    account: fields.belongsTo(WhatsappAccount, { required: true }),
    message: fields.belongsTo(WhatsappMessage, { required: true }),
    recipient_jid: fields.string({ required: true }),
    payload: fields.text({ required: true, default: '{}', hidden: true, sensitive: true }),
    status: fields.enum(['pending', 'processing', 'done', 'retry', 'dead'], {
      required: true,
      default: 'pending',
    }),
    attempts: fields.integer({ required: true, default: 0 }),
    available_at: fields.string({ required: true }),
    last_error: fields.string(),
  },
});
