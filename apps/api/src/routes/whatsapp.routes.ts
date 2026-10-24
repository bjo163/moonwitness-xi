import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Knex } from 'knex';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AttachmentStorage } from '@moonwitness/orm-storage';
import { WhatsappAccount, WhatsappConversation, WhatsappMessage } from '../whatsapp/models.js';
import { isRecord, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_REQUEST_BYTES } from '@moonwitness/types';

import { mediaType, mimeMatchesSignature, safeMime, sniffMime } from '../whatsapp/media.js';
import { gowaBinary, gowaOriginPath, gowaRequest, GowaError } from '../whatsapp/gowa-client.js';
import { whatsappLogErrorContext } from '../whatsapp/log-redaction.js';
import { OutboxEvent } from '@moonwitness/jobs';
import { WHATSAPP_SEND_EVENT } from '../whatsapp/outbox-consumer.js';

type Options = { attachmentStorage: AttachmentStorage };
type Params = { id: string };

function whatsappRateLimit(max: number) {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: (request: {
          auth: { companyId?: number; userId?: number } | null;
          ip: string;
        }) =>
          request.auth?.companyId && request.auth.userId
            ? `whatsapp:${request.auth.companyId}:${request.auth.userId}`
            : request.ip,
      },
    },
  };
}

class MediaTooLargeError extends Error {}
class MediaIncompleteError extends Error {}
class MediaEmptyError extends Error {}

const rawWebhookBodies = new WeakMap<FastifyRequest, Buffer>();
const MAX_GOWA_WEBHOOK_BYTES = 256 * 1024;

function captureGowaWebhookBody() {
  return async function captureRawBody(request: FastifyRequest, _reply: unknown, payload: Readable): Promise<Readable> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of payload) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += bytes.length;
      if (total > MAX_GOWA_WEBHOOK_BYTES) {
        const error = new Error('GoWA webhook payload too large') as Error & { statusCode: number };
        error.statusCode = 413;
        throw error;
      }
      chunks.push(bytes);
    }
    const raw = Buffer.concat(chunks, total);
    rawWebhookBodies.set(request, raw);
    return Readable.from([raw]);
  };
}

function validGowaWebhookSignature(raw: Buffer, signature: unknown): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/iu.test(signature)) return false;
  const supplied = Buffer.from(signature.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(raw).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function safeFileName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const sanitized = value.replace(/[\\/\r\n"\u0000-\u001f\u007f]/gu, '_').slice(0, 255);
  return sanitized || null;
}

async function readLimitedMedia(response: Response): Promise<Buffer> {
  const rawDeclaredLength = response.headers.get('content-length');
  const declaredLength = rawDeclaredLength === null ? NaN : Number(rawDeclaredLength);
  const canVerifyLength =
    Number.isSafeInteger(declaredLength) &&
    declaredLength >= 0 &&
    (!response.headers.has('content-encoding') ||
      response.headers.get('content-encoding') === 'identity');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_BYTES) {
    await response.body?.cancel();
    throw new MediaTooLargeError('Media exceeds the 10 MiB limit');
  }
  if (!response.body) throw new Error('WhatsApp gateway returned an empty media body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ATTACHMENT_BYTES) {
        await reader.cancel();
        throw new MediaTooLargeError('Media exceeds the 10 MiB limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (canVerifyLength && totalBytes !== declaredLength)
    throw new MediaIncompleteError('WhatsApp gateway returned incomplete media');
  return Buffer.concat(chunks, totalBytes);
}

function createMediaInspector(headers: Headers) {
  const rawDeclaredLength = headers.get('content-length');
  const declaredLength = rawDeclaredLength === null ? NaN : Number(rawDeclaredLength);
  const canVerifyLength =
    Number.isSafeInteger(declaredLength) &&
    declaredLength >= 0 &&
    (!headers.has('content-encoding') || headers.get('content-encoding') === 'identity');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_BYTES)
    throw new MediaTooLargeError('Media exceeds the 10 MiB limit');

  let totalBytes = 0;
  let prefixBytes = 0;
  const prefix: Buffer[] = [];
  const transform = new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback) {
      const bytes = Buffer.from(chunk);
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_ATTACHMENT_BYTES) {
        callback(new MediaTooLargeError('Media exceeds the 10 MiB limit'));
        return;
      }
      if (prefixBytes < 64 * 1024) {
        const sample = bytes.subarray(0, 64 * 1024 - prefixBytes);
        prefix.push(sample);
        prefixBytes += sample.byteLength;
      }
      callback(null, bytes);
    },
    flush(callback) {
      if (canVerifyLength && totalBytes !== declaredLength) {
        callback(new MediaIncompleteError('WhatsApp gateway returned incomplete media'));
        return;
      }
      callback();
    },
  });
  return { transform, getPrefix: () => Buffer.concat(prefix, prefixBytes) };
}

async function streamResponseToStorage(
  response: Response,
  storage: AttachmentStorage,
  key: string
): Promise<{ mime: string }> {
  if (!response.body) throw new Error('WhatsApp gateway returned an empty media body');
  const readable = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>);
  let inspector: ReturnType<typeof createMediaInspector>;
  try {
    inspector = createMediaInspector(response.headers);
  } catch (error) {
    await response.body.cancel().catch(() => undefined);
    throw error;
  }
  const passThrough = new PassThrough();
  const transfer = pipeline(readable, inspector.transform, passThrough);
  const storing = storage.putStream!(key, passThrough, MAX_ATTACHMENT_BYTES);
  try {
    await Promise.all([transfer, storing]);
  } catch (error) {
    readable.destroy(error instanceof Error ? error : undefined);
    passThrough.destroy(error instanceof Error ? error : undefined);
    await Promise.allSettled([transfer, storing]);
    await storage.delete(key).catch(() => undefined);
    throw error;
  }
  if (inspector.getPrefix().length === 0) {
    await storage.delete(key).catch(() => undefined);
    throw new MediaEmptyError('WhatsApp gateway returned empty media');
  }
  return { mime: sniffMime(inspector.getPrefix()) ?? 'application/octet-stream' };
}

async function peekReadable(
  source: Readable,
  maxPrefixBytes = 64 * 1024
): Promise<{ prefix: Buffer; stream: Readable }> {
  const iterator = source[Symbol.asyncIterator]();
  const prefix: Buffer[] = [];
  let prefixBytes = 0;
  let remainder: Buffer | null = null;
  while (prefixBytes < maxPrefixBytes) {
    const next = await iterator.next();
    if (next.done) break;
    const chunk = Buffer.from(next.value);
    const length = Math.min(chunk.byteLength, maxPrefixBytes - prefixBytes);
    prefix.push(chunk.subarray(0, length));
    prefixBytes += length;
    if (length < chunk.byteLength) {
      remainder = chunk.subarray(length);
      break;
    }
  }
  const head = Buffer.concat(prefix, prefixBytes);
  const stream = Readable.from(
    (async function* () {
      if (head.length) yield head;
      if (remainder?.length) yield remainder;
      while (true) {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
      }
    })()
  );
  return { prefix: head, stream };
}

function limitReadable(source: Readable, maxBytes: number): Readable {
  return Readable.from(
    (async function* () {
      let totalBytes = 0;
      for await (const chunk of source) {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes)
          throw new MediaTooLargeError('Media exceeds the 10 MiB limit');
        yield chunk;
      }
    })()
  );
}

function id(value: string): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function providerTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

const AMBIGUOUS_SEND_MATCH_WINDOW_MS = 2 * 60 * 1_000;

async function reconcileAmbiguousOutboundMessage(input: {
  db: Knex;
  companyId: number;
  conversationId: number;
  externalId: string;
  content: string;
  messageType: string;
  timestamp: string;
}): Promise<boolean> {
  const timestampMs = Date.parse(input.timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  const existing = await input.db('whatsapp_messages')
    .where({ company_id: input.companyId, external_id: input.externalId })
    .first();
  const pending = await input.db('whatsapp_messages')
    .where({
      company_id: input.companyId,
      conversation_id: input.conversationId,
      direction: 'outbound',
      message_type: input.messageType,
    })
    .where((builder: Knex.QueryBuilder) =>
      input.content
        ? builder.where('content', input.content)
        : builder.where('content', '').orWhereNull('content')
    )
    .whereIn('status', ['unknown', 'sending'])
    .where('external_id', 'like', 'pending:%');
  const candidates = pending.filter((message) => {
    const createdAt = Date.parse(String(message.create_date ?? ''));
    return (
      Number.isFinite(createdAt) &&
      Math.abs(createdAt - timestampMs) <= AMBIGUOUS_SEND_MATCH_WINDOW_MS
    );
  });
  if (candidates.length !== 1) return false;
  const candidate = candidates[0]!;
  const updateCandidate = async (db: Knex): Promise<number> =>
    Number(
      await db('whatsapp_messages')
        .where({
          id: candidate.id,
          company_id: input.companyId,
          status: candidate.status,
          external_id: candidate.external_id,
        })
        .update({
          external_id: input.externalId.slice(0, 255),
          status: 'sent',
          retryable: false,
          last_error: null,
          write_date: new Date().toISOString(),
        })
    );
  if (!existing) return (await updateCandidate(input.db)) === 1;

  // A concurrent history sync may have inserted GoWA's echo before this request claimed the
  // pending row. Collapse only an exact, uniquely matched outbound duplicate inside one transaction.
  const existingTime = Date.parse(String(existing.create_date ?? ''));
  const duplicateMatches =
    existing.id !== candidate.id &&
    existing.company_id === input.companyId &&
    existing.conversation_id === input.conversationId &&
    existing.direction === 'outbound' &&
    existing.message_type === input.messageType &&
    (existing.content ?? '') === input.content &&
    Number.isFinite(existingTime) &&
    Math.abs(existingTime - timestampMs) <= AMBIGUOUS_SEND_MATCH_WINDOW_MS;
  if (!duplicateMatches) return false;
  return input.db.transaction(async (trx) => {
    const deleted = await trx('whatsapp_messages')
      .where({
        id: existing.id,
        company_id: input.companyId,
        external_id: input.externalId,
      })
      .delete();
    if (Number(deleted) !== 1) return false;
    const updated = await updateCandidate(trx);
    if (updated !== 1) throw new Error('Ambiguous WhatsApp message changed during reconciliation');
    return true;
  });
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

type WhatsappAction = 'create' | 'write';
type WhatsappModel = 'whatsapp.account' | 'whatsapp.conversation' | 'whatsapp.message';

function canPerformWhatsAppAction(
  auth: {
    role: string;
    groupPermissions: readonly { model_name: string; create: boolean; write: boolean }[];
  },
  model: WhatsappModel,
  action: WhatsappAction
): boolean {
  if (auth.role === 'system' || auth.role === 'superadmin') return true;
  return auth.groupPermissions.some((grant) => grant.model_name === model && grant[action]);
}

function requireWhatsAppAction(
  req: {
    auth: {
      role: string;
      groupPermissions: readonly { model_name: string; create: boolean; write: boolean }[];
    } | null;
  },
  reply: { code: (n: number) => { send: (x: unknown) => unknown } },
  model: WhatsappModel,
  action: WhatsappAction
): boolean {
  if (req.auth && canPerformWhatsAppAction(req.auth, model, action)) return true;
  reply
    .code(403)
    .send({ success: false, error: 'You do not have permission to perform this WhatsApp action' });
  return false;
}

function whatsappPermissions(auth: {
  role: string;
  groupPermissions: readonly { model_name: string; create: boolean; write: boolean }[];
}) {
  return {
    manage: canPerformWhatsAppAction(auth, 'whatsapp.account', 'write'),
    manageConversations: canPerformWhatsAppAction(auth, 'whatsapp.conversation', 'write'),
    createConversation: canPerformWhatsAppAction(auth, 'whatsapp.conversation', 'create'),
    send: canPerformWhatsAppAction(auth, 'whatsapp.message', 'create'),
  };
}

async function recordWhatsAppAudit(
  req: FastifyRequest,
  model: 'whatsapp.account' | 'whatsapp.conversation' | 'whatsapp.message',
  operation: string,
  recordId: number,
  companyId: number,
  trx?: Knex.Transaction
): Promise<void> {
  const audit = trx ? trx('audit_logs') : req.server.db('audit_logs');
  await audit.insert({
    model,
    record_id: recordId,
    operation,
    actor_id: req.auth?.userId ?? null,
    changes: JSON.stringify({ area: 'whatsapp', company_id: companyId }),
  });
}

export const whatsappRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.post<{ Params: { deviceId: string } }>(
    '/whatsapp/gowa/webhook/:deviceId',
    { bodyLimit: MAX_GOWA_WEBHOOK_BYTES, preParsing: captureGowaWebhookBody() },
    async (req, reply) => {
      const raw = rawWebhookBodies.get(req);
      if (!raw || !validGowaWebhookSignature(raw, req.headers['x-hub-signature-256']))
        return reply.code(401).send({ success: false, error: 'Invalid webhook signature' });
      const account = await WhatsappAccount.query().findOne({ gateway_device_id: req.params.deviceId });
      if (!account) return reply.code(404).send({ success: false, error: 'Unknown device' });
      const body = req.body as {
        event?: unknown;
        session_id?: unknown;
        payload?: Record<string, unknown>;
      } | null;
      if (body?.session_id !== account.gateway_device_id)
        return reply.code(403).send({ success: false, error: 'Webhook device mismatch' });
      if (body?.event === 'message') {
        const payload = body.payload;
        const externalId = typeof payload?.id === 'string' ? payload.id.slice(0, 255) : '';
        const jid = typeof payload?.chat_id === 'string' ? payload.chat_id : '';
        const timestamp = providerTimestamp(payload?.timestamp);
        if (!externalId || !/^[^\s@]{1,200}@(s\.whatsapp\.net|g\.us|lid)$/u.test(jid) || !timestamp)
          return reply.code(204).send();
        const fromMe = payload?.is_from_me === true;
        const mediaField = ['image', 'video', 'video_note', 'audio', 'document', 'sticker'].find((field) => {
          const value = payload?.[field];
          return (typeof value === 'string' && value.length > 0) || (value !== null && typeof value === 'object');
        });
        const messageType = mediaField === 'video_note' ? 'video' : mediaField ?? 'text';
        const mediaValue = mediaField ? payload?.[mediaField] : null;
        const content = typeof payload?.body === 'string' ? payload.body.slice(0, 8000) : '';
        const senderJid = typeof payload?.from === 'string' ? payload.from.slice(0, 255) : null;
        const isGroup = jid.endsWith('@g.us');
        const chatName = typeof payload?.chat_name === 'string' ? payload.chat_name.trim() : '';
        const preserveConversationName = isGroup || fromMe;
        const conversationName = chatName || (preserveConversationName
          ? jid
          : (typeof payload?.sender_display_name === 'string' && payload.sender_display_name.trim()) ||
            (typeof payload?.from_name === 'string' && payload.from_name.trim()) ||
            jid);
        await app.db.transaction(async (trx) => {
          const [conversation] = await trx('whatsapp_conversations')
            .insert({
              company_id: account.company_id,
              account_id: account.id,
              jid,
              name: conversationName.slice(0, 255),
              is_group: isGroup,
              unread_count: 0,
              last_message: content || (mediaField ? `[${mediaField}]` : ''),
              last_message_at: timestamp,
            })
            .onConflict(['company_id', 'jid'])
            .merge({
              account_id: account.id,
              name: preserveConversationName && !chatName
                ? trx.raw('whatsapp_conversations.name')
                : conversationName.slice(0, 255),
              is_group: isGroup,
              last_message: trx.raw(
                'CASE WHEN whatsapp_conversations.last_message_at IS NULL OR excluded.last_message_at > whatsapp_conversations.last_message_at THEN excluded.last_message ELSE whatsapp_conversations.last_message END'
              ),
              last_message_at: trx.raw(
                'CASE WHEN whatsapp_conversations.last_message_at IS NULL OR excluded.last_message_at > whatsapp_conversations.last_message_at THEN excluded.last_message_at ELSE whatsapp_conversations.last_message_at END'
              ),
              write_date: new Date().toISOString(),
            })
            .returning(['id']);
          const storedConversation = conversation ?? (await trx('whatsapp_conversations')
            .where({ company_id: account.company_id, jid }).first('id'));
          if (!storedConversation) throw new Error('GoWA webhook conversation upsert failed');
          if (fromMe && await reconcileAmbiguousOutboundMessage({
            db: trx,
            companyId: account.company_id,
            conversationId: storedConversation.id,
            externalId,
            content,
            messageType,
            timestamp,
          })) return;
          const inserted = await trx('whatsapp_messages')
            .insert({
              company_id: account.company_id,
              account_id: account.id,
              conversation_id: storedConversation.id,
              external_id: externalId,
              direction: fromMe ? 'outbound' : 'inbound',
              message_type: messageType,
              content,
              status: fromMe ? 'sent' : 'received',
              media_mime_type: mediaField
                ? typeof payload?.mime_type === 'string'
                  ? safeMime(payload.mime_type)
                  : mediaDefaultMime(messageType)
                : null,
              media_file_name: typeof payload?.filename === 'string'
                ? payload.filename.slice(0, 255)
                : mediaValue && typeof mediaValue === 'object' && 'filename' in mediaValue && typeof mediaValue.filename === 'string'
                  ? mediaValue.filename.slice(0, 255)
                  : null,
              sender_jid: senderJid,
            })
            .onConflict(['company_id', 'external_id'])
            .ignore()
            .returning(['id']);
          if (inserted.length && !fromMe) {
            await trx('whatsapp_conversations')
              .where({ id: storedConversation.id, company_id: account.company_id })
              .increment('unread_count', 1);
          }
        });
        return reply.code(204).send();
      }
      if (body?.event !== 'message.ack') return reply.code(204).send();
      const receipt = body.payload;
      const status = receipt?.receipt_type === 'read' ? 'read' : receipt?.receipt_type === 'delivered' ? 'delivered' : null;
      const ids = Array.isArray(receipt?.ids)
        ? [...new Set(receipt.ids.filter((value): value is string => typeof value === 'string' && value.length > 0))].slice(0, 100)
        : [];
      if (!status || ids.length === 0) return reply.code(204).send();
      const eligibleStatuses = status === 'read' ? ['sent', 'delivered'] : ['sent'];
      for (const externalId of ids) {
        await app.db('whatsapp_messages')
          .where({ company_id: account.company_id, external_id: externalId, direction: 'outbound' })
          .whereIn('status', eligibleStatuses)
          .update({ status, write_date: new Date().toISOString() });
      }
      return reply.code(204).send();
    }
  );

  app.get('/whatsapp/account', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account)
      return {
        success: true,
        data: {
          status: 'disconnected',
          phone_number: null,
          qr_code: null,
          permissions: whatsappPermissions(req.auth!),
        },
      };
    let status = account.status;
    let phoneNumber = account.phone_number;
    let lastError = account.last_error;
    let qrCode: string | null = null;
    if (!account.gateway_device_id) {
      status = 'disconnected';
      phoneNumber = null;
      lastError = account.status === 'disconnected'
        ? account.last_error
        : 'WhatsApp device mapping is missing. Connect again.';
      await WhatsappAccount.query()
        .where({ id: account.id, company_id: companyId })
        .patch({ status, phone_number: null, qr_code: null, last_error: lastError });
    } else {
      try {
        const upstream = await gowaRequest<{
          is_connected?: boolean;
          is_logged_in?: boolean;
          jid?: string;
        }>(`/devices/${encodeURIComponent(account.gateway_device_id)}/status`);
        status =
          upstream.is_connected && upstream.is_logged_in
            ? 'connected'
            : upstream.is_logged_in
              ? 'reconnecting'
              : 'disconnected';
        phoneNumber = upstream.jid?.split('@')[0] ?? (upstream.is_logged_in ? phoneNumber : null);
        if (status === 'connected') {
          lastError = null;
          await WhatsappAccount.query()
            .where({ id: account.id, company_id: companyId })
            .patch({ status, phone_number: phoneNumber, qr_code: null, last_error: null });
        } else if (account.qr_code) {
          try {
            const image = await gowaBinary(gowaOriginPath(account.qr_code));
            qrCode = `data:${image.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
            status = 'qr';
          } catch (error) {
            if (!(error instanceof GowaError && error.statusCode === 404)) throw error;
            status = 'qr_expired';
            lastError = 'QR code expired. Request a new code to continue pairing.';
            await WhatsappAccount.query()
              .where({ id: account.id, company_id: companyId })
              .patch({ status, qr_code: null, last_error: lastError });
          }
        } else {
          await WhatsappAccount.query()
            .where({ id: account.id, company_id: companyId })
            .patch({ status, phone_number: phoneNumber, qr_code: null, last_error: null });
          lastError = null;
        }
      } catch (error) {
        if (!(error instanceof GowaError && error.statusCode === 404)) {
          status = 'error';
          await WhatsappAccount.query()
            .where({ id: account.id, company_id: companyId })
            .patch({ status, last_error: 'WhatsApp gateway is temporarily unavailable' });
          lastError = 'WhatsApp gateway is temporarily unavailable';
        } else {
          status = 'disconnected';
          await WhatsappAccount.query()
            .where({ id: account.id, company_id: companyId })
            .patch({ status, qr_code: null, phone_number: null, last_error: null });
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
        permissions: whatsappPermissions(req.auth!),
      },
    };
  });

  app.post('/whatsapp/connect', whatsappRateLimit(5), async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    if (!requireWhatsAppAction(req, reply, 'whatsapp.account', 'write')) return;
    const result = await app.db.transaction(async (trx) => {
      if (String(app.db.client.config.client).includes('pg')) {
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?), ?)', [
          'moonwitness.whatsapp.connect',
          companyId,
        ]);
      }
      await trx('whatsapp_accounts')
        .insert({ company_id: companyId, status: 'connecting' })
        .onConflict('company_id')
        .ignore();
      const account = await WhatsappAccount.query(trx).findOne({ company_id: companyId });
      if (!account) throw new Error('WhatsApp account could not be created');
      if (account.status === 'qr' && account.qr_code && account.gateway_device_id) {
        try {
          const gatewayStatus = await gowaRequest<{
            is_connected?: boolean;
            is_logged_in?: boolean;
            jid?: string;
          }>(`/devices/${encodeURIComponent(account.gateway_device_id ?? '')}/status`);
          if (gatewayStatus.is_connected && gatewayStatus.is_logged_in) {
            const phoneNumber = gatewayStatus.jid?.split('@')[0] ?? account.phone_number;
            await WhatsappAccount.query(trx)
              .where({ id: account.id, company_id: companyId })
              .patch({
                status: 'connected',
                phone_number: phoneNumber,
                qr_code: null,
                last_error: null,
              });
            await recordWhatsAppAudit(req, 'whatsapp.account', 'connect', account.id, companyId, trx);
            return {
              statusCode: 200,
              body: {
                success: true,
                data: { id: account.id, status: 'connected', phone_number: phoneNumber },
              },
            };
          }
        } catch {
          // Keep the current QR; the status endpoint will report gateway availability separately.
        }
        await recordWhatsAppAudit(req, 'whatsapp.account', 'connect', account.id, companyId, trx);
        return {
          statusCode: 202,
          body: { success: true, data: { id: account.id, status: 'qr' } },
        };
      }
      const deviceId = account.gateway_device_id || `moonwitness-company-${companyId}`;
      await WhatsappAccount.query(trx).where({ id: account.id, company_id: companyId }).patch({
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
        const webhookOrigin = process.env.WHATSAPP_WEBHOOK_URL;
        const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
        if (Boolean(webhookOrigin) !== Boolean(webhookSecret)) throw new Error('GoWA webhook URL and secret must be configured together');
        if (webhookOrigin && webhookSecret) {
          const origin = new URL(webhookOrigin);
          if (
            webhookSecret.length < 32 ||
            !['http:', 'https:'].includes(origin.protocol) ||
            origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
            (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')
          ) throw new Error('Invalid GoWA webhook configuration');
          const callback = new URL(`/whatsapp/gowa/webhook/${encodeURIComponent(deviceId)}`, origin);
          await gowaRequest(`/devices/${encodeURIComponent(deviceId)}/webhook`, {
            method: 'PATCH',
            contentType: 'application/json',
            body: JSON.stringify({
              webhook_url: callback.toString(),
              webhook_secret: webhookSecret,
              webhook_events: 'message,message.ack',
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
          await WhatsappAccount.query(trx).where({ id: account.id, company_id: companyId }).patch({
            status: 'connected',
            phone_number: phoneNumber,
            qr_code: null,
            last_error: null,
            write_date: new Date().toISOString(),
          });
          return {
            statusCode: 200,
            body: {
              success: true,
              data: { id: account.id, status: 'connected', phone_number: phoneNumber },
            },
          };
        }
        const qr = await gowaRequest<{ qr_link?: string }>(
          `/devices/${encodeURIComponent(deviceId)}/login`
        );
        const qrPath = typeof qr.qr_link === 'string' ? gowaOriginPath(qr.qr_link) : null;
        await WhatsappAccount.query(trx)
          .where({ id: account.id, company_id: companyId })
          .patch({
            status: qrPath ? 'qr' : 'connecting',
            qr_code: qrPath,
            last_error: null,
            write_date: new Date().toISOString(),
          });
        await recordWhatsAppAudit(req, 'whatsapp.account', 'connect', account.id, companyId, trx);
        return {
          statusCode: 202,
          body: { success: true, data: { id: account.id, status: qrPath ? 'qr' : 'connecting' } },
        };
      } catch {
        await WhatsappAccount.query(trx).where({ id: account.id, company_id: companyId }).patch({
          status: 'error',
          last_error: 'WhatsApp gateway is temporarily unavailable',
        });
        await recordWhatsAppAudit(req, 'whatsapp.account', 'connect_failed', account.id, companyId, trx);
        return {
          statusCode: 502,
          body: { success: false, error: 'Could not start WhatsApp pairing' },
        };
      }
    });
    return reply.code(result.statusCode).send(result.body);
  });

  app.post('/whatsapp/disconnect', whatsappRateLimit(5), async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    if (!requireWhatsAppAction(req, reply, 'whatsapp.account', 'write')) return;
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
    if (account) await recordWhatsAppAudit(req, 'whatsapp.account', 'disconnect', account.id, companyId);
    return { success: true, data: { status: 'disconnected' } };
  });

  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      search?: string;
      archived?: string;
      unread?: string;
    };
  }>('/whatsapp/conversations', async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const archived = req.query.archived === 'true';
    const unreadOnly = req.query.unread === 'true';
    if (req.query.archived !== undefined && !['true', 'false'].includes(req.query.archived)) {
      return reply.code(400).send({ success: false, error: 'Archived must be true or false' });
    }
    if (req.query.unread !== undefined && !['true', 'false'].includes(req.query.unread)) {
      return reply.code(400).send({ success: false, error: 'Unread must be true or false' });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return reply.code(400).send({ success: false, error: 'Limit must be between 1 and 100' });
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) {
      return reply.code(400).send({ success: false, error: 'Offset must be between 0 and 10000' });
    }
    if (search.length > 100) {
      return reply.code(400).send({ success: false, error: 'Search must be 100 characters or fewer' });
    }
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account?.gateway_device_id) return { success: true, data: [] };
    const providerLimit = offset === 0 ? Math.max(100, limit) : limit;
    const upstream = await gowaRequest<{ data?: Array<Record<string, unknown>> }>(
      `/chats?limit=${providerLimit}&offset=${offset}&archived=${archived}`,
      { deviceId: account.gateway_device_id }
    );
    const chats = new Map((upstream.data ?? []).map((chat) => [chat.jid, chat]));
    if (search) {
      const matchingChats = await gowaRequest<{ data?: Array<Record<string, unknown>> }>(
        `/chats?limit=100&offset=0&archived=${archived}&search=${encodeURIComponent(search)}`,
        { deviceId: account.gateway_device_id }
      );
      for (const chat of matchingChats.data ?? []) chats.set(chat.jid, chat);
    }
    const primaryChats = [...(upstream.data ?? [])].slice(0, limit);
    const primaryJids = primaryChats
      .map((chat) => (typeof chat.jid === 'string' ? chat.jid : ''))
      .filter((jid) => /^[^\s@]{1,200}@(s\.whatsapp\.net|g\.us|lid)$/u.test(jid));
    const existingPreviewRows = primaryJids.length
      ? await app
          .db('whatsapp_conversations')
          .select('jid', 'last_message', 'last_message_at', 'last_message_sync_at')
          .where({ company_id: companyId })
          .whereIn('jid', primaryJids)
      : [];
    const existingPreviewByJid = new Map(
      existingPreviewRows.map((row) => [String(row.jid), row])
    );
    for (const chat of chats.values()) {
      const jid = typeof chat.jid === 'string' ? chat.jid : '';
      if (!/^[^\s@]{1,200}@(s\.whatsapp\.net|g\.us|lid)$/u.test(jid)) continue;
      const lastMessageAt =
        providerTimestamp(chat.last_message_time);
      await app
        .db('whatsapp_conversations')
        .insert({
          company_id: companyId,
          account_id: account.id,
          jid,
          name: typeof chat.name === 'string' && chat.name ? chat.name.slice(0, 255) : jid,
          is_group: jid.endsWith('@g.us'),
          is_archived: chat.archived === true,
          unread_count: 0,
          last_message_at: lastMessageAt,
        })
        .onConflict(['company_id', 'jid'])
        .merge({
          name: typeof chat.name === 'string' && chat.name ? chat.name.slice(0, 255) : jid,
          is_group: jid.endsWith('@g.us'),
          is_archived: chat.archived === true,
          last_message_at: app.db.raw(
            'CASE WHEN whatsapp_conversations.last_message_at IS NULL OR excluded.last_message_at > whatsapp_conversations.last_message_at THEN excluded.last_message_at ELSE whatsapp_conversations.last_message_at END'
          ),
          write_date: new Date().toISOString(),
        });
    }
    const chatsNeedingPreview = primaryChats.filter((chat) => {
      const jid = typeof chat.jid === 'string' ? chat.jid : '';
      if (!primaryJids.includes(jid)) return false;
      const providerTime = providerTimestamp(chat.last_message_time);
      if (!providerTime) return false;
      const existing = existingPreviewByJid.get(jid);
      const syncedTime = providerTimestamp(existing?.last_message_sync_at);
      return !syncedTime || Date.parse(providerTime) > Date.parse(syncedTime);
    });
    let previewIndex = 0;
    const previewWorkers = Array.from(
      { length: Math.min(4, chatsNeedingPreview.length) },
      async () => {
        while (previewIndex < chatsNeedingPreview.length) {
          const chat = chatsNeedingPreview[previewIndex++]!;
          const jid = String(chat.jid);
          try {
            const conversation = await WhatsappConversation.query().findOne({
              company_id: companyId,
              jid,
            });
            if (!conversation) continue;
            const latest = await gowaRequest<{ data?: Array<Record<string, unknown>> }>(
              `/chat/${encodeURIComponent(jid)}/messages?limit=100&offset=0`,
              { deviceId: account.gateway_device_id! }
            );
            const latestMessage = (latest.data ?? []).reduce<{
              item: Record<string, unknown>;
              timestamp: string;
            } | null>((current, item) => {
              const timestamp = providerTimestamp(item.timestamp);
              return timestamp && (!current || Date.parse(timestamp) > Date.parse(current.timestamp))
                ? { item, timestamp }
                : current;
            }, null);
            const providerTime = providerTimestamp(chat.last_message_time);
            if (!latestMessage) {
              if (providerTime) {
                await app
                  .db('whatsapp_conversations')
                  .where({ company_id: companyId, jid })
                  .update({ last_message_sync_at: providerTime, write_date: new Date().toISOString() });
              }
              continue;
            }
            const recentMessages = new Map<string, Record<string, unknown>>();
            for (const item of latest.data ?? []) {
              if (typeof item.id !== 'string' || !item.id) continue;
              const timestamp = providerTimestamp(item.timestamp);
              if (!timestamp) continue;
              const fromMe = item.is_from_me === true;
              const rawType = typeof item.media_type === 'string' ? item.media_type : 'text';
              const messageType = [
                'text',
                'image',
                'video',
                'audio',
                'document',
                'sticker',
              ].includes(rawType)
                ? rawType
                : 'text';
              recentMessages.set(item.id, {
                company_id: companyId,
                account_id: account.id,
                conversation_id: conversation.id,
                external_id: item.id.slice(0, 255),
                direction: fromMe ? 'outbound' : 'inbound',
                message_type: messageType,
                content: typeof item.content === 'string' ? item.content.slice(0, 8000) : '',
                status: fromMe ? 'sent' : 'received',
                media_mime_type:
                  item.mime_type !== undefined
                    ? safeMime(item.mime_type)
                    : mediaDefaultMime(messageType),
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
              });
            }
            const recentMessageRows = [...recentMessages.values()];
            for (let index = 0; index < recentMessageRows.length; index += 25) {
              await app
                .db('whatsapp_messages')
                .insert(recentMessageRows.slice(index, index + 25))
                .onConflict(['company_id', 'external_id'])
                .merge(['content', 'status', 'write_date']);
            }
            const itemType =
              typeof latestMessage.item.media_type === 'string'
                ? latestMessage.item.media_type.slice(0, 24)
                : '';
            const preview =
              typeof latestMessage.item.content === 'string' && latestMessage.item.content
                ? latestMessage.item.content.slice(0, 8_000)
                : itemType
                  ? `[${itemType}]`
                  : '[message]';
            await app
              .db('whatsapp_conversations')
              .where({ company_id: companyId, jid })
              .where((builder) =>
                builder
                  .whereNull('last_message_at')
                  .orWhere('last_message_at', '<=', latestMessage.timestamp)
              )
              .update({
                last_message: preview,
                last_message_at: latestMessage.timestamp,
                write_date: new Date().toISOString(),
              });
            if (providerTime) {
              await app
                .db('whatsapp_conversations')
                .where({ company_id: companyId, jid })
                .update({ last_message_sync_at: providerTime, write_date: new Date().toISOString() });
            }
          } catch (error) {
            req.log.warn(
              { error: whatsappLogErrorContext(error) },
              'WhatsApp conversation preview refresh failed'
            );
          }
        }
      }
    );
    await Promise.all(previewWorkers);
    const query = WhatsappConversation.query().where({
      company_id: companyId,
      is_archived: archived,
    });
    const readCursorTimestampSql =
      app.db.client.config.client === 'pg'
        ? 'read_cursor.last_read_at::timestamptz'
        : 'read_cursor.last_read_at';
    const unreadMessages = () =>
      app
        .db('whatsapp_messages as unread_message')
        .select(app.db.raw('1'))
        .whereRaw('unread_message.conversation_id = whatsapp_conversations.id')
        .whereRaw('unread_message.company_id = whatsapp_conversations.company_id')
        .where('unread_message.direction', 'inbound')
        .whereNotExists(
          app
            .db('whatsapp_conversation_reads as read_cursor')
            .select(app.db.raw('1'))
            .whereRaw('read_cursor.conversation_id = unread_message.conversation_id')
            .whereRaw('read_cursor.company_id = unread_message.company_id')
            .where('read_cursor.user_id', req.auth!.userId)
            .where((builder) =>
              builder
                .whereRaw(`unread_message.create_date < ${readCursorTimestampSql}`)
                .orWhereRaw(
                  `(unread_message.create_date = ${readCursorTimestampSql} AND unread_message.id <= read_cursor.last_read_message_id)`
                )
            )
        );
    if (unreadOnly) query.whereExists(unreadMessages());
    if (search) {
      const pattern = `%${search.toLocaleLowerCase()}%`;
      query.where((builder) =>
        builder
          .whereRaw('LOWER(name) LIKE ?', [pattern])
          .orWhereRaw('LOWER(jid) LIKE ?', [pattern])
          .orWhereExists(
            app
              .db('whatsapp_messages')
              .select(app.db.raw('1'))
              .whereRaw('whatsapp_messages.conversation_id = whatsapp_conversations.id')
              .whereRaw('LOWER(whatsapp_messages.content) LIKE ?', [pattern])
          )
      );
    }
    const conversations = await query
      .orderBy('is_pinned', 'desc')
      .orderBy('last_message_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset);
    const conversationIds = conversations.map((conversation) => conversation.id);
    const unreadRows = conversationIds.length
      ? await app
          .db('whatsapp_messages as unread_message')
          .leftJoin('whatsapp_conversation_reads as read_cursor', function joinReadCursor() {
            this.on('read_cursor.company_id', '=', 'unread_message.company_id')
              .andOn('read_cursor.conversation_id', '=', 'unread_message.conversation_id')
              .andOn('read_cursor.user_id', '=', app.db.raw('?', [req.auth!.userId]));
          })
          .select('unread_message.conversation_id')
          .count({ unread_count: 'unread_message.id' })
          .where('unread_message.company_id', companyId)
          .whereIn('unread_message.conversation_id', conversationIds)
          .where('unread_message.direction', 'inbound')
          .where((builder) =>
            builder
              .whereNull('read_cursor.id')
              .orWhereRaw(`unread_message.create_date > ${readCursorTimestampSql}`)
              .orWhereRaw(
                `(unread_message.create_date = ${readCursorTimestampSql} AND unread_message.id > read_cursor.last_read_message_id)`
              )
          )
          .groupBy('unread_message.conversation_id')
      : [];
    const unreadCountByConversation = new Map(
      (unreadRows as Array<{ conversation_id: number; unread_count: number | string }>).map(
        (row) => [Number(row.conversation_id), Number(row.unread_count)]
      )
    );
    return {
      success: true,
      data: conversations.map((conversation) => ({
        ...conversation,
        unread_count: unreadCountByConversation.get(conversation.id) ?? 0,
      })),
    };
  });

  app.post<{ Params: Params; Body: unknown }>(
    '/whatsapp/conversations/:id/archive',
    whatsappRateLimit(10),
    async (req, reply) => {
      const companyId = requireCompany(req, reply);
      if (!companyId) return;
      if (!requireWhatsAppAction(req, reply, 'whatsapp.conversation', 'write')) return;
      const conversationId = id(req.params.id);
      const body = isRecord(req.body) ? req.body : null;
      const archived = body?.archived;
      if (!conversationId || typeof archived !== 'boolean' || Object.keys(body ?? {}).length !== 1)
        return reply.code(400).send({ success: false, error: 'Invalid archive request' });
      const conversation = await WhatsappConversation.query().findOne({
        id: conversationId,
        company_id: companyId,
      });
      if (!conversation)
        return reply.code(404).send({ success: false, error: 'Conversation not found' });
      const account = await WhatsappAccount.query().findOne({ company_id: companyId });
      if (!account?.gateway_device_id)
        return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
      try {
        await gowaRequest(
          `/chat/${encodeURIComponent(conversation.jid)}/archive`,
          {
            method: 'POST',
            deviceId: account.gateway_device_id,
            contentType: 'application/json',
            body: JSON.stringify({ archived }),
          }
        );
      } catch (error) {
        req.log.warn(
          { error: whatsappLogErrorContext(error) },
          'WhatsApp conversation archive request failed'
        );
        return reply.code(502).send({ success: false, error: 'Could not update conversation archive' });
      }
      const updated = await app.db.transaction(async (trx) => {
        await WhatsappConversation.query(trx)
          .where({ id: conversationId, company_id: companyId })
          .patch({ is_archived: archived, write_date: new Date().toISOString() });
        await recordWhatsAppAudit(
          req,
          'whatsapp.conversation',
          archived ? 'archive' : 'unarchive',
          conversationId,
          companyId,
          trx
        );
        return WhatsappConversation.query(trx).findOne({
          id: conversationId,
          company_id: companyId,
        });
      });
      return { success: true, data: updated };
    }
  );

  app.post<{ Params: Params; Body: unknown }>(
    '/whatsapp/conversations/:id/pin',
    whatsappRateLimit(10),
    async (req, reply) => {
      const companyId = requireCompany(req, reply);
      if (!companyId) return;
      if (!requireWhatsAppAction(req, reply, 'whatsapp.conversation', 'write')) return;
      const conversationId = id(req.params.id);
      const body = isRecord(req.body) ? req.body : null;
      const pinned = body?.pinned;
      if (!conversationId || typeof pinned !== 'boolean' || Object.keys(body ?? {}).length !== 1)
        return reply.code(400).send({ success: false, error: 'Invalid pin request' });
      const conversation = await WhatsappConversation.query().findOne({
        id: conversationId,
        company_id: companyId,
      });
      if (!conversation)
        return reply.code(404).send({ success: false, error: 'Conversation not found' });
      const account = await WhatsappAccount.query().findOne({ company_id: companyId });
      if (!account?.gateway_device_id)
        return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
      try {
        await gowaRequest(
          `/chat/${encodeURIComponent(conversation.jid)}/pin`,
          {
            method: 'POST',
            deviceId: account.gateway_device_id,
            contentType: 'application/json',
            body: JSON.stringify({ pinned }),
          }
        );
      } catch (error) {
        req.log.warn(
          { error: whatsappLogErrorContext(error) },
          'WhatsApp conversation pin request failed'
        );
        return reply.code(502).send({ success: false, error: 'Could not update conversation pin' });
      }
      const updated = await app.db.transaction(async (trx) => {
        await WhatsappConversation.query(trx)
          .where({ id: conversationId, company_id: companyId })
          .patch({ is_pinned: pinned, write_date: new Date().toISOString() });
        await recordWhatsAppAudit(
          req,
          'whatsapp.conversation',
          pinned ? 'pin' : 'unpin',
          conversationId,
          companyId,
          trx
        );
        return WhatsappConversation.query(trx).findOne({
          id: conversationId,
          company_id: companyId,
        });
      });
      return { success: true, data: updated };
    }
  );

  app.post<{ Params: Params; Body: unknown }>(
    '/whatsapp/conversations',
    whatsappRateLimit(10),
    async (req, reply) => {
      const companyId = requireCompany(req, reply);
      if (!companyId) return;
      if (!requireWhatsAppAction(req, reply, 'whatsapp.conversation', 'create')) return;
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
    }
  );

  app.get<{
    Params: Params;
    Querystring: { limit?: string; offset?: string };
  }>('/whatsapp/conversations/:id/messages', async (req, reply) => {
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
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return reply.code(400).send({ success: false, error: 'Limit must be between 1 and 100' });
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5_000) {
      return reply.code(400).send({ success: false, error: 'Offset must be between 0 and 5000' });
    }
    const account = await WhatsappAccount.query().findOne({ company_id: companyId });
    if (!account?.gateway_device_id) return { success: true, data: [] };
    const latestCached = (await app
      .db('whatsapp_messages')
      .where({ conversation_id: conversationId, company_id: companyId })
      .max({ latest: 'create_date' })
      .first()) as { latest?: string | null } | undefined;
    const latestCachedAt = latestCached?.latest ? Date.parse(String(latestCached.latest)) : NaN;
    const incrementalStart =
      offset === 0 && Number.isFinite(latestCachedAt)
        ? `&start_time=${encodeURIComponent(new Date(latestCachedAt - 10 * 60_000).toISOString())}`
        : '';
    const providerLimit = offset === 0 ? Math.max(100, limit) : limit;
    const upstream = await gowaRequest<{ data?: Array<Record<string, unknown>> }>(
      `/chat/${encodeURIComponent(conversation.jid)}/messages?limit=${providerLimit}&offset=${offset}${incrementalStart}`,
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
      const timestamp = providerTimestamp(item.timestamp);
      if (!timestamp) continue;
      const content = typeof item.content === 'string' ? item.content.slice(0, 8000) : '';
      const externalId = item.id.slice(0, 255);
      if (fromMe) {
        await reconcileAmbiguousOutboundMessage({
          db: app.db,
          companyId,
          conversationId,
          externalId,
          content,
          messageType,
          timestamp,
        });
      }
      await app
        .db('whatsapp_messages')
        .insert({
          company_id: companyId,
          account_id: account.id,
          conversation_id: conversationId,
          external_id: externalId,
          direction: fromMe ? 'outbound' : 'inbound',
          message_type: messageType,
          content,
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
        'retryable',
        'last_error',
        'message_type',
        'media_mime_type',
        'media_file_name',
        'sender_jid',
        'create_date'
      )
      .where({ conversation_id: conversationId, company_id: companyId })
      .orderBy('create_date', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset);
    const latestProviderMessage = (upstream.data ?? []).reduce<Record<string, unknown> | null>(
      (latest, item) => {
        const timestamp = providerTimestamp(item.timestamp);
        const latestTimestamp = providerTimestamp(latest?.timestamp);
        return timestamp && (!latestTimestamp || Date.parse(timestamp) > Date.parse(latestTimestamp))
          ? item
          : latest;
      },
      null
    );
    const latestTime = providerTimestamp(latestProviderMessage?.timestamp);
    const shouldUpdateLatest =
      latestTime !== null &&
      (!conversation.last_message_at ||
        !Number.isFinite(Date.parse(conversation.last_message_at)) ||
        Date.parse(latestTime) > Date.parse(conversation.last_message_at));
    const latestContent = latestProviderMessage
      ? typeof latestProviderMessage.content === 'string' && latestProviderMessage.content
        ? latestProviderMessage.content.slice(0, 2000)
        : `[${String(latestProviderMessage.media_type ?? 'message')}]`
      : null;
    if (offset === 0) {
      await WhatsappConversation.query()
        .where({ id: conversationId, company_id: companyId })
        .patch({
          ...(shouldUpdateLatest && latestContent !== null ? { last_message: latestContent } : {}),
          ...(shouldUpdateLatest && latestTime !== null ? { last_message_at: latestTime } : {}),
          write_date: new Date().toISOString(),
        });
    }
    return { success: true, data: messages };
  });

  app.post<{ Params: Params }>(
    '/whatsapp/conversations/:id/read',
    whatsappRateLimit(30),
    async (req, reply) => {
    const companyId = requireCompany(req, reply);
    if (!companyId) return;
    if (!requireWhatsAppAction(req, reply, 'whatsapp.message', 'create')) return;
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
    if (!account?.gateway_device_id)
      return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
    const latestInbound = await WhatsappMessage.query()
      .findOne({ conversation_id: conversationId, company_id: companyId, direction: 'inbound' })
      .orderBy('create_date', 'desc')
      .orderBy('id', 'desc');
    if (!latestInbound) {
      return { success: true, data: { marked: false } };
    }
    const latestInboundAt = new Date(String(latestInbound.create_date)).toISOString();
    try {
      await gowaRequest(`/message/${encodeURIComponent(latestInbound.external_id)}/read`, {
        method: 'POST',
        deviceId: account.gateway_device_id,
        contentType: 'application/json',
        body: JSON.stringify({ phone: conversation.jid }),
      });
    } catch (error) {
      req.log.error(
        { error: whatsappLogErrorContext(error) },
        'WhatsApp mark-read request failed'
      );
      return reply.code(502).send({ success: false, error: 'Could not mark conversation as read' });
    }
    await app.db.transaction(async (trx) => {
      await trx('whatsapp_conversation_reads')
        .insert({
          company_id: companyId,
          conversation_id: conversationId,
          user_id: req.auth!.userId,
          last_read_message_id: latestInbound.id,
          last_read_at: latestInboundAt,
        })
        .onConflict(['company_id', 'conversation_id', 'user_id'])
        .merge({
          last_read_message_id: trx.raw(
            'CASE WHEN excluded.last_read_at > whatsapp_conversation_reads.last_read_at OR (excluded.last_read_at = whatsapp_conversation_reads.last_read_at AND excluded.last_read_message_id > whatsapp_conversation_reads.last_read_message_id) THEN excluded.last_read_message_id ELSE whatsapp_conversation_reads.last_read_message_id END'
          ),
          last_read_at: trx.raw(
            'CASE WHEN excluded.last_read_at > whatsapp_conversation_reads.last_read_at OR (excluded.last_read_at = whatsapp_conversation_reads.last_read_at AND excluded.last_read_message_id > whatsapp_conversation_reads.last_read_message_id) THEN excluded.last_read_at ELSE whatsapp_conversation_reads.last_read_at END'
          ),
          write_date: new Date().toISOString(),
        });
      await recordWhatsAppAudit(
        req,
        'whatsapp.message',
        'mark_read',
        latestInbound.id,
        companyId,
        trx
      );
    });
    return { success: true, data: { marked: true, message_id: latestInbound.id } };
    }
  );

  app.post<{ Params: Params; Body: unknown }>(
    '/whatsapp/conversations/:id/messages',
    { bodyLimit: MAX_ATTACHMENT_REQUEST_BYTES, ...whatsappRateLimit(20) },
    async (req, reply) => {
      const companyId = requireCompany(req, reply);
      if (!companyId) return;
      if (!requireWhatsAppAction(req, reply, 'whatsapp.message', 'create')) return;
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
      const idempotencyKey = req.headers['idempotency-key'];
      if (
        typeof idempotencyKey !== 'string' ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 128 ||
        !/^[A-Za-z0-9._:-]+$/u.test(idempotencyKey)
      )
        return reply
          .code(400)
          .send({ success: false, error: 'A valid Idempotency-Key is required' });
      const conversation = await WhatsappConversation.query().findOne({
        id: conversationId,
        company_id: companyId,
      });
      if (!conversation)
        return reply.code(404).send({ success: false, error: 'Conversation not found' });
      const account = await WhatsappAccount.query().findOne({ company_id: companyId });
      if (!body.content.trim() && typeof body.media_base64 !== 'string')
        return reply
          .code(400)
          .send({ success: false, error: 'Message must contain text or media' });
      let mediaBytes: Buffer | null = null;
      let mediaMime = safeMime(body.media_mime_type);
      const fileName = safeFileName(body.media_file_name);
      if (typeof body.media_base64 === 'string') {
        const encoded = body.media_base64.replace(/^data:[^,]+,/u, '');
        const bytes = Buffer.from(encoded, 'base64');
        if (!bytes.length || bytes.toString('base64') !== encoded)
          return reply
            .code(400)
            .send({ success: false, error: 'Media must be valid base64 up to 10 MiB' });
        if (bytes.length > MAX_ATTACHMENT_BYTES) {
          return reply.code(413).send({ success: false, error: 'Media exceeds the 10 MiB limit' });
        }
        const detectedMime = sniffMime(bytes);
        if (!mimeMatchesSignature(mediaMime, detectedMime)) {
          return reply.code(400).send({
            success: false,
            error: 'Media content does not match its declared file type',
          });
        }
        if (mediaMime === 'application/octet-stream' && detectedMime) mediaMime = detectedMime;
        mediaBytes = bytes;
      }
      const requestHash = createHash('sha256')
        .update(
          JSON.stringify({
            conversation_id: conversationId,
            content: body.content,
            media_mime_type: mediaMime,
            media_file_name: fileName,
          })
        )
        .update(mediaBytes ?? Buffer.alloc(0))
        .digest('hex');
      const existing = await WhatsappMessage.query().findOne({
        company_id: companyId,
        idempotency_key: idempotencyKey,
      });
      if (existing) {
        if (existing.request_hash !== requestHash)
          return reply
            .code(409)
            .send({ success: false, error: 'Idempotency key was used for another message' });
        return reply.code(202).send({ success: true, data: existing });
      }
      if (!account || !account.gateway_device_id || account.status !== 'connected')
        return reply.code(409).send({ success: false, error: 'WhatsApp account is not connected' });
      let mediaKey: string | null = null;
      try {
        if (mediaBytes) {
          mediaKey = randomUUID();
          await options.attachmentStorage.put(mediaKey, mediaBytes);
        }
        const message = await app.db.transaction(async (trx) => {
          const inserted = await WhatsappMessage.query(trx).insertAndFetch({
            company_id: companyId,
            account_id: account.id,
            conversation_id: conversationId,
            external_id: `pending:${idempotencyKey}`.slice(0, 255),
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            direction: 'outbound',
            message_type: mediaKey ? mediaType(mediaMime) : 'text',
            content: body.content,
            status: 'queued',
            attempt_count: 0,
            retryable: false,
            media_key: mediaKey,
            media_mime_type: mediaKey ? mediaMime : null,
            media_file_name: fileName,
          } as never);
          await OutboxEvent.query(trx).insert({
            event_type: WHATSAPP_SEND_EVENT,
            aggregate_model: 'whatsapp.message',
            aggregate_id: inserted.id,
            company_id: companyId,
            payload: JSON.stringify({ message_id: inserted.id }),
            status: 'pending',
            attempts: 0,
            max_attempts: 4,
            available_at: new Date().toISOString(),
          });
          await WhatsappConversation.query(trx)
            .where({ id: conversationId, company_id: companyId })
            .patch({
              last_message: (body.content as string) || (fileName ?? '[media]'),
              last_message_at: new Date().toISOString(),
            });
          await recordWhatsAppAudit(req, 'whatsapp.message', 'send_queued', inserted.id, companyId, trx);
          return inserted;
        });
        return reply.code(202).send({ success: true, data: message });
      } catch (error) {
        req.log.error({ error: whatsappLogErrorContext(error) }, 'WhatsApp message queue failed');
        const raced = await WhatsappMessage.query().findOne({
          company_id: companyId,
          idempotency_key: idempotencyKey,
        });
        if (mediaKey) await options.attachmentStorage.delete(mediaKey).catch(() => {});
        if (raced) {
          if (raced.request_hash === requestHash)
            return reply.code(202).send({ success: true, data: raced });
          return reply
            .code(409)
            .send({ success: false, error: 'Idempotency key was used for another message' });
        }
        return reply.code(mediaBytes ? 503 : 500).send({
          success: false,
          error: mediaBytes
            ? 'Media storage or queue is unavailable. Try again.'
            : 'Message could not be queued. Try again.',
        });
      }
    }
  );

  app.post<{ Params: Params }>(
    '/whatsapp/messages/:id/retry',
    whatsappRateLimit(10),
    async (req, reply) => {
      const companyId = requireCompany(req, reply);
      if (!companyId) return;
      if (!requireWhatsAppAction(req, reply, 'whatsapp.message', 'create')) return;
      const messageId = id(req.params.id);
      if (!messageId) return reply.code(400).send({ success: false, error: 'Invalid message ID' });
      const current = await WhatsappMessage.query().findOne({
        id: messageId,
        company_id: companyId,
        direction: 'outbound',
      });
      if (!current) return reply.code(404).send({ success: false, error: 'Message not found' });
      if (current.status === 'queued' || current.status === 'sending')
        return reply.code(202).send({ success: true, data: current });
      if (current.status !== 'failed' || !current.retryable)
        return reply.code(409).send({
          success: false,
          error:
            current.status === 'unknown'
              ? 'Delivery is uncertain. Verify the WhatsApp chat before trying again.'
              : 'This message cannot be retried.',
        });
      const message = await app.db.transaction(async (trx) => {
        const updated = await WhatsappMessage.query(trx)
          .where({ id: messageId, company_id: companyId, status: 'failed', retryable: true })
          .patch({ status: 'queued', retryable: false, last_error: null });
        if (updated !== 1) return null;
        await OutboxEvent.query(trx).insert({
          event_type: WHATSAPP_SEND_EVENT,
          aggregate_model: 'whatsapp.message',
          aggregate_id: messageId,
          company_id: companyId,
          payload: JSON.stringify({ message_id: messageId }),
          status: 'pending',
          attempts: 0,
          max_attempts: 4,
          available_at: new Date().toISOString(),
        });
        await recordWhatsAppAudit(req, 'whatsapp.message', 'retry_queued', messageId, companyId, trx);
        return WhatsappMessage.query(trx).findOne({ id: messageId, company_id: companyId });
      });
      if (!message) {
        const latest = await WhatsappMessage.query().findOne({
          id: messageId,
          company_id: companyId,
        });
        if (latest?.status === 'queued' || latest?.status === 'sending')
          return reply.code(202).send({ success: true, data: latest });
        return reply.code(409).send({ success: false, error: 'Message is no longer retryable' });
      }
      return reply.code(202).send({ success: true, data: message });
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
    let content: Buffer | null = null;
    let mediaStream: Readable | null = null;
    let verifiedMime: string | null = null;
    try {
      if (message.media_key && options.attachmentStorage.getStream) {
        const cachedStream = await options.attachmentStorage.getStream(message.media_key);
        if (cachedStream) {
          const inspected = await peekReadable(cachedStream);
          if (!inspected.prefix.length)
            return reply.code(404).send({ success: false, error: 'Media not found' });
          verifiedMime = sniffMime(inspected.prefix) ?? 'application/octet-stream';
          mediaStream = limitReadable(inspected.stream, MAX_ATTACHMENT_BYTES);
        }
      }
      if (!mediaStream && message.media_key)
        content = await options.attachmentStorage.get(message.media_key);
    } catch (error) {
      req.log.error(
        { error: whatsappLogErrorContext(error) },
        'WhatsApp attachment storage read failed'
      );
      return reply
        .code(503)
        .send({ success: false, error: 'Media storage is temporarily unavailable' });
    }
    if (!content && !mediaStream) {
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
      if (options.attachmentStorage.putStream && options.attachmentStorage.getStream) {
        const mediaKey = randomUUID();
        try {
          const streamed = await streamResponseToStorage(downloaded, options.attachmentStorage, mediaKey);
          verifiedMime = streamed.mime;
        } catch (error) {
          await options.attachmentStorage.delete(mediaKey).catch(() => undefined);
          if (error instanceof MediaTooLargeError) {
            return reply.code(413).send({ success: false, error: 'Media exceeds the 10 MiB limit' });
          }
          if (error instanceof MediaIncompleteError) {
            return reply.code(502).send({ success: false, error: 'WhatsApp gateway returned incomplete media' });
          }
          if (error instanceof MediaEmptyError) {
            return reply.code(404).send({ success: false, error: 'Media not found' });
          }
          throw error;
        }
        const storedStream = await options.attachmentStorage.getStream(mediaKey);
        if (!storedStream) {
          await options.attachmentStorage.delete(mediaKey).catch(() => undefined);
          return reply.code(503).send({ success: false, error: 'Media storage is temporarily unavailable' });
        }
        mediaStream = limitReadable(storedStream, MAX_ATTACHMENT_BYTES);
        await WhatsappMessage.query()
          .where({ id: message.id, company_id: companyId })
          .patch({
            media_key: mediaKey,
            media_mime_type: verifiedMime,
            media_file_name: safeFileName(metadata.filename) ?? message.media_file_name,
          });
        message.media_key = mediaKey;
        message.media_mime_type = verifiedMime;
        message.media_file_name = safeFileName(metadata.filename) ?? message.media_file_name;
      } else {
        try {
          content = await readLimitedMedia(downloaded);
        } catch (error) {
          if (error instanceof MediaTooLargeError) {
            return reply.code(413).send({ success: false, error: 'Media exceeds the 10 MiB limit' });
          }
          if (error instanceof MediaIncompleteError) {
            return reply.code(502).send({ success: false, error: 'WhatsApp gateway returned incomplete media' });
          }
          throw error;
        }
        if (!content.length)
          return reply.code(404).send({ success: false, error: 'Media not found' });
        verifiedMime = sniffMime(content) ?? 'application/octet-stream';
        const mediaKey = randomUUID();
        await options.attachmentStorage.put(mediaKey, content);
        await WhatsappMessage.query()
          .where({ id: message.id, company_id: companyId })
          .patch({
            media_key: mediaKey,
            media_mime_type: verifiedMime,
            media_file_name: safeFileName(metadata.filename) ?? message.media_file_name,
          });
        message.media_key = mediaKey;
        message.media_mime_type = verifiedMime;
        message.media_file_name = safeFileName(metadata.filename) ?? message.media_file_name;
      }
    }
    verifiedMime ??= content ? sniffMime(content) ?? 'application/octet-stream' : null;
    if (!content && !mediaStream)
      return reply.code(404).send({ success: false, error: 'Media not found' });
    if (message.media_mime_type !== verifiedMime) {
      await WhatsappMessage.query()
        .where({ id: message.id, company_id: companyId })
        .patch({ media_mime_type: verifiedMime });
      message.media_mime_type = verifiedMime;
    }
    await recordWhatsAppAudit(req, 'whatsapp.message', 'media_access', message.id, companyId);
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
        'Content-Security-Policy',
        "default-src 'none'; sandbox; base-uri 'none'; form-action 'none'"
      )
      .header(
        'content-disposition',
        `${disposition}; filename="${safeFileName(message.media_file_name) ?? 'attachment'}"`
      )
      .type(mime)
      .send(mediaStream ?? content);
  });
};
