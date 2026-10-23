import { test } from 'node:test';
import assert from 'node:assert/strict';
import type makeWASocket from '@whiskeysockets/baileys';
import type { downloadMediaMessage } from '@whiskeysockets/baileys';
import { DisconnectReason } from '@whiskeysockets/baileys';
import { createWhatsappWorker, type Account, type Job } from '../src/worker.js';

type JsonObject = Record<string, unknown>;
type MockAuthentication = {
  creds: JsonObject;
  keys: {
    get(name: string, ids: string[]): Promise<Record<string, { keyData: Buffer }>>;
    set(value: Record<string, Record<string, { keyData: Buffer }>>): Promise<void>;
  };
};
type MockSocket = {
  user: { id: string } | undefined;
  auth: MockAuthentication;
  ev: { on(name: string, handler: (payload: unknown) => Promise<void>): void };
  emit(name: string, payload: unknown): Promise<void>;
  sendMessage(
    jid: string,
    message: JsonObject,
    options: { messageId: string }
  ): Promise<{ key: { id: string } }>;
  groupMetadata(): Promise<{ subject: string }>;
  end(): void;
};

function fixture() {
  const account: Account = { id: 1, company_id: 1, status: 'connecting', auth_state: null };
  const requests: { path: string; body: JsonObject | undefined }[] = [];
  const sent: { jid: string; message: JsonObject; options: { messageId: string } }[] = [];
  const sockets: MockSocket[] = [];
  const jobs: Job[] = [];
  let failSend = false,
    failIncoming = false,
    failPersistence = false;
  const makeSocket = ((options: { auth: MockAuthentication }) => {
    const listeners = new Map<string, ((payload: unknown) => Promise<void>)[]>();
    const socket = {
      user: undefined as undefined | { id: string },
      auth: options.auth,
      ev: {
        on(name: string, fn: (payload: unknown) => Promise<void>) {
          listeners.set(name, [...(listeners.get(name) ?? []), fn]);
        },
      },
      async emit(name: string, payload: unknown) {
        for (const fn of listeners.get(name) ?? []) await fn(payload);
      },
      async sendMessage(jid: string, message: JsonObject, options: { messageId: string }) {
        sent.push({ jid, message, options });
        if (failSend) throw new Error('temporary send failure');
        return { key: { id: options.messageId } };
      },
      async groupMetadata() {
        return { subject: 'Test group' };
      },
      end() {
        void socket.emit('connection.update', { connection: 'close' });
      },
    };
    sockets.push(socket);
    return socket;
  }) as unknown as typeof makeWASocket;
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path, body });
    if (path === '/internal/whatsapp/status' && body?.auth_state && failPersistence)
      return new Response('{}', { status: 503 });
    if (path === '/internal/whatsapp/status') Object.assign(account, body);
    if (path === '/internal/whatsapp/incoming' && failIncoming)
      return new Response('{}', { status: 503 });
    if (path.includes('/media/')) return new Response(Buffer.from('media-content'));
    return Response.json({
      success: true,
      data: path.endsWith('/accounts')
        ? [account]
        : path.endsWith('/claim')
          ? (jobs.shift() ?? null)
          : { processed: false },
    });
  }) as typeof fetch;
  const create = () =>
    createWhatsappWorker(
      {
        apiUrl: 'http://mock.local',
        internalToken: 'test-service-token-never-used-externally',
        encryptionKey: Buffer.alloc(32, 9),
      },
      {
        makeSocket,
        fetch: fetchMock,
        downloadMedia: (async () =>
          Buffer.from('downloaded-media')) as unknown as typeof downloadMediaMessage,
      }
    );
  const job = (id: number, payload: object = {}, attempts = 1): Job => ({
    id,
    account_id: 1,
    message_id: id,
    recipient_jid: '123@g.us',
    payload: JSON.stringify({ content: 'hello', ...payload }),
    attempts,
    message: {},
  });
  return {
    account,
    requests,
    sent,
    sockets,
    jobs,
    create,
    job,
    failSend: (value: boolean) => {
      failSend = value;
    },
    failIncoming: (value: boolean) => {
      failIncoming = value;
    },
    failPersistence: (value: boolean) => {
      failPersistence = value;
    },
  };
}

test('QR, connected state, encrypted credentials, restart recovery, reconnect and intentional disconnect', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const f = fixture();
  let worker = f.create();
  await worker.tick();
  const socket = f.sockets[0];
  await socket.emit('connection.update', { qr: 'mock-qr' });
  assert.equal(f.account.status, 'qr');
  socket.user = { id: '123:1@s.whatsapp.net' };
  await socket.emit('creds.update', { registered: true });
  await socket.auth.keys.set({
    'app-state-sync-key': { test: { keyData: Buffer.from('secret-key') } },
  });
  await socket.emit('connection.update', { connection: 'open' });
  assert.equal(f.account.status, 'connected');
  assert.equal((f.account as { qr_code?: unknown }).qr_code, null);
  assert.match(f.account.auth_state!, /^[^.]+\.[^.]+\.[^.]+$/);
  assert.ok(!f.account.auth_state!.includes('secret-key'));
  await worker.stop();
  worker = f.create();
  await worker.tick();
  assert.equal(f.sockets[1].auth.creds.registered, true);
  const keys = await f.sockets[1].auth.keys.get('app-state-sync-key', ['test']);
  assert.equal(Buffer.from(keys.test.keyData).toString(), 'secret-key');
  await f.sockets[1].emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 408 } } },
  });
  assert.equal(f.account.status, 'reconnecting');
  await worker.tick();
  assert.equal(f.sockets.length, 2);
  t.mock.timers.tick(1001);
  await worker.tick();
  assert.equal(f.sockets.length, 3);
  f.account.status = 'disconnected';
  await worker.tick();
  assert.equal(worker.health().activeAccounts, 0);
  assert.equal(f.account.status, 'disconnected');
  await worker.stop();
});

test('a logged out session is cleared while an unreadable encryption key preserves the session', async () => {
  const f = fixture();
  const worker = f.create();
  await worker.tick();
  await f.sockets[0].emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
  });
  assert.equal(f.account.status, 'error');
  assert.equal(f.account.auth_state, null);
  f.account.status = 'connecting';
  f.account.auth_state = 'invalid.session.ciphertext';
  await worker.tick();
  assert.equal(f.account.status, 'error');
  assert.equal(f.account.auth_state, 'invalid.session.ciphertext');
  assert.equal(f.sockets.length, 1);
  await worker.stop();
});

test('text and all media types use stable send IDs and failed sends retry with attempt fencing', async () => {
  const f = fixture();
  const worker = f.create();
  await worker.tick();
  const socket = f.sockets[0];
  socket.user = { id: '123' };
  await socket.emit('connection.update', { connection: 'open' });
  f.failSend(true);
  f.jobs.push(f.job(1));
  await worker.tick();
  assert.equal(f.requests.at(-1)?.body.status, 'retry');
  assert.equal(f.requests.at(-1)?.body.attempts, 1);
  const stable = f.sent[0].options.messageId;
  f.failSend(false);
  f.jobs.push(f.job(1, {}, 2));
  await worker.tick();
  assert.equal(f.sent[1].options.messageId, stable);
  assert.equal(f.requests.at(-1)?.body.status, 'done');
  for (const [mime, field] of [
    ['image/png', 'image'],
    ['video/mp4', 'video'],
    ['audio/ogg', 'audio'],
    ['application/pdf', 'document'],
  ]) {
    f.jobs.push(
      f.job(f.sent.length + 1, {
        media_key: 'fixture',
        media_mime_type: mime,
        media_file_name: 'fixture.pdf',
      })
    );
    await worker.tick();
    assert.equal(f.sent.at(-1)?.jid, '123@g.us');
    assert.equal(String(f.sent.at(-1)?.message[field]), 'media-content');
  }
  f.failSend(true);
  f.jobs.push(f.job(99, {}, 8));
  await worker.tick();
  assert.equal(f.requests.at(-1)?.body.status, 'dead');
  await socket.emit('messages.update', [{ key: { id: stable }, update: { status: 4 } }]);
  assert.equal(f.requests.at(-1)?.body.status, 'read');
  await worker.stop();
});

test('private and group messages, media, wrapped messages and history survive temporary API failure', async () => {
  const f = fixture();
  const worker = f.create();
  await worker.tick();
  const socket = f.sockets[0];
  f.failIncoming(true);
  await socket.emit('messages.upsert', {
    type: 'notify',
    messages: [
      {
        key: { id: 'p1', remoteJid: '123@s.whatsapp.net' },
        pushName: 'Contact',
        message: { ephemeralMessage: { message: { conversation: 'hello' } } },
      },
    ],
  });
  assert.equal(worker.health().pendingIncoming, 1);
  f.failIncoming(false);
  await worker.tick();
  assert.equal(worker.health().pendingIncoming, 0);
  const privateEvent = f.requests.filter((r) => r.path.endsWith('/incoming')).at(-1)!.body;
  assert.equal(privateEvent.content, 'hello');
  assert.equal(privateEvent.name, 'Contact');
  await socket.emit('messages.upsert', {
    type: 'notify',
    messages: [
      {
        key: { id: 'g1', remoteJid: '123@g.us', participant: '456@s.whatsapp.net' },
        message: { imageMessage: { caption: 'picture', mimetype: 'image/png' } },
      },
    ],
  });
  const groupEvent = f.requests.at(-1)!.body;
  assert.equal(groupEvent.is_group, true);
  assert.equal(groupEvent.name, 'Test group');
  assert.equal(groupEvent.sender_jid, '456@s.whatsapp.net');
  assert.equal(
    Buffer.from(String(groupEvent.media_base64), 'base64').toString(),
    'downloaded-media'
  );
  await socket.emit('messaging-history.set', {
    messages: [
      {
        key: { id: 'history', remoteJid: '123@s.whatsapp.net', fromMe: true },
        message: { conversation: 'previous' },
      },
    ],
  });
  assert.equal(f.requests.at(-1)!.body.from_me, true);
  await worker.stop();
});

test('credential persistence retries after an API outage and health reports an expired API connection', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.mock.method(console, 'error', () => {});
  const f = fixture();
  const worker = f.create();
  assert.equal(worker.health().ok, false);
  await worker.tick();
  f.failPersistence(true);
  await f.sockets[0].emit('creds.update', { registered: true });
  assert.equal(worker.health().pendingSessions, 1);
  assert.equal(f.account.auth_state, null);
  f.failPersistence(false);
  await worker.tick();
  assert.equal(worker.health().pendingSessions, 0);
  assert.ok(f.account.auth_state);
  t.mock.timers.tick(30_001);
  assert.equal(worker.health().ok, false);
  await worker.tick();
  assert.equal(worker.health().ok, true);
  await worker.stop();
});
