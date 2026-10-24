import Fastify from 'fastify';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { Model } from 'objection';
import knex, { type Knex } from 'knex';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentStorage } from '@moonwitness/orm-storage';
import { whatsappRoutes } from '../src/routes/whatsapp.routes.js';
import { whatsappManifest } from '../src/whatsapp/manifest.js';
import { randomUUID } from 'node:crypto';

const postgres = process.env.WHATSAPP_TEST_POSTGRES === 'true';

describe('WhatsApp API GoWA bridge', () => {
  let db: Knex;
  let app: ReturnType<typeof Fastify>;
  let companyId: number;
  let schema: string;
  let deviceExists = false;
  let providerConnected = false;
  let providerChats: Array<Record<string, unknown>> = [];
  let providerMessages: Array<Record<string, unknown>> = [];
  let failTextSend = false;
  let failAttachmentPut = false;
  let providerImageSendCount = 0;
  const previousGateway = process.env.WHATSAPP_GATEWAY_URL;
  const stored = new Map<string, Buffer>();
  const storage: AttachmentStorage = {
    async put(key, content) {
      if (failAttachmentPut) throw new Error('attachment storage unavailable');
      stored.set(key, Buffer.from(content));
      return { key, sizeBytes: content.byteLength, checksum: 'test' };
    },
    async get(key) {
      return stored.get(key) ?? null;
    },
    async delete(key) {
      stored.delete(key);
    },
    async *list() {
      for (const [key, content] of stored)
        yield { key, sizeBytes: content.length, checksum: 'test' };
    },
  };

  beforeAll(async () => {
    schema = `wa_test_${randomUUID().replaceAll('-', '')}`;
    db = postgres
      ? knex({
          client: 'pg',
          connection: process.env.WHATSAPP_TEST_DATABASE_URL ?? process.env.DATABASE_URL,
          searchPath: [schema],
        })
      : knex({
          client: 'better-sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        });
    if (postgres) await db.raw(`CREATE SCHEMA "${schema}"`);
    Model.knex(db);
    await installAddons(db, [baseManifest, whatsappManifest]);
    companyId = Number((await db('companies').first('id'))?.id);
  }, 120_000);

  beforeEach(async () => {
    process.env.WHATSAPP_GATEWAY_URL = 'http://gowa.test';
    deviceExists = false;
    providerConnected = false;
    providerChats = [];
    providerMessages = [];
    failTextSend = false;
    failAttachmentPut = false;
    providerImageSendCount = 0;
    stored.clear();
    const mockFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? 'GET';
      const json = (results: unknown, status = 200) =>
        new Response(
          JSON.stringify({ status, code: status < 400 ? 'SUCCESS' : 'ERROR', results }),
          {
            status,
            headers: { 'content-type': 'application/json' },
          }
        );
      if (url.pathname === '/devices' && method === 'POST') {
        deviceExists = true;
        return json({ device_id: 'moonwitness-company-' + companyId });
      }
      if (/^\/devices\/[^/]+$/u.test(url.pathname) && method === 'GET')
        return deviceExists
          ? json({ device_id: 'moonwitness-company-' + companyId })
          : json({ message: 'not found' }, 404);
      if (/^\/devices\/[^/]+\/status$/u.test(url.pathname))
        return json({
          device_id: 'moonwitness-company-' + companyId,
          is_connected: providerConnected,
          is_logged_in: providerConnected,
          jid: providerConnected ? '6281234567890@s.whatsapp.net' : '',
        });
      if (/^\/devices\/[^/]+\/login$/u.test(url.pathname))
        return json({ qr_link: 'http://localhost:3000/statics/images/qrcode/test.png' });
      if (url.pathname === '/statics/images/qrcode/test.png')
        return new Response(Buffer.from('qr-image'), { headers: { 'content-type': 'image/png' } });
      if (url.pathname === '/chats') return json({ data: providerChats });
      if (url.pathname.startsWith('/chat/') && url.pathname.endsWith('/messages'))
        return json({ data: providerMessages });
      if (url.pathname === '/send/message')
        return failTextSend
          ? json({ message: 'provider send failed' }, 503)
          : json({ message_id: 'sent-text-id' });
      if (url.pathname === '/send/image') {
        providerImageSendCount++;
        return json({ message_id: 'sent-image-id' });
      }
      if (url.pathname === '/devices/moonwitness-company-' + companyId + '/logout') return json({});
      if (url.pathname === '/message/incoming-image/download')
        return json({ file_path: '/statics/media/incoming.png', filename: 'incoming.png' });
      if (url.pathname === '/statics/media/incoming.png')
        return new Response(Buffer.from('incoming-image'), {
          headers: { 'content-type': 'image/png' },
        });
      return json({ message: `Unexpected GoWA request: ${method} ${url.pathname}` }, 500);
    });
    vi.stubGlobal('fetch', mockFetch);

    app = Fastify();
    app.decorateRequest('auth', null);
    app.decorate('db', db);
    app.addHook('onRequest', async (request) => {
      if (request.headers.authorization === 'Bearer test')
        request.auth = {
          userId: 1,
          companyId:
            request.headers['x-test-company'] === 'none'
              ? undefined
              : request.headers['x-test-company'] === 'foreign'
                ? companyId + 999
                : companyId,
          role: 'superadmin',
          groupPermissions: [],
        };
    });
    await app.register(whatsappRoutes, { attachmentStorage: storage });
  });

  afterEach(async () => {
    await app.close();
    for (const table of ['whatsapp_messages', 'whatsapp_conversations', 'whatsapp_accounts'])
      await db(table).delete();
    stored.clear();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (previousGateway === undefined) delete process.env.WHATSAPP_GATEWAY_URL;
    else process.env.WHATSAPP_GATEWAY_URL = previousGateway;
    if (postgres) await db.raw(`DROP SCHEMA "${schema}" CASCADE`);
    await db.destroy();
  });

  async function connectAndMarkReady() {
    const connected = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    expect(connected.statusCode).toBe(202);
    providerConnected = true;
    await db('whatsapp_accounts')
      .where({ id: connected.json().data.id })
      .update({ status: 'connected' });
    return connected.json().data.id as number;
  }

  it('requires an authenticated active company and creates a stable GoWA device with a proxied QR', async () => {
    expect((await app.inject({ method: 'GET', url: '/whatsapp/account' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/whatsapp/connect',
          headers: { authorization: 'Bearer test', 'x-test-company': 'none' },
        })
      ).statusCode
    ).toBe(403);

    const connected = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    expect(connected.statusCode).toBe(202);
    expect(connected.json().data.status).toBe('qr');
    expect(
      Number(
        await db('whatsapp_accounts')
          .count({ count: '*' })
          .first()
          .then((r) => r?.count)
      )
    ).toBe(1);

    const account = await app.inject({
      method: 'GET',
      url: '/whatsapp/account',
      headers: { authorization: 'Bearer test' },
    });
    expect(account.json().data).toMatchObject({
      status: 'qr',
      qr_code: 'data:image/png;base64,cXItaW1hZ2U=',
    });
    expect(account.json().data).not.toHaveProperty('gateway_device_id');
    const foreign = await app.inject({
      method: 'GET',
      url: '/whatsapp/account',
      headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
    });
    expect(foreign.json().data).toMatchObject({ status: 'disconnected' });

    providerConnected = true;
    const connectedAlready = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    expect(connectedAlready.statusCode).toBe(200);
    expect(connectedAlready.json().data.status).toBe('connected');
    expect(
      Number(
        await db('whatsapp_accounts')
          .count({ count: '*' })
          .first()
          .then((r) => r?.count)
      )
    ).toBe(1);
  });

  it('syncs private and group inboxes and maps GoWA messages without exposing provider session data', async () => {
    await connectAndMarkReady();
    providerChats = [
      {
        jid: '628111111111@s.whatsapp.net',
        name: 'Private',
        last_message_time: '2026-10-23T10:00:00Z',
      },
      { jid: '123456@g.us', name: 'Team', last_message_time: '2026-10-23T11:00:00Z' },
    ];
    const inbox = await app.inject({
      method: 'GET',
      url: '/whatsapp/conversations',
      headers: { authorization: 'Bearer test' },
    });
    expect(inbox.statusCode).toBe(200);
    expect(
      inbox.json().data.map((chat: { jid: string; is_group: boolean }) => [chat.jid, chat.is_group])
    ).toEqual([
      ['123456@g.us', true],
      ['628111111111@s.whatsapp.net', false],
    ]);

    providerMessages = [
      {
        id: 'incoming-image',
        chat_jid: '123456@g.us',
        sender: '628222222222@s.whatsapp.net',
        content: 'See this',
        timestamp: '2026-10-23T11:05:00Z',
        is_from_me: false,
        media_type: 'image',
        filename: 'incoming.png',
      },
      {
        id: 'outgoing-text',
        chat_jid: '123456@g.us',
        sender: '6281234567890@s.whatsapp.net',
        content: 'Noted',
        timestamp: '2026-10-23T11:06:00Z',
        is_from_me: true,
        media_type: 'text',
      },
    ];
    const conversationId = inbox
      .json()
      .data.find((chat: { is_group: boolean }) => chat.is_group).id;
    const messages = await app.inject({
      method: 'GET',
      url: `/whatsapp/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer test' },
    });
    expect(messages.json().data.map((item: { content: string }) => item.content)).toEqual([
      'Noted',
      'See this',
    ]);
    expect(messages.json().data[1]).toMatchObject({
      direction: 'inbound',
      message_type: 'image',
      sender_jid: '628222222222@s.whatsapp.net',
      media_file_name: 'incoming.png',
    });
    const imageId = messages.json().data[1].id;
    const image = await app.inject({
      method: 'GET',
      url: `/whatsapp/media/${imageId}`,
      headers: { authorization: 'Bearer test' },
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(image.body).toBe('incoming-image');

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/whatsapp/conversations/${conversationId}/messages`,
          headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
        })
      ).statusCode
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/whatsapp/conversations',
          headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
        })
      ).json().data
    ).toEqual([]);
  });

  it('sends text to a group and media to a private chat through GoWA, and reports upstream failures', async () => {
    await connectAndMarkReady();
    providerChats = [
      {
        jid: '628111111111@s.whatsapp.net',
        name: 'Private',
        last_message_time: '2026-10-23T10:00:00Z',
      },
      { jid: '123456@g.us', name: 'Team', last_message_time: '2026-10-23T11:00:00Z' },
    ];
    const inbox = await app.inject({
      method: 'GET',
      url: '/whatsapp/conversations',
      headers: { authorization: 'Bearer test' },
    });
    const groupId = inbox.json().data.find((chat: { is_group: boolean }) => chat.is_group)
      .id as number;
    const privateId = inbox.json().data.find((chat: { is_group: boolean }) => !chat.is_group)
      .id as number;

    const sentText = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${groupId}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: { content: 'Group message' },
    });
    expect(sentText.statusCode).toBe(201);
    expect(sentText.json().data).toMatchObject({
      external_id: 'sent-text-id',
      direction: 'outbound',
      content: 'Group message',
      status: 'sent',
    });

    const sentImage = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${privateId}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: {
        content: 'Photo',
        media_base64: Buffer.from('outgoing-image').toString('base64'),
        media_mime_type: 'image/png',
        media_file_name: 'test.png',
      },
    });
    expect(sentImage.statusCode).toBe(201);
    expect(sentImage.json().data).toMatchObject({
      external_id: 'sent-image-id',
      message_type: 'image',
      media_file_name: 'test.png',
      status: 'sent',
    });
    const media = await app.inject({
      method: 'GET',
      url: `/whatsapp/media/${sentImage.json().data.id}`,
      headers: { authorization: 'Bearer test' },
    });
    expect(media.body).toBe('outgoing-image');

    failTextSend = true;
    const failed = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${groupId}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: { content: 'Please fail' },
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().success).toBe(false);
    const foreign = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${groupId}/messages`,
      headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
      payload: { content: 'Tenant isolation' },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('does not send media to WhatsApp when the attachment cannot be stored first', async () => {
    const accountId = await connectAndMarkReady();
    const [conversation] = await db('whatsapp_conversations')
      .insert({
        company_id: companyId,
        account_id: accountId,
        jid: '628111111111@s.whatsapp.net',
        name: 'Private',
        is_group: false,
        unread_count: 0,
      })
      .returning(['id']);
    failAttachmentPut = true;
    const response = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${conversation.id}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: {
        content: 'Photo',
        media_base64: Buffer.from('outgoing-image').toString('base64'),
        media_mime_type: 'image/png',
        media_file_name: 'test.png',
      },
    });
    expect(response.statusCode).toBe(502);
    expect(providerImageSendCount).toBe(0);
    const count = await db('whatsapp_messages').count({ count: '*' }).first();
    expect(Number(count?.count)).toBe(0);
  });
});
