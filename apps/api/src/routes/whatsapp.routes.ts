import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { AttachmentStorage } from '@moonwitness/orm-storage';
import { WhatsappAccount, WhatsappConversation, WhatsappMessage } from '../whatsapp/models.js';
import { isRecord } from '@moonwitness/types';

import { mediaType, safeMime } from '../whatsapp/media.js';
import { gowaBinary, gowaOriginPath, gowaRequest, GowaError } from '../whatsapp/gowa-client.js';

type Options = { attachmentStorage: AttachmentStorage };
type Params = { id: string };

function id(value: string): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function mediaDefaultMime(type: string): string | null {
  switch (type) {
    case 'image':
      return 'image/jpeg';
    case 'video':
      return 'video/mp4';
    case 'audio':
      return 'audio/ogg';
    case 'document':
      return 'application/octet-stream';
    default:
      return null;
  }
}
function requireCompany(
  req: { auth: { companyId?: number } | null },
  reply: { code: (n: number) => { send: (x: unknown) => unknown } }
): number | null {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    reply.code(req.auth ? 403 : 401).send({ success: false, error: 'Active company is required' });
    return null;
  }
  return companyId;
}

export const whatsappRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get('/whatsapp/account', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account)
      return { success: true, data: { status: 'disconnected', phone_number: null, qr_code: null } };
    let status = account.status;
    let phoneNumber = account.phone_number;
    let lastError = account.last_error;
    let qrCode: string | null = null;
    if (account.gateway_device_id) {
      try {
        const upstream = await gowaRequest<{
          is_connected?: boolean;
          is_logged_in?: boolean;
          jid?: string;
        }>(`/devices/${encodeURIComponent(account.gateway_device_id)}/status`);
        status = upstream.is_connected && upstream.is_logged_in ? 'connected' : 'reconnecting';
        phoneNumber = upstream.jid?.split('@')[0] ?? phoneNumber;
        if (status === 'connected') {
          lastError = null;
          await WhatsappAccount.query()
            .where({ id: account.id, company_id: companyId })
            .patch({ status, phone_number: phoneNumber, qr_code: null, last_error: null });
        } else if (account.qr_code) {
          const image = await gowaBinary(gowaOriginPath(account.qr_code));
          qrCode = `data:${image.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
          status = 'qr';
        } else {
          await WhatsappAccount.query()
            .where({ id: account.id, company_id: companyId })
            .patch({ status, phone_number: phoneNumber });
        }
      } catch (error) {
        if (!(error instanceof GowaError && error.statusCode === 404)) {
          status = 'error';
          await WhatsappAccount.query()
            .where({ id: account.id, company_id: companyId })
            .patch({
              status,
              last_error:
                error instanceof Error ? error.message.slice(0, 255) : 'Gateway unavailable',
            });
          lastError = error instanceof Error ? error.message.slice(0, 255) : 'Gateway unavailable';
        } else {
          status = 'disconnected';
          await WhatsappAccount.query()
            .where({ id: account.id, company_id: companyId })
            .patch({ status, qr_code: null, phone_number: null });
          phoneNumber = null;
          lastError = null;
        }
      }
    }
    return {
      success: true,
      data: {
        id: account.id,
        status,
        phone_number: phoneNumber,
        qr_code: qrCode,
        last_error: lastError,
      },
    };
  });

  app.post('/whatsapp/connect', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    await app
      .db('whatsapp_accounts')
      .insert({
        company_id: companyId,
        status: 'connecting',
      })
      .onConflict('company_id')
      .ignore();
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account) throw new Error('WhatsApp account could not be created');
    const deviceId = account.gateway_device_id || `moonwitness-company-${companyId}`;
    await WhatsappAccount.query().where({ id: account.id, company_id: companyId }).patch({
      gateway_device_id: deviceId,
      status: 'connecting',
      last_error: null,
      write_date: new Date().toISOString(),
    });
    try {
      try {
        await gowaRequest(`/devices/${encodeURIComponent(deviceId)}`);
      } catch (error) {
        if (!(error instanceof GowaError && error.statusCode === 404)) throw error;
        await gowaRequest('/devices', {
          method: 'POST',
          contentType: 'application/json',
          body: JSON.stringify({
            device_id: deviceId,
            display_name: `Moonwitness company ${companyId}`,
          }),
        });
      }
      const gatewayStatus = await gowaRequest<{
        is_connected?: boolean;
        is_logged_in?: boolean;
        jid?: string;
      }>(`/devices/${encodeURIComponent(deviceId)}/status`);
      if (gatewayStatus.is_connected && gatewayStatus.is_logged_in) {
        const phoneNumber = gatewayStatus.jid?.split('@')[0] ?? account.phone_number;
        await WhatsappAccount.query().where({ id: account.id, company_id: companyId }).patch({
          status: 'connected',
          phone_number: phoneNumber,
          qr_code: null,
          last_error: null,
          write_date: new Date().toISOString(),
        });
        return reply.code(200).send({
          success: true,
          data: { id: account.id, status: 'connected', phone_number: phoneNumber },
        });
      }
      const qr = await gowaRequest<{ qr_link?: string }>(
        `/devices/${encodeURIComponent(deviceId)}/login`
      );
      const qrPath = typeof qr.qr_link === 'string' ? gowaOriginPath(qr.qr_link) : null;
      await WhatsappAccount.query()
        .where({ id: account.id, company_id: companyId })
        .patch({
          status: qrPath ? 'qr' : 'connecting',
          qr_code: qrPath,
          last_error: null,
          write_date: new Date().toISOString(),
        });
    } catch (error) {
      await WhatsappAccount.query()
        .where({ id: account.id, company_id: companyId })
        .patch({
          status: 'error',
          last_error:
            error instanceof Error ? error.message.slice(0, 255) : 'WhatsApp gateway unavailable',
        });
      return reply.code(502).send({ success: false, error: 'Could not start WhatsApp pairing' });
    }
    return reply.code(202).send({
      success: true,
      data: {
        id: account.id,
        status: 'qr',
      },
    });
  });

  app.post('/whatsapp/disconnect', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (account?.gateway_device_id) {
      try {
        await gowaRequest(`/devices/${encodeURIComponent(account.gateway_device_id)}/logout`, {
          method: 'POST',
        });
      } catch (error) {
        if (!(error instanceof GowaError && error.statusCode === 404)) throw error;
      }
    }
    await WhatsappAccount.query().where({ company_id: companyId }).patch({
      status: 'disconnected',
      qr_code: null,
      phone_number: null,
      last_error: null,
      write_date: new Date().toISOString(),
    });
    return { success: true, data: { status: 'disconnected' } };
  });

  app.get('/whatsapp/conversations', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account?.gateway_device_id) return { success: true, data: [] };
    const upstream = await gowaRequest<{ data?: Array<Record<string, unknown>> }>(
      '/chats?limit=100&offset=0',
      { deviceId: account.gateway_device_id }
    );
    for (const chat of upstream.data ?? []) {
      const jid = typeof chat.jid === 'string' ? chat.jid : '';
      if (!/^[^\s@]{1,200}@(s\.whatsapp\.net|g\.us|lid)$/u.test(jid)) continue;
      const lastMessageAt =
        typeof chat.last_message_time === 'string' &&
        Number.isFinite(Date.parse(chat.last_message_time))
          ? new Date(chat.last_message_time).toISOString()
          : null;
      await app
        .db('whatsapp_conversations')
        .insert({
          company_id: companyId,
          account_id: account.id,
          jid,
          name: typeof chat.name === 'string' && chat.name ? chat.name.slice(0, 255) : jid,
          is_group: jid.endsWith('@g.us'),
          unread_count: 0,
          last_message_at: lastMessageAt,
        })
        .onConflict(['company_id', 'jid'])
        .merge({
          name: typeof chat.name === 'string' && chat.name ? chat.name.slice(0, 255) : jid,
          is_group: jid.endsWith('@g.us'),
          last_message_at: lastMessageAt,
          write_date: new Date().toISOString(),
        });
    }
    const conversations = await WhatsappConversation.query()
      .where({ company_id: companyId })
      .orderBy('last_message_at', 'desc')
      .orderBy('id', 'desc')
      .limit(100);
    return { success: true, data: conversations };
  });

  app.post<{ Body: unknown }>('/whatsapp/conversations', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const body = isRecord(req.body) ? req.body : null;
    const phone = typeof body?.phone === 'string' ? body.phone.replace(/^\+/u, '') : '';
    if (
      !body ||
      !/^[1-9]\d{7,14}$/u.test(phone) ||
      Object.keys(body).some((key) => !['phone', 'name'].includes(key)) ||
      (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 255))
    )
      return reply
        .code(400)
        .send({ success: false, error: 'Enter a phone number with country code (8–15 digits)' });
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account || account.status !== 'connected')
      return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
    const [conversation] = await app
      .db('whatsapp_conversations')
      .insert({
        company_id: companyId,
        account_id: account.id,
        jid: `${phone}@s.whatsapp.net`,
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `+${phone}`,
        is_group: false,
        unread_count: 0,
      })
      .onConflict(['company_id', 'jid'])
      .merge({ write_date: new Date().toISOString() })
      .returning('*');
    return reply.code(201).send({ success: true, data: conversation });
  });

  app.get<{ Params: Params }>('/whatsapp/conversations/:id/messages', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const conversationId = id(req.params.id);
    if (!conversationId)
      return reply.code(400).send({ success: false, error: 'Invalid conversation ID' });
    const conversation = await WhatsappConversation.query().findOne({
      id: conversationId,
      company_id: companyId,
    });
    if (!conversation)
      return reply.code(404).send({ success: false, error: 'Conversation not found' });
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account?.gateway_device_id) return { success: true, data: [] };
    const upstream = await gowaRequest<{ data?: Array<Record<string, unknown>> }>(
      `/chat/${encodeURIComponent(conversation.jid)}/messages?limit=100&offset=0`,
      { deviceId: account.gateway_device_id }
    );
    for (const item of upstream.data ?? []) {
      if (typeof item.id !== 'string' || !item.id) continue;
      const fromMe = item.is_from_me === true;
      const rawType = typeof item.media_type === 'string' ? item.media_type : 'text';
      const messageType = ['text', 'image', 'video', 'audio', 'document', 'sticker'].includes(
        rawType
      )
        ? rawType
        : 'text';
      const timestamp =
        typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp))
          ? new Date(item.timestamp).toISOString()
          : new Date().toISOString();
      await app
        .db('whatsapp_messages')
        .insert({
          company_id: companyId,
          account_id: account.id,
          conversation_id: conversationId,
          external_id: item.id.slice(0, 255),
          direction: fromMe ? 'outbound' : 'inbound',
          message_type: messageType,
          content: typeof item.content === 'string' ? item.content.slice(0, 8000) : '',
          status: fromMe ? 'sent' : 'received',
          media_mime_type:
            item.mime_type !== undefined ? safeMime(item.mime_type) : mediaDefaultMime(messageType),
          media_file_name:
            typeof item.filename === 'string'
              ? item.filename.slice(0, 255)
              : typeof item.file_name === 'string'
                ? item.file_name.slice(0, 255)
                : null,
          sender_jid:
            typeof item.sender === 'string'
              ? item.sender.slice(0, 255)
              : typeof item.sender_jid === 'string'
                ? item.sender_jid.slice(0, 255)
                : null,
          create_date: timestamp,
        })
        .onConflict(['company_id', 'external_id'])
        .merge({
          content: typeof item.content === 'string' ? item.content.slice(0, 8000) : '',
          status: fromMe ? 'sent' : 'received',
          write_date: new Date().toISOString(),
        });
    }
    const messages = await WhatsappMessage.query()
      .select(
        'id',
        'direction',
        'content',
        'status',
        'message_type',
        'media_mime_type',
        'media_file_name',
        'sender_jid',
        'create_date'
      )
      .where({ conversation_id: conversationId, company_id: companyId })
      .orderBy('create_date', 'desc')
      .orderBy('id', 'desc')
      .limit(500);
    const latestProviderMessage = (upstream.data ?? []).reduce<Record<string, unknown> | null>(
      (latest, item) => {
        const timestamp = typeof item.timestamp === 'string' ? Date.parse(item.timestamp) : 0;
        const latestTimestamp =
          typeof latest?.timestamp === 'string' ? Date.parse(latest.timestamp) : -1;
        return Number.isFinite(timestamp) && timestamp > latestTimestamp ? item : latest;
      },
      null
    );
    const latestTime =
      typeof latestProviderMessage?.timestamp === 'string' &&
      Number.isFinite(Date.parse(latestProviderMessage.timestamp))
        ? new Date(latestProviderMessage.timestamp).toISOString()
        : null;
    const latestContent = latestProviderMessage
      ? typeof latestProviderMessage.content === 'string' && latestProviderMessage.content
        ? latestProviderMessage.content.slice(0, 2000)
        : `[${String(latestProviderMessage.media_type ?? 'message')}]`
      : null;
    await WhatsappConversation.query()
      .where({ id: conversationId, company_id: companyId })
      .patch({
        unread_count: 0,
        ...(latestContent !== null ? { last_message: latestContent } : {}),
        ...(latestTime !== null ? { last_message_at: latestTime } : {}),
        write_date: new Date().toISOString(),
      });
    return { success: true, data: messages };
  });

  app.post<{ Params: Params; Body: unknown }>(
    '/whatsapp/conversations/:id/messages',
    { bodyLimit: 12 * 1024 * 1024 },
    async (req, reply) => {
      const companyId = requireCompany(req, reply);
      if (!companyId) return;
      const conversationId = id(req.params.id),
        body = isRecord(req.body) ? req.body : null;
      if (
        !conversationId ||
        !body ||
        Object.keys(body).some(
          (k) => !['content', 'media_base64', 'media_mime_type', 'media_file_name'].includes(k)
        ) ||
        typeof body.content !== 'string' ||
        body.content.length > 8000
      )
        return reply.code(400).send({ success: false, error: 'Invalid message payload' });
      const conversation = await WhatsappConversation.query().findOne({
        id: conversationId,
        company_id: companyId,
      });
      if (!conversation)
        return reply.code(404).send({ success: false, error: 'Conversation not found' });
      const account = await WhatsappAccount.query().findOne({ company_id: companyId });
      if (!account || !account.gateway_device_id || account.status !== 'connected')
        return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
      if (!body.content.trim() && typeof body.media_base64 !== 'string')
        return reply
          .code(400)
          .send({ success: false, error: 'Message must contain text or media' });
      let mediaKey: string | null = null;
      let mediaBytes: Buffer | null = null;
      const mediaMime = safeMime(body.media_mime_type);
      const fileName =
        typeof body.media_file_name === 'string'
          ? body.media_file_name.replace(/[\\/\r\n]/gu, '_').slice(0, 255)
          : null;
      if (typeof body.media_base64 === 'string') {
        const encoded = body.media_base64.replace(/^data:[^,]+,/u, '');
        const bytes = Buffer.from(encoded, 'base64');
        if (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes.toString('base64') !== encoded)
          return reply
            .code(400)
            .send({ success: false, error: 'Media must be valid base64 up to 8 MB' });
        mediaBytes = bytes;
      }
      let sent: { id?: string; message_id?: string } | undefined;
      try {
        if (mediaBytes) {
          const type = mediaType(mediaMime);
          const endpoint =
            type === 'image'
              ? '/send/image'
              : type === 'video'
                ? '/send/video'
                : type === 'audio'
                  ? '/send/audio'
                  : type === 'sticker'
                    ? '/send/sticker'
                    : '/send/file';
          const field =
            type === 'image'
              ? 'image'
              : type === 'video'
                ? 'video'
                : type === 'audio'
                  ? 'audio'
                  : type === 'sticker'
                    ? 'sticker'
                    : 'file';
          const form = new FormData();
          form.set('phone', conversation.jid);
          if (body.content.trim()) form.set('caption', body.content);
          form.set(field, new Blob([mediaBytes], { type: mediaMime }), fileName || 'attachment');
          // Persist the media before the external send. If storage is unavailable, fail before
          // WhatsApp accepts the message so the UI can safely keep its draft.
          mediaKey = randomUUID();
          await options.attachmentStorage.put(mediaKey, mediaBytes);
          sent = await gowaRequest<{ id?: string; message_id?: string }>(endpoint, {
            method: 'POST',
            deviceId: account.gateway_device_id,
            body: form,
          });
        } else {
          sent = await gowaRequest<{ id?: string; message_id?: string }>('/send/message', {
            method: 'POST',
            deviceId: account.gateway_device_id,
            contentType: 'application/json',
            body: JSON.stringify({ phone: conversation.jid, message: body.content }),
          });
        }
        const externalId =
          typeof sent?.message_id === 'string'
            ? sent.message_id
            : typeof sent?.id === 'string'
              ? sent.id
              : 'gowa-' + randomUUID();
        const message = await WhatsappMessage.query().insert({
          company_id: companyId,
          account_id: account.id,
          conversation_id: conversationId,
          external_id: externalId.slice(0, 255),
          direction: 'outbound',
          message_type: mediaKey ? mediaType(mediaMime) : 'text',
          content: body.content,
          status: 'sent',
          media_key: mediaKey,
          media_mime_type: mediaKey ? mediaMime : null,
          media_file_name: fileName,
        });
        await WhatsappConversation.query()
          .where({ id: conversationId, company_id: companyId })
          .patch({
            last_message: body.content || (fileName ?? '[media]'),
            last_message_at: new Date().toISOString(),
          });
        return reply.code(201).send({ success: true, data: message });
      } catch (error) {
        if (mediaKey) await options.attachmentStorage.delete(mediaKey).catch(() => undefined);
        return reply.code(502).send({
          success: false,
          error: error instanceof Error ? error.message : 'WhatsApp message could not be sent',
        });
      }
    }
  );

  app.get<{ Params: Params }>('/whatsapp/media/:id', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const messageId = id(req.params.id);
    if (!messageId) return reply.code(400).send({ success: false, error: 'Invalid message ID' });
    const message = await WhatsappMessage.query().findOne({ id: messageId, company_id: companyId });
    if (!message || message.message_type === 'text')
      return reply.code(404).send({ success: false, error: 'Media not found' });
    let content = message.media_key ? await options.attachmentStorage.get(message.media_key) : null;
    if (!content) {
      const conversation = await WhatsappConversation.query().findOne({
        id: message.conversation_id,
        company_id: companyId,
      });
      const account = await WhatsappAccount.query().findOne({
        id: message.account_id,
        company_id: companyId,
      });
      if (!conversation || !account?.gateway_device_id)
        return reply.code(404).send({ success: false, error: 'Media not found' });
      const metadata = await gowaRequest<{
        file_url?: string;
        file_path?: string;
        filename?: string;
      }>(
        `/message/${encodeURIComponent(message.external_id)}/download?phone=${encodeURIComponent(conversation.jid)}`,
        { deviceId: account.gateway_device_id }
      );
      const mediaPath = metadata.file_url ?? metadata.file_path;
      if (!mediaPath) return reply.code(404).send({ success: false, error: 'Media not found' });
      const downloaded = await gowaBinary(gowaOriginPath(mediaPath), account.gateway_device_id);
      content = Buffer.from(await downloaded.arrayBuffer());
      if (!content.length || content.length > 50 * 1024 * 1024)
        return reply.code(413).send({ success: false, error: 'Media exceeds the supported size' });
      const mediaKey = randomUUID();
      await options.attachmentStorage.put(mediaKey, content);
      await WhatsappMessage.query()
        .where({ id: message.id, company_id: companyId })
        .patch({
          media_key: mediaKey,
          media_mime_type: safeMime(downloaded.headers.get('content-type')),
          media_file_name: metadata.filename ?? message.media_file_name,
        });
      message.media_key = mediaKey;
      message.media_mime_type = safeMime(downloaded.headers.get('content-type'));
      message.media_file_name = metadata.filename ?? message.media_file_name;
    }
    const mime = safeMime(message.media_mime_type);
    const disposition =
      mime.startsWith('image/') ||
      mime.startsWith('audio/') ||
      mime.startsWith('video/') ||
      mime === 'application/pdf'
        ? 'inline'
        : 'attachment';
    return reply
      .header('X-Content-Type-Options', 'nosniff')
      .header(
        'content-disposition',
        `${disposition}; filename="${(message.media_file_name ?? 'attachment').replace(/[\r\n"\\]/gu, '_')}"`
      )
      .type(mime)
      .send(content);
  });
};
