import type { FastifyPluginAsync } from 'fastify';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { AttachmentStorage } from '@moonwitness/orm-storage';
import { WhatsappAccount, WhatsappConversation, WhatsappMessage } from '../whatsapp/models.js';
import { isRecord } from '@moonwitness/types';

type Options = { attachmentStorage: AttachmentStorage };
type Params = { id: string };

function id(value: string): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function internalAllowed(value: unknown): boolean {
  const secret =
    process.env.WHATSAPP_INTERNAL_TOKEN ||
    (process.env.NODE_ENV !== 'production'
      ? 'moonwitness-local-whatsapp-internal-token-v1-unsafe'
      : '');
  const supplied = typeof value === 'string' ? value : '';
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return (
    secret.length >= 32 &&
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
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

function safeMime(value: unknown): string {
  if (typeof value !== 'string') return 'application/octet-stream';
  const mime = value.toLowerCase().split(';')[0]?.trim() ?? '';
  if (
    /^(?:image\/(?:jpeg|png|gif|webp)|video\/(?:mp4|quicktime|webm)|audio\/(?:mpeg|mp4|ogg|wav|webm)|application\/(?:pdf|octet-stream|msword|vnd\.openxmlformats-officedocument\.[a-z0-9.-]+))$/u.test(
      mime
    )
  )
    return mime;
  return 'application/octet-stream';
}

export const whatsappRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get('/whatsapp/account', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account)
      return { success: true, data: { status: 'disconnected', phone_number: null, qr_code: null } };
    return {
      success: true,
      data: {
        id: account.id,
        status: account.status,
        phone_number: account.phone_number,
        qr_code: account.qr_code,
        last_error: account.last_error,
      },
    };
  });

  app.post('/whatsapp/connect', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    let account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account) {
      try {
        account = await WhatsappAccount.query().insert({
          company_id: companyId,
          status: 'connecting',
        });
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') throw error;
        account = await WhatsappAccount.query().findOne({ company_id: companyId });
        if (!account) throw error;
      }
    }
    await WhatsappAccount.query()
      .where({ id: account.id, company_id: companyId })
      .patch({ status: 'connecting', last_error: null, write_date: new Date().toISOString() });
    return reply.code(202).send({ success: true, data: { id: account.id, status: 'connecting' } });
  });

  app.post('/whatsapp/disconnect', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    await WhatsappAccount.query()
      .where({ company_id: companyId })
      .patch({ status: 'disconnected', qr_code: null, write_date: new Date().toISOString() });
    return { success: true, data: { status: 'disconnected' } };
  });

  app.get('/whatsapp/conversations', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const conversations = await WhatsappConversation.query()
      .where({ company_id: companyId })
      .orderBy('last_message_at', 'desc')
      .orderBy('id', 'desc')
      .limit(100);
    return { success: true, data: conversations };
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
    const messages = await WhatsappMessage.query()
      .where({ conversation_id: conversationId, company_id: companyId })
      .orderBy('create_date', 'desc')
      .orderBy('id', 'desc')
      .limit(500);
    await WhatsappConversation.query()
      .where({ id: conversationId, company_id: companyId })
      .patch({ unread_count: 0, write_date: new Date().toISOString() });
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
      let mediaKey: string | null = null;
      if (typeof body.media_base64 === 'string') {
        const encoded = body.media_base64.replace(/^data:[^,]+,/u, '');
        const bytes = Buffer.from(encoded, 'base64');
        if (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes.toString('base64') !== encoded)
          return reply
            .code(400)
            .send({ success: false, error: 'Media must be valid base64 up to 8 MB' });
        mediaKey = randomUUID();
        await options.attachmentStorage.put(mediaKey, bytes);
      }
      const account = await WhatsappAccount.query().findOne({ company_id: companyId });
      if (!account || account.status !== 'connected')
        return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
      const trx = await app.db.transaction();
      try {
        const mediaMime = safeMime(body.media_mime_type);
        const fileName =
          typeof body.media_file_name === 'string'
            ? body.media_file_name.replace(/[\\/\r\n]/gu, '_').slice(0, 255)
            : null;
        const message = await WhatsappMessage.query(trx).insert({
          company_id: companyId,
          account_id: account.id,
          conversation_id: conversationId,
          external_id: `local-${randomUUID()}`,
          direction: 'outbound',
          message_type: mediaKey ? mediaType(mediaMime) : 'text',
          content: body.content,
          status: 'queued',
          media_key: mediaKey,
          media_mime_type: mediaKey ? mediaMime : null,
          media_file_name: fileName,
        });
        await trx('whatsapp_jobs').insert({
          company_id: companyId,
          account_id: account.id,
          message_id: message.id,
          recipient_jid: conversation.jid,
          payload: JSON.stringify({
            content: body.content,
            media_key: mediaKey,
            media_mime_type: mediaMime,
            media_file_name: fileName,
          }),
          status: 'pending',
          attempts: 0,
          available_at: new Date().toISOString(),
        });
        await trx('whatsapp_conversations')
          .where({ id: conversationId, company_id: companyId })
          .update({
            last_message: body.content || (fileName ?? '[media]'),
            last_message_at: new Date().toISOString(),
            write_date: new Date().toISOString(),
          });
        await trx.commit();
        return reply.code(202).send({ success: true, data: message });
      } catch (error) {
        await trx.rollback();
        if (mediaKey) await options.attachmentStorage.delete(mediaKey).catch(() => undefined);
        throw error;
      }
    }
  );

  app.get<{ Params: Params }>('/whatsapp/media/:id', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const messageId = id(req.params.id);
    if (!messageId) return reply.code(400).send({ success: false, error: 'Invalid message ID' });
    const message = await WhatsappMessage.query().findOne({ id: messageId, company_id: companyId });
    if (!message?.media_key)
      return reply.code(404).send({ success: false, error: 'Media not found' });
    const content = await options.attachmentStorage.get(message.media_key);
    if (!content) return reply.code(404).send({ success: false, error: 'Media not found' });
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

  app.get('/internal/whatsapp/accounts', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    return {
      success: true,
      data: await app.db('whatsapp_accounts').select('id', 'company_id', 'status', 'auth_state'),
    };
  });
  app.post<{ Body: unknown }>('/internal/whatsapp/connection-control', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    const body = isRecord(req.body) ? req.body : null;
    if (!body || !Number.isSafeInteger(body.account_id) || typeof body.connected !== 'boolean')
      return reply.code(400).send({ success: false });
    const accountId = Number(body.account_id);
    const account = await WhatsappAccount.query().findById(accountId);
    if (!account) return reply.code(404).send({ success: false });
    await WhatsappAccount.query()
      .where({ id: accountId, company_id: account.company_id })
      .patch({
        status: body.connected ? 'connecting' : 'disconnected',
        qr_code: null,
        last_error: null,
        write_date: new Date().toISOString(),
      });
    return { success: true };
  });
  app.post('/internal/whatsapp/jobs/claim', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    const trx = await app.db.transaction();
    try {
      const now = new Date().toISOString();
      const staleBefore = new Date(Date.now() - 60_000).toISOString();
      const job = await trx('whatsapp_jobs')
        .where((query) =>
          query
            .where((available) =>
              available.whereIn('status', ['pending', 'retry']).where('available_at', '<=', now)
            )
            .orWhere((stale) =>
              stale.where('status', 'processing').where('write_date', '<', staleBefore)
            )
        )
        .orderBy('id')
        .forUpdate()
        .skipLocked()
        .first();
      if (!job) {
        await trx.commit();
        return { success: true, data: null };
      }
      await trx('whatsapp_jobs')
        .where({ id: job.id })
        .update({
          status: 'processing',
          attempts: job.attempts + 1,
          write_date: new Date().toISOString(),
        });
      const message = await trx('whatsapp_messages').where({ id: job.message_id }).first();
      await trx.commit();
      return { success: true, data: { ...job, attempts: job.attempts + 1, message } };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  });
  app.post<{ Body: unknown }>(
    '/internal/whatsapp/job-result',
    { bodyLimit: 12 * 1024 * 1024 },
    async (req, reply) => {
      if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
        return reply.code(401).send({ success: false });
      const body = isRecord(req.body) ? req.body : null;
      if (
        !body ||
        !Number.isSafeInteger(body.job_id) ||
        typeof body.status !== 'string' ||
        !['done', 'retry', 'dead'].includes(body.status)
      )
        return reply.code(400).send({ success: false });
      const job = await app.db('whatsapp_jobs').where({ id: body.job_id }).first();
      if (!job) return reply.code(404).send({ success: false });
      const next =
        body.status === 'retry'
          ? new Date(Date.now() + Math.min(job.attempts * 5000, 300000)).toISOString()
          : new Date().toISOString();
      await app.db.transaction(async (trx) => {
        await trx('whatsapp_jobs')
          .where({ id: job.id })
          .update({
            status: body.status,
            available_at: next,
            last_error: typeof body.error === 'string' ? body.error.slice(0, 255) : null,
            write_date: new Date().toISOString(),
          });
        if (body.status === 'done')
          await trx('whatsapp_messages')
            .where({ id: job.message_id })
            .update({
              ...(typeof body.external_id === 'string' ? { external_id: body.external_id } : {}),
              status: 'sent',
              write_date: new Date().toISOString(),
            });
        else if (body.status === 'retry')
          await trx('whatsapp_messages')
            .where({ id: job.message_id })
            .update({ status: 'queued', write_date: new Date().toISOString() });
        else if (body.status === 'dead')
          await trx('whatsapp_messages')
            .where({ id: job.message_id })
            .update({ status: 'failed', write_date: new Date().toISOString() });
      });
      return { success: true };
    }
  );
  app.get<{ Params: { id: string } }>('/internal/whatsapp/media/:id', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    if (!/^[0-9a-f-]{36}$/iu.test(req.params.id)) return reply.code(400).send({ success: false });
    const content = await options.attachmentStorage.get(req.params.id);
    if (!content) return reply.code(404).send({ success: false });
    return reply.type('application/octet-stream').send(content);
  });
  app.post<{ Body: unknown }>('/internal/whatsapp/status', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    const body = isRecord(req.body) ? req.body : null;
    if (!body || !Number.isSafeInteger(body.account_id))
      return reply.code(400).send({ success: false });
    const patch: Record<string, unknown> = {};
    if (
      typeof body.status === 'string' &&
      ['connecting', 'qr', 'connected', 'reconnecting', 'error', 'disconnected'].includes(
        body.status
      )
    )
      patch.status = body.status;
    if (typeof body.qr_code === 'string' || body.qr_code === null) patch.qr_code = body.qr_code;
    if (typeof body.phone_number === 'string' || body.phone_number === null)
      patch.phone_number = body.phone_number;
    if (typeof body.last_error === 'string' || body.last_error === null)
      patch.last_error = body.last_error;
    if (typeof body.auth_state === 'string' || body.auth_state === null)
      patch.auth_state = body.auth_state;
    patch.write_date = new Date().toISOString();
    await app.db('whatsapp_accounts').where({ id: body.account_id }).update(patch);
    return { success: true };
  });
  app.post<{ Body: unknown }>(
    '/internal/whatsapp/incoming',
    { bodyLimit: 12 * 1024 * 1024 },
    async (req, reply) => {
      if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
        return reply.code(401).send({ success: false });
      const body = isRecord(req.body) ? req.body : null;
      if (
        !body ||
        !Number.isSafeInteger(body.account_id) ||
        typeof body.jid !== 'string' ||
        body.jid.length > 255 ||
        typeof body.external_id !== 'string' ||
        body.external_id.length > 255 ||
        (body.media_base64 !== undefined && typeof body.media_base64 !== 'string')
      )
        return reply.code(400).send({ success: false });
      const account = await app.db('whatsapp_accounts').where({ id: body.account_id }).first();
      if (!account) return reply.code(404).send({ success: false });
      const companyId = account.company_id as number;
      let mediaKey: string | null = null;
      if (typeof body.media_base64 === 'string') {
        if (body.media_base64.length > 12 * 1024 * 1024)
          return reply.code(413).send({ success: false });
        const bytes = Buffer.from(body.media_base64, 'base64');
        if (
          !bytes.length ||
          bytes.length > 8 * 1024 * 1024 ||
          bytes.toString('base64') !== body.media_base64
        )
          return reply.code(413).send({ success: false });
        mediaKey = randomUUID();
        await options.attachmentStorage.put(mediaKey, bytes);
      }
      const now = new Date().toISOString();
      let duplicateIncoming = false;
      try {
        await app.db.transaction(async (trx) => {
          let conversation = await trx('whatsapp_conversations')
            .where({ company_id: companyId, jid: body.jid })
            .first();
          if (!conversation) {
            const conversationRows = await trx('whatsapp_conversations')
              .insert({
                company_id: companyId,
                account_id: account.id,
                jid: body.jid,
                name: typeof body.name === 'string' ? body.name.slice(0, 255) : body.jid,
                is_group: body.is_group === true,
                unread_count: 0,
              })
              .onConflict(['company_id', 'jid'])
              .ignore()
              .returning('*');
            conversation = conversationRows[0];
            if (!conversation) {
              conversation = await trx('whatsapp_conversations')
                .where({ company_id: companyId, jid: body.jid })
                .first();
              if (!conversation) throw new Error('Unable to resolve incoming conversation');
            }
          }
          const insertedRows = await trx('whatsapp_messages')
            .insert({
              company_id: companyId,
              account_id: account.id,
              conversation_id: conversation.id,
              external_id: body.external_id,
              direction: 'inbound',
              message_type: mediaKey ? mediaType(safeMime(body.media_mime_type)) : 'text',
              content: typeof body.content === 'string' ? body.content.slice(0, 8000) : '',
              status: 'received',
              media_key: mediaKey,
              media_mime_type: mediaKey ? safeMime(body.media_mime_type) : null,
              media_file_name:
                typeof body.media_file_name === 'string'
                  ? body.media_file_name.replace(/[\\/\r\n]/gu, '_').slice(0, 255)
                  : null,
              sender_jid:
                typeof body.sender_jid === 'string' ? body.sender_jid.slice(0, 255) : null,
            })
            .onConflict(['company_id', 'external_id'])
            .ignore()
            .returning('id');
          if (!insertedRows.length) {
            duplicateIncoming = true;
            return;
          }
          await trx('whatsapp_conversations')
            .where({ id: conversation.id })
            .update({
              last_message:
                typeof body.content === 'string' ? body.content.slice(0, 8000) : '[media]',
              last_message_at: now,
              unread_count: trx.raw('?? + 1', ['unread_count']),
              write_date: now,
            });
        });
      } catch (error) {
        if (mediaKey) await options.attachmentStorage.delete(mediaKey).catch(() => undefined);
        const errorCode = (error as { code?: string }).code;
        if (errorCode !== '23505' && !errorCode?.startsWith('SQLITE_CONSTRAINT')) throw error;
      }
      if (duplicateIncoming && mediaKey)
        await options.attachmentStorage.delete(mediaKey).catch(() => undefined);
      return { success: true };
    }
  );
  app.post<{ Body: unknown }>('/internal/whatsapp/message-status', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    const body = isRecord(req.body) ? req.body : null;
    if (
      !body ||
      !Number.isSafeInteger(body.account_id) ||
      typeof body.external_id !== 'string' ||
      !['sent', 'delivered', 'read', 'failed'].includes(String(body.status))
    )
      return reply.code(400).send({ success: false });
    await app
      .db('whatsapp_messages')
      .where({ account_id: body.account_id, external_id: body.external_id, direction: 'outbound' })
      .update({ status: body.status, write_date: new Date().toISOString() });
    return { success: true };
  });
};

function mediaType(mime: string): 'image' | 'video' | 'audio' | 'document' | 'sticker' {
  if (mime.startsWith('image/')) return mime === 'image/webp' ? 'sticker' : 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
