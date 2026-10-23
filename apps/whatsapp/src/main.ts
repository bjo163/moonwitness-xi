import Fastify from 'fastify';
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  downloadMediaMessage,
  initAuthCreds,
} from '@whiskeysockets/baileys';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';

const apiUrl = (process.env.WHATSAPP_API_URL ?? 'http://api:3000').replace(/\/$/u, '');
const internalToken = process.env.WHATSAPP_INTERNAL_TOKEN ?? '';
const encryptionKey = Buffer.from(process.env.WHATSAPP_SESSION_KEY ?? '', 'base64');
const port = Number(process.env.WHATSAPP_PORT ?? 3100);
if (internalToken.length < 32)
  throw new Error('WHATSAPP_INTERNAL_TOKEN must contain at least 32 characters');
if (encryptionKey.length !== 32)
  throw new Error('WHATSAPP_SESSION_KEY must be a base64-encoded 32-byte key');
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('WHATSAPP_PORT must be a valid TCP port');

type Account = { id: number; company_id: number; status: string; auth_state: string | null };
type Session = { creds: unknown; keys: Record<string, Record<string, unknown>> };
type Job = {
  id: number;
  message_id: number;
  account_id: number;
  recipient_jid: string;
  payload: string;
  attempts: number;
  message: { content?: string };
};
const sockets = new Map<number, ReturnType<typeof makeWASocket>>();
const saveChains = new Map<number, Promise<void>>();
const requestedDisconnects = new Set<number>();

function encrypt(plain: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}
function decrypt(value: string): string {
  const [iv, tag, ciphertext] = value.split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Invalid encrypted WhatsApp session');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
function serialize(value: unknown): string {
  return JSON.stringify(value, BufferJSON.replacer);
}
function deserialize<T>(value: string): T {
  return JSON.parse(value, BufferJSON.reviver) as T;
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-whatsapp-internal-token': internalToken,
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`API request ${path} failed (${response.status})`);
  return (await response.json()) as T;
}
async function updateStatus(accountId: number, patch: Record<string, unknown>) {
  await api('/internal/whatsapp/status', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, ...patch }),
  });
}
async function setConnectionIntent(accountId: number, connected: boolean) {
  await api('/internal/whatsapp/connection-control', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, connected }),
  });
}
function sessionFor(account: Account): Session {
  if (account.auth_state) {
    try {
      return deserialize<Session>(decrypt(account.auth_state));
    } catch {
      /* expired or rotated key: create a clean session */
    }
  }
  return { creds: initAuthCreds(), keys: {} };
}
async function saveSession(accountId: number, session: Session) {
  const previous = saveChains.get(accountId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => updateStatus(accountId, { auth_state: encrypt(serialize(session)) }));
  saveChains.set(accountId, next);
  await next;
}
function authFor(accountId: number, session: Session): AuthenticationState {
  const creds = session.creds as AuthenticationState['creds'];
  const keys = {
    async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
      const rows = session.keys[type] ?? {};
      return Object.fromEntries(
        ids.filter((key) => rows[key] !== undefined).map((key) => [key, rows[key]])
      ) as { [id: string]: SignalDataTypeMap[T] };
    },
    async set(
      data: Partial<{
        [T in keyof SignalDataTypeMap]: { [id: string]: SignalDataTypeMap[T] | null };
      }>
    ) {
      for (const [type, values] of Object.entries(data)) {
        session.keys[type] ??= {};
        for (const [key, value] of Object.entries(values ?? {})) {
          if (value === null) delete session.keys[type]![key];
          else session.keys[type]![key] = value;
        }
      }
      await saveSession(accountId, session);
    },
  };
  return { creds, keys };
}
async function startAccount(account: Account) {
  if (sockets.has(account.id)) return;
  await setConnectionIntent(account.id, true);
  requestedDisconnects.delete(account.id);
  const session = sessionFor(account);
  await updateStatus(account.id, { status: 'connecting', qr_code: null, last_error: null });
  const socket = makeWASocket({
    auth: authFor(account.id, session),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sockets.set(account.id, socket);
  socket.ev.on('creds.update', async (updated) => {
    Object.assign(session.creds as object, updated);
    await saveSession(account.id, session).catch((error: unknown) =>
      console.error('Could not persist WhatsApp credentials', error)
    );
  });
  socket.ev.on('connection.update', async (update) => {
    if (update.qr)
      await updateStatus(account.id, { status: 'qr', qr_code: update.qr, last_error: null }).catch(
        () => undefined
      );
    if (update.connection === 'open') {
      await updateStatus(account.id, {
        status: 'connected',
        qr_code: null,
        phone_number: socket.user?.id?.split(':')[0] ?? null,
        last_error: null,
      }).catch(() => undefined);
    }
    if (update.connection === 'close') {
      sockets.delete(account.id);
      if (requestedDisconnects.delete(account.id)) return;
      const code = (
        update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
      )?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        await updateStatus(account.id, {
          status: 'error',
          auth_state: null,
          qr_code: null,
          last_error: 'WhatsApp session logged out; reconnect to scan a new QR code',
        }).catch(() => undefined);
      } else {
        await updateStatus(account.id, {
          status: 'reconnecting',
          qr_code: null,
          last_error: null,
        }).catch(() => undefined);
      }
    }
  });
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      if (!message.key.remoteJid || message.key.fromMe || !message.key.id) continue;
      const content = message.message;
      const jid = message.key.remoteJid;
      const group = jid.endsWith('@g.us');
      const conversationName = group
        ? await socket
            .groupMetadata(jid)
            .then((metadata) => metadata.subject)
            .catch(() => jid)
        : (message.pushName ?? jid);
      const bodyText =
        content?.conversation ??
        content?.extendedTextMessage?.text ??
        content?.imageMessage?.caption ??
        content?.videoMessage?.caption ??
        content?.documentMessage?.caption ??
        '';
      let media: Buffer | null = null,
        mime: string | null = null,
        filename: string | null = null;
      const mediaMessage =
        content?.imageMessage ??
        content?.videoMessage ??
        content?.audioMessage ??
        content?.documentMessage ??
        content?.stickerMessage;
      if (mediaMessage) {
        try {
          media = (await downloadMediaMessage(message, 'buffer', {})) as Buffer;
          mime = mediaMessage.mimetype ?? 'application/octet-stream';
          filename = 'fileName' in mediaMessage ? (mediaMessage.fileName ?? null) : null;
        } catch (error) {
          console.error('Could not download incoming WhatsApp media', error);
        }
      }
      await api('/internal/whatsapp/incoming', {
        method: 'POST',
        body: JSON.stringify({
          account_id: account.id,
          jid,
          external_id: message.key.id,
          name: conversationName,
          is_group: group,
          sender_jid: message.key.participant ?? jid,
          content: bodyText,
          ...(media
            ? {
                media_base64: media.toString('base64'),
                media_mime_type: mime,
                media_file_name: filename,
              }
            : {}),
        }),
      }).catch((error: unknown) =>
        console.error('Could not store incoming WhatsApp message', error)
      );
    }
  });
  socket.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      const externalId = update.key.id;
      const status = update.update.status;
      const normalized =
        status === 4 ? 'read' : status === 3 ? 'delivered' : status === 2 ? 'sent' : undefined;
      if (externalId && normalized)
        await api('/internal/whatsapp/message-status', {
          method: 'POST',
          body: JSON.stringify({
            account_id: account.id,
            external_id: externalId,
            status: normalized,
          }),
        }).catch(() => undefined);
    }
  });
}

async function sendJob(job: Job) {
  const socket = sockets.get(Number(job.account_id));
  if (!socket || !socket.user) throw new Error('WhatsApp connection is not ready');
  const payload = JSON.parse(job.payload) as {
    content?: string;
    media_key?: string | null;
    media_mime_type?: string;
    media_file_name?: string;
  };
  const text = payload.content ?? job.message?.content ?? '';
  const messageId = createHash('sha256')
    .update(`${job.account_id}:${job.id}`)
    .digest('hex')
    .slice(0, 20)
    .toUpperCase();
  if (!payload.media_key) return socket.sendMessage(job.recipient_jid, { text }, { messageId });
  const mediaResponse = await fetch(
    `${apiUrl}/internal/whatsapp/media/${encodeURIComponent(payload.media_key)}`,
    { headers: { 'x-whatsapp-internal-token': internalToken } }
  );
  if (!mediaResponse.ok) throw new Error('Could not load queued media');
  const media = Buffer.from(await mediaResponse.arrayBuffer());
  const mimetype = payload.media_mime_type ?? 'application/octet-stream';
  if (mimetype.startsWith('image/'))
    return socket.sendMessage(
      job.recipient_jid,
      { image: media, caption: text, mimetype },
      { messageId }
    );
  if (mimetype.startsWith('video/'))
    return socket.sendMessage(
      job.recipient_jid,
      { video: media, caption: text, mimetype },
      { messageId }
    );
  if (mimetype.startsWith('audio/'))
    return socket.sendMessage(
      job.recipient_jid,
      { audio: media, mimetype, ptt: false },
      { messageId }
    );
  return socket.sendMessage(
    job.recipient_jid,
    { document: media, fileName: payload.media_file_name ?? 'attachment', caption: text, mimetype },
    { messageId }
  );
}

const server = Fastify({ logger: true });
server.get('/health', async () => ({ ok: true, activeAccounts: sockets.size }));
await server.listen({ host: '0.0.0.0', port });
console.info(`WhatsApp service listening on ${port}`);

let stopping = false;
async function stop() {
  stopping = true;
  for (const [accountId, socket] of sockets) {
    requestedDisconnects.add(accountId);
    socket.end(undefined);
  }
  await Promise.allSettled([...saveChains.values()]);
  await server.close();
}
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());

while (!stopping) {
  try {
    const result = await api<{ data: Account[] }>('/internal/whatsapp/accounts');
    for (const account of result.data) {
      if (account.status !== 'disconnected' && !sockets.has(account.id))
        await startAccount(account);
      if (account.status === 'disconnected' && sockets.has(account.id)) {
        requestedDisconnects.add(account.id);
        sockets.get(account.id)?.end(undefined);
        sockets.delete(account.id);
      }
    }
    const claimed = await api<{ data: Job | null }>('/internal/whatsapp/jobs/claim', {
      method: 'POST',
      body: '{}',
    });
    if (claimed.data) {
      let status: 'done' | 'retry' | 'dead' = 'done',
        externalId: string | undefined,
        errorText: string | undefined;
      try {
        const sent = await sendJob(claimed.data);
        externalId = sent?.key?.id ?? undefined;
      } catch (error) {
        status = claimed.data.attempts >= 8 ? 'dead' : 'retry';
        errorText = error instanceof Error ? error.message : 'WhatsApp send failed';
      }
      await api('/internal/whatsapp/job-result', {
        method: 'POST',
        body: JSON.stringify({
          job_id: claimed.data.id,
          status,
          external_id: externalId,
          error: errorText,
        }),
      });
    }
  } catch (error) {
    console.error('WhatsApp worker loop failed', error);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
