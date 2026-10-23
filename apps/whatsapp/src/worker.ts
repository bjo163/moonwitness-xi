import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  downloadMediaMessage,
  initAuthCreds,
  normalizeMessageContent,
  proto,
} from '@whiskeysockets/baileys';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
export type Account = { id: number; company_id: number; status: string; auth_state: string | null };
type Session = { creds: unknown; keys: Record<string, Record<string, unknown>> };
export type Job = {
  id: number;
  message_id: number;
  account_id: number;
  recipient_jid: string;
  payload: string;
  attempts: number;
  message: { content?: string };
};

export function createWhatsappWorker(
  config: { apiUrl: string; internalToken: string; encryptionKey: Buffer },
  dependencies: {
    makeSocket?: typeof makeWASocket;
    downloadMedia?: typeof downloadMediaMessage;
    fetch?: typeof globalThis.fetch;
  } = {}
) {
  const { apiUrl, internalToken, encryptionKey } = config;
  const makeSocket = dependencies.makeSocket ?? makeWASocket;
  const downloadMedia = dependencies.downloadMedia ?? downloadMediaMessage;
  const fetch = dependencies.fetch ?? globalThis.fetch;
  let stopping = false;
  let lastApiSuccess = 0;
  const pendingIncoming = new Map<string, Record<string, unknown>>();
  let flushing: Promise<void> | undefined;
  async function flushIncoming() {
    if (flushing) return flushing;
    flushing = (async () => {
      for (const [key, payload] of pendingIncoming) {
        try {
          await api('/internal/whatsapp/incoming', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          pendingIncoming.delete(key);
        } catch {
          break;
        }
      }
    })().finally(() => {
      flushing = undefined;
    });
    return flushing;
  }
  const sockets = new Map<number, ReturnType<typeof makeWASocket>>();
  const saveChains = new Map<number, Promise<void>>();
  const pendingSessions = new Map<number, string>();
  const requestedDisconnects = new Set<number>();
  const reconnects = new Map<number, { attempts: number; at: number }>();

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
      signal: init.signal ?? AbortSignal.timeout(15_000),
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
  function sessionFor(account: Account): Session {
    if (account.auth_state) {
      try {
        return deserialize<Session>(decrypt(account.auth_state));
      } catch {
        throw new Error(
          'Stored WhatsApp session cannot be decrypted; restore WHATSAPP_SESSION_KEY'
        );
      }
    }
    return { creds: initAuthCreds(), keys: {} };
  }
  async function saveSession(accountId: number, session: Session) {
    const snapshot = encrypt(serialize(session));
    pendingSessions.set(accountId, snapshot);
    await persistSession(accountId, snapshot);
  }
  async function persistSession(accountId: number, snapshot: string) {
    const previous = saveChains.get(accountId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (pendingSessions.get(accountId) !== snapshot) return;
        await updateStatus(accountId, { auth_state: snapshot });
        if (pendingSessions.get(accountId) === snapshot) pendingSessions.delete(accountId);
      });
    saveChains.set(accountId, next);
    await next;
  }
  function authFor(accountId: number, session: Session): AuthenticationState {
    const creds = session.creds as AuthenticationState['creds'];
    const keys = {
      async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
        const rows = session.keys[type] ?? {};
        return Object.fromEntries(
          ids
            .filter((key) => rows[key] !== undefined)
            .map((key) => [
              key,
              type === 'app-state-sync-key'
                ? proto.Message.AppStateSyncKeyData.fromObject(rows[key] as Record<string, unknown>)
                : rows[key],
            ])
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
        if (!stopping && sockets.has(accountId)) await saveSession(accountId, session);
      },
    };
    return { creds, keys };
  }
  async function startAccount(account: Account) {
    if (sockets.has(account.id)) return;
    requestedDisconnects.delete(account.id);
    const session = sessionFor(account);
    await updateStatus(account.id, { status: 'connecting', qr_code: null, last_error: null });
    const socket = makeSocket({
      auth: authFor(account.id, session),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sockets.set(account.id, socket);
    socket.ev.on('creds.update', async (updated) => {
      if (stopping || sockets.get(account.id) !== socket) return;
      Object.assign(session.creds as object, updated);
      await saveSession(account.id, session).catch((error: unknown) =>
        console.error('Could not persist WhatsApp credentials', error)
      );
    });
    socket.ev.on('connection.update', async (update) => {
      if (stopping || sockets.get(account.id) !== socket) return;
      if (update.qr)
        await updateStatus(account.id, {
          status: 'qr',
          qr_code: update.qr,
          last_error: null,
        }).catch(() => undefined);
      if (update.connection === 'open') {
        reconnects.delete(account.id);
        await updateStatus(account.id, {
          status: 'connected',
          qr_code: null,
          phone_number: socket.user?.id?.split(':')[0] ?? null,
          last_error: null,
        }).catch(() => undefined);
      }
      if (update.connection === 'close') {
        if (sockets.get(account.id) !== socket) return;
        sockets.delete(account.id);
        if (requestedDisconnects.delete(account.id)) return;
        const code = (
          update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          await saveChains.get(account.id)?.catch(() => undefined);
          pendingSessions.delete(account.id);
          await updateStatus(account.id, {
            status: 'error',
            auth_state: null,
            qr_code: null,
            last_error: 'WhatsApp session logged out; reconnect to scan a new QR code',
          }).catch(() => undefined);
        } else {
          const attempts = (reconnects.get(account.id)?.attempts ?? 0) + 1;
          reconnects.set(account.id, {
            attempts,
            at: Date.now() + Math.min(1000 * 2 ** (attempts - 1), 60_000),
          });
          await updateStatus(account.id, {
            status: 'reconnecting',
            qr_code: null,
            last_error: null,
          }).catch(() => undefined);
        }
      }
    });
    const receive: Parameters<typeof socket.ev.on<'messages.upsert'>>[1] = async ({
      messages,
      type,
    }) => {
      if (!['notify', 'append'].includes(type)) return;
      for (const message of messages) {
        if (!message.key.remoteJid || !message.key.id) continue;
        if (
          !message.message ||
          !/^[^\s@]{1,200}@(s\.whatsapp\.net|g\.us|lid)$/u.test(message.key.remoteJid)
        )
          continue;
        const content = normalizeMessageContent(message.message);
        const jid = message.key.remoteJid;
        const group = jid.endsWith('@g.us');
        const conversationName = group
          ? await socket
              .groupMetadata(jid)
              .then((metadata) => metadata.subject)
              .catch(() => jid)
          : (message.pushName ?? jid);
        let bodyText =
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
        if (!bodyText && !mediaMessage) continue;
        if (mediaMessage) {
          try {
            if (Number(mediaMessage.fileLength ?? 0) > 8 * 1024 * 1024)
              throw new Error('Media exceeds 8 MB');
            media = (await downloadMedia(message, 'buffer', {})) as Buffer;
            if (media.length > 8 * 1024 * 1024) {
              media = null;
              bodyText ||= '[Attachment exceeds 8 MB]';
            }
            mime = mediaMessage.mimetype ?? 'application/octet-stream';
            filename = 'fileName' in mediaMessage ? (mediaMessage.fileName ?? null) : null;
          } catch {
            bodyText ||= '[Attachment could not be downloaded or exceeds 8 MB]';
          }
        }
        const eventPayload = {
          account_id: account.id,
          jid,
          external_id: message.key.id,
          name: conversationName,
          is_group: group,
          from_me: message.key.fromMe === true,
          notify: type === 'notify',
          timestamp:
            Number(message.messageTimestamp) > 0
              ? new Date(Number(message.messageTimestamp) * 1000).toISOString()
              : undefined,
          sender_jid: message.key.participant ?? jid,
          content: bodyText,
          ...(media
            ? {
                media_base64: media.toString('base64'),
                media_mime_type: mime,
                media_file_name: filename,
              }
            : {}),
        };
        const eventKey = `${account.id}:${message.key.id}`;
        pendingIncoming.set(eventKey, eventPayload);
        await flushIncoming();
      }
    };
    socket.ev.on('messages.upsert', receive);
    socket.ev.on('messaging-history.set', async ({ messages }) =>
      receive({ messages, type: 'append' })
    );
    socket.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        const externalId = update.key.id;
        const status = update.update.status;
        const normalized =
          status === 0
            ? 'failed'
            : status === 4 || status === 5
              ? 'read'
              : status === 3
                ? 'delivered'
                : status === 2
                  ? 'sent'
                  : undefined;
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
      {
        headers: { 'x-whatsapp-internal-token': internalToken },
        signal: AbortSignal.timeout(20_000),
      }
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
      {
        document: media,
        fileName: payload.media_file_name ?? 'attachment',
        caption: text,
        mimetype,
      },
      { messageId }
    );
  }

  async function tick() {
    if (stopping) return;
    await flushIncoming();
    for (const [accountId, snapshot] of pendingSessions) {
      await persistSession(accountId, snapshot);
    }
    await api('/internal/whatsapp/events/process', { method: 'POST', body: '{}' }).catch(
      () => undefined
    );
    const result = await api<{ data: Account[] }>('/internal/whatsapp/accounts');
    lastApiSuccess = Date.now();
    for (const account of result.data) {
      if (
        ['connecting', 'qr', 'connected', 'reconnecting'].includes(account.status) &&
        (reconnects.get(account.id)?.at ?? 0) <= Date.now() &&
        !sockets.has(account.id)
      )
        await startAccount(account).catch(async () => {
          await updateStatus(account.id, {
            status: 'error',
            last_error: 'Could not load session; verify the session key',
          });
        });
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
      const job = claimed.data;
      const heartbeat = setInterval(() => {
        void api('/internal/whatsapp/jobs/heartbeat', {
          method: 'POST',
          body: JSON.stringify({ job_id: job.id, attempts: job.attempts }),
        }).catch(() => undefined);
      }, 20_000);
      heartbeat.unref();
      let status: 'done' | 'retry' | 'dead' = 'done',
        externalId: string | undefined,
        errorText: string | undefined;
      try {
        const sent = await sendJob(claimed.data);
        externalId = sent?.key?.id ?? undefined;
      } catch (error) {
        status = claimed.data.attempts >= 8 ? 'dead' : 'retry';
        errorText = error instanceof Error ? error.message : 'WhatsApp send failed';
      } finally {
        clearInterval(heartbeat);
      }
      await api('/internal/whatsapp/job-result', {
        method: 'POST',
        body: JSON.stringify({
          job_id: claimed.data.id,
          attempts: claimed.data.attempts,
          status,
          external_id: externalId,
          error: errorText,
        }),
      });
    }
  }
  async function stop() {
    stopping = true;
    for (const socket of sockets.values()) socket.end(undefined);
    sockets.clear();
    await flushIncoming();
    await Promise.allSettled([...saveChains.values()]);
  }
  return {
    tick,
    stop,
    health: () => ({
      ok: !stopping && lastApiSuccess > 0 && Date.now() - lastApiSuccess < 30_000,
      activeAccounts: sockets.size,
      pendingIncoming: pendingIncoming.size,
      pendingSessions: pendingSessions.size,
    }),
  };
}
