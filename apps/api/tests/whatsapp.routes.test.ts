import Fastify from 'fastify';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest } from '@moonwitness/jobs';
import { whatsappManifest } from '../src/whatsapp/manifest.js';
import { Model } from 'objection';
import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttachmentStorage } from '@moonwitness/orm-storage';
import { whatsappRoutes } from '../src/routes/whatsapp.routes.js';

describe('WhatsApp API tenant boundary and durable queue', () => {
  let db: Knex;
  let app: ReturnType<typeof Fastify>;
  let companyId: number;
  const previousToken = process.env.WHATSAPP_INTERNAL_TOKEN;
  const previousNodeEnv = process.env.NODE_ENV;
  const stored = new Map<string, Buffer>();
  const storage: AttachmentStorage = {
    async put(key, content) {
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

  beforeEach(async () => {
    process.env.WHATSAPP_INTERNAL_TOKEN = 'unit-test-internal-token-with-enough-length';
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    Model.knex(db);
    await installAddons(db, [baseManifest, jobsManifest, whatsappManifest]);
    companyId = Number((await db('companies').first('id'))?.id);
    app = Fastify();
    app.decorateRequest('auth', null);
    app.decorate('db', db);
    app.addHook('onRequest', async (request) => {
      if (request.headers.authorization === 'Bearer test')
        request.auth = {
          userId: 1,
          companyId: request.headers['x-test-company'] === 'foreign' ? companyId + 999 : companyId,
          role: 'superadmin',
          groupPermissions: [],
        };
    });
    await app.register(whatsappRoutes, { attachmentStorage: storage });
  });

  afterEach(async () => {
    await app.close();
    await db.destroy();
    stored.clear();
    if (previousToken === undefined) delete process.env.WHATSAPP_INTERNAL_TOKEN;
    else process.env.WHATSAPP_INTERNAL_TOKEN = previousToken;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it('requires authentication and scopes inbox and send operations to the active company', async () => {
    expect((await app.inject({ method: 'GET', url: '/whatsapp/account' })).statusCode).toBe(401);
    const connected = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    expect(connected.statusCode).toBe(202);
    const accountId = connected.json().data.id as number;
    await db('whatsapp_accounts').where({ id: accountId }).update({ status: 'connected' });
    const [conversation] = await db('whatsapp_conversations')
      .insert({
        company_id: companyId,
        account_id: accountId,
        jid: '123@s.whatsapp.net',
        name: 'Test chat',
        is_group: false,
        unread_count: 0,
      })
      .returning('id');
    const conversationId = typeof conversation === 'object' ? conversation.id : conversation;
    const sent = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: { content: 'Hello' },
    });
    expect(sent.statusCode).toBe(202);
    expect(
      await db('whatsapp_jobs').where({ company_id: companyId }).count({ count: '*' }).first()
    ).toMatchObject({ count: 1 });
    const withMedia = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: {
        content: 'See attached',
        media_base64: Buffer.from('png-bytes').toString('base64'),
        media_mime_type: 'image/png',
        media_file_name: 'sample.png',
      },
    });
    expect(withMedia.statusCode).toBe(202);
    const mediaId = withMedia.json().data.id as number;
    const mediaResponse = await app.inject({
      method: 'GET',
      url: `/whatsapp/media/${mediaId}`,
      headers: { authorization: 'Bearer test' },
    });
    expect(mediaResponse.statusCode).toBe(200);
    expect(mediaResponse.headers['content-type']).toContain('image/png');
    expect(mediaResponse.body).toBe('png-bytes');
    const foreignMedia = await app.inject({
      method: 'GET',
      url: `/whatsapp/media/${mediaId}`,
      headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
    });
    expect(foreignMedia.statusCode).toBe(404);
    const foreign = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
      payload: { content: 'No access' },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('accepts internal callbacks only with the service token and deduplicates incoming message IDs', async () => {
    const connected = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    const accountId = connected.json().data.id as number;
    const denied = await app.inject({
      method: 'POST',
      url: '/internal/whatsapp/incoming',
      payload: { account_id: accountId, jid: 'x@s.whatsapp.net', external_id: 'same-id' },
    });
    expect(denied.statusCode).toBe(401);
    const payload = {
      account_id: accountId,
      jid: 'x@s.whatsapp.net',
      external_id: 'same-id',
      name: 'Contact',
      is_group: false,
      content: 'Hi',
    };
    const headers = { 'x-whatsapp-internal-token': process.env.WHATSAPP_INTERNAL_TOKEN! };
    expect(
      (await app.inject({ method: 'POST', url: '/internal/whatsapp/incoming', headers, payload }))
        .statusCode
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/internal/whatsapp/incoming', headers, payload }))
        .statusCode
    ).toBe(200);
    expect(Number((await db('whatsapp_messages').count({ count: '*' }).first())?.count)).toBe(1);
  });

  it('uses the development-only fallback token when no internal token is configured', async () => {
    delete process.env.WHATSAPP_INTERNAL_TOKEN;
    process.env.NODE_ENV = 'test';
    const connected = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    const accountId = connected.json().data.id as number;
    const response = await app.inject({
      method: 'GET',
      url: '/internal/whatsapp/accounts',
      headers: {
        'x-whatsapp-internal-token': 'moonwitness-local-whatsapp-internal-token-v1-unsafe',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: accountId })])
    );

    process.env.NODE_ENV = 'production';
    const productionResponse = await app.inject({
      method: 'GET',
      url: '/internal/whatsapp/accounts',
      headers: {
        'x-whatsapp-internal-token': 'moonwitness-local-whatsapp-internal-token-v1-unsafe',
      },
    });
    expect(productionResponse.statusCode).toBe(401);
  });

  it('handles internal connection control and validates duplicate/media callbacks idempotently', async () => {
    const connected = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    const accountId = connected.json().data.id as number;
    const headers = { 'x-whatsapp-internal-token': process.env.WHATSAPP_INTERNAL_TOKEN! };
    const control = await app.inject({
      method: 'POST',
      url: '/internal/whatsapp/connection-control',
      headers,
      payload: { account_id: accountId, connected: true },
    });
    expect(control.statusCode).toBe(200);
    expect((await db('whatsapp_accounts').where({ id: accountId }).first())?.status).toBe(
      'connecting'
    );
    const disconnect = await app.inject({
      method: 'POST',
      url: '/whatsapp/disconnect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    expect(disconnect.statusCode).toBe(200);
    const reconnect = await app.inject({
      method: 'POST',
      url: '/internal/whatsapp/connection-control',
      headers,
      payload: { account_id: accountId, connected: true },
    });
    expect(reconnect.statusCode).toBe(200);
    const incoming = {
      account_id: accountId,
      jid: '123@g.us',
      external_id: 'media-message',
      name: 'Group',
      is_group: true,
      content: 'photo',
      media_base64: Buffer.from('media').toString('base64'),
      media_mime_type: 'image/png',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/whatsapp/incoming',
          headers,
          payload: incoming,
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/whatsapp/incoming',
          headers,
          payload: incoming,
        })
      ).statusCode
    ).toBe(200);
    expect(Number((await db('whatsapp_messages').count({ count: '*' }).first())?.count)).toBe(1);
    expect(Number((await db('whatsapp_conversations').first())?.unread_count)).toBe(1);
    expect(stored.size).toBe(1);
  });
});
