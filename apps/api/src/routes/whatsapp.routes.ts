import type { FastifyPluginAsync } from 'fastify';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AttachmentStorage } from '@moonwitness/orm-storage';
import { WhatsappAccount, WhatsappConversation, WhatsappMessage } from '../whatsapp/models.js';
import { isRecord } from '@moonwitness/types';

import { lockOne, mediaType, processIncoming, safeMime } from '../whatsapp/incoming.js';

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
    if (!['connected', 'qr', 'connecting', 'reconnecting'].includes(account.status))
      await WhatsappAccount.query()
        .where({ id: account.id, company_id: companyId })
        .patch({ status: 'connecting', last_error: null, write_date: new Date().toISOString() });
    return reply.code(202).send({
      success: true,
      data: {
        id: account.id,
        status: account.status === 'connected' ? 'connected' : 'connecting',
      },
    });
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
      const account = await WhatsappAccount.query().findOne({ company_id: companyId });
      if (!account || account.status !== 'connected')
        return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
      if (!body.content.trim() && typeof body.media_base64 !== 'string')
        return reply
          .code(400)
          .send({ success: false, error: 'Message must contain text or media' });
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
      const messageContent = body.content;
      try {
        const message = await app.db.transaction(async (trx) => {
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
            content: messageContent,
            status: 'queued',
            media_key: mediaKey,
            media_mime_type: mediaKey ? mediaMime : null,
            media_file_name: fileName,
          });
          const [job] = await trx('whatsapp_jobs')
            .insert({
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
            })
            .returning('id');
          const externalId = createHash('sha256')
            .update(`${account.id}:${job.id}`)
            .digest('hex')
            .slice(0, 20)
            .toUpperCase();
          await WhatsappMessage.query(trx).findById(message.id).patch({ external_id: externalId });
          message.external_id = externalId;
          await trx('whatsapp_conversations')
            .where({ id: conversationId, company_id: companyId })
            .update({
              last_message: body.content || (fileName ?? '[media]'),
              last_message_at: new Date().toISOString(),
              write_date: new Date().toISOString(),
            });
          return message;
        });
        return reply.code(202).send({ success: true, data: message });
      } catch (error) {
        if (mediaKey) await options.attachmentStorage.delete(mediaKey).catch(() => undefined);
        throw error;
      }
    }
  );

  app.post<{ Params: Params }>('/whatsapp/messages/:id/retry', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const messageId = id(req.params.id);
    if (!messageId) return reply.code(400).send({ success: false, error: 'Invalid message ID' });
    const message = await WhatsappMessage.query().findOne({
      id: messageId,
      company_id: companyId,
      direction: 'outbound',
    });
    if (!message) return reply.code(404).send({ success: false, error: 'Message not found' });
    const account = await WhatsappAccount.query().findOne({
      id: message.account_id,
      company_id: companyId,
    });
    if (account?.status !== 'connected')
      return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
    const retried = await app.db.transaction(async (trx) => {
      const count = await trx('whatsapp_jobs')
        .where({ company_id: companyId, message_id: messageId, status: 'dead' })
        .update({
          status: 'retry',
          attempts: 0,
          available_at: new Date().toISOString(),
          last_error: null,
          write_date: new Date().toISOString(),
        });
      if (count)
        await trx('whatsapp_messages')
          .where({ id: messageId, company_id: companyId })
          .update({ status: 'queued', write_date: new Date().toISOString() });
      return count;
    });
    return reply.code(retried ? 202 : 409).send({
      success: Boolean(retried),
      ...(retried ? {} : { error: 'Only failed messages can be retried' }),
    });
  });

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
    const updated = await app
      .db('whatsapp_accounts')
      .where({ id: body.account_id })
      .update({
        status: body.connected ? 'connecting' : 'disconnected',
        qr_code: null,
        last_error: null,
        write_date: new Date().toISOString(),
      });
    return reply.code(updated ? 200 : 404).send({ success: Boolean(updated) });
  });
  app.post('/internal/whatsapp/jobs/claim', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    const trx = await app.db.transaction();
    try {
      const now = new Date().toISOString();
      const staleBefore = new Date(Date.now() - 60_000).toISOString();
      const job = await lockOne(
        trx('whatsapp_jobs')
          .whereExists(
            trx('whatsapp_accounts')
              .select('id')
              .whereRaw('?? = ??', ['whatsapp_accounts.id', 'whatsapp_jobs.account_id'])
              .where('whatsapp_accounts.status', 'connected')
          )
          .where((query) =>
            query
              .where((available) =>
                available.whereIn('status', ['pending', 'retry']).where('available_at', '<=', now)
              )
              .orWhere((stale) =>
                stale.where('status', 'processing').where('write_date', '<', staleBefore)
              )
          )
          .orderBy('id'),
        app.db
      ).first();
      if (!job) {
        await trx.commit();
        return { success: true, data: null };
      }
      if (job.attempts >= 8) {
        await trx('whatsapp_jobs')
          .where({ id: job.id })
          .update({ status: 'dead', write_date: now });
        await trx('whatsapp_messages').where({ id: job.message_id }).update({ status: 'failed' });
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
  app.post<{ Body: unknown }>('/internal/whatsapp/jobs/heartbeat', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    const body = isRecord(req.body) ? req.body : null;
    if (!body || !Number.isSafeInteger(body.job_id) || !Number.isSafeInteger(body.attempts))
      return reply.code(400).send({ success: false });
    const updated = await app
      .db('whatsapp_jobs')
      .where({ id: body.job_id, status: 'processing', attempts: body.attempts })
      .update({ write_date: new Date().toISOString() });
    return reply.code(updated ? 200 : 409).send({ success: Boolean(updated) });
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
      if (!Number.isSafeInteger(body.attempts)) return reply.code(400).send({ success: false });
      if (job.status !== 'processing' || job.attempts !== body.attempts)
        return reply.code(409).send({ success: false, error: 'Stale job result' });
      const next =
        body.status === 'retry'
          ? new Date(Date.now() + Math.min(job.attempts * 5000, 300000)).toISOString()
          : new Date().toISOString();
      await app.db.transaction(async (trx) => {
        const updated = await trx('whatsapp_jobs')
          .where({ id: job.id, status: 'processing', attempts: body.attempts })
          .update({
            status: body.status,
            available_at: next,
            last_error: typeof body.error === 'string' ? body.error.slice(0, 255) : null,
            write_date: new Date().toISOString(),
          });
        if (!updated) return;
        if (body.status === 'done')
          await trx('whatsapp_messages')
            .where({ id: job.message_id })
            .update({
              ...(typeof body.external_id === 'string' ? { external_id: body.external_id } : {}),
              status: trx.raw(
                "CASE WHEN status IN ('delivered', 'read') THEN status ELSE 'sent' END"
              ),
              write_date: new Date().toISOString(),
            });
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
    const accountQuery = app.db('whatsapp_accounts').where({ id: body.account_id });
    if (patch.status && patch.status !== 'disconnected')
      accountQuery.whereNot('status', 'disconnected');
    await accountQuery.update(patch);
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
        typeof body.external_id !== 'string'
      )
        return reply.code(400).send({ success: false });
      const account = await app.db('whatsapp_accounts').where({ id: body.account_id }).first();
      if (!account) return reply.code(404).send({ success: false });
      if (
        !/^[^\s@]{1,200}@(s\.whatsapp\.net|g\.us|lid)$/u.test(body.jid) ||
        !body.external_id ||
        body.external_id.length > 255
      )
        return reply.code(400).send({ success: false, error: 'Invalid WhatsApp identity' });
      if (typeof body.media_base64 === 'string') {
        const bytes = Buffer.from(body.media_base64, 'base64');
        if (
          !bytes.length ||
          bytes.length > 8 * 1024 * 1024 ||
          bytes.toString('base64') !== body.media_base64
        )
          return reply.code(400).send({ success: false, error: 'Invalid media' });
      }
      await app
        .db('whatsapp_events')
        .insert({
          company_id: account.company_id,
          account_id: account.id,
          external_id: body.external_id,
          status: 'pending',
          attempts: 0,
          payload: JSON.stringify({
            jid: body.jid,
            name: typeof body.name === 'string' ? body.name.slice(0, 255) : body.jid,
            content: typeof body.content === 'string' ? body.content.slice(0, 8000) : '',
            is_group: body.jid.endsWith('@g.us'),
            from_me: body.from_me === true,
            notify: body.notify !== false,
            timestamp:
              typeof body.timestamp === 'string' && Number.isFinite(Date.parse(body.timestamp))
                ? new Date(body.timestamp).toISOString()
                : undefined,
            sender_jid: typeof body.sender_jid === 'string' ? body.sender_jid.slice(0, 255) : null,
            media_base64: body.media_base64,
            media_mime_type: safeMime(body.media_mime_type),
            media_file_name:
              typeof body.media_file_name === 'string'
                ? body.media_file_name.replace(/[\\/\r\n]/gu, '_').slice(0, 255)
                : null,
          }),
        })
        .onConflict(['account_id', 'external_id'])
        .ignore();
      return { success: true };
    }
  );
  app.post('/internal/whatsapp/events/process', async (req, reply) => {
    if (!internalAllowed(req.headers['x-whatsapp-internal-token']))
      return reply.code(401).send({ success: false });
    return {
      success: true,
      data: { processed: await processIncoming(app.db, options.attachmentStorage) },
    };
  });
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
    const earlier: Record<string, string[]> = {
      sent: ['queued', 'sent'],
      delivered: ['queued', 'sent', 'delivered'],
      read: ['queued', 'sent', 'delivered', 'read'],
      failed: ['queued', 'sent', 'failed'],
    };
    await app
      .db('whatsapp_messages')
      .where({ account_id: body.account_id, external_id: body.external_id, direction: 'outbound' })
      .whereIn('status', earlier[String(body.status)]!)
      .update({ status: body.status, write_date: new Date().toISOString() });
    return { success: true };
  });
};
