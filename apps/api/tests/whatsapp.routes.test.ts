import Fastify from 'fastify';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import { jobsManifest } from '@moonwitness/jobs';
import { whatsappManifest } from '../src/whatsapp/manifest.js';
import { Model } from 'objection';
import knex, { type Knex } from 'knex';
import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttachmentStorage } from '@moonwitness/orm-storage';
import { whatsappRoutes } from '../src/routes/whatsapp.routes.js';
import { getRecordRuleDomain } from '../src/auth/rules.js';
import { canAccess } from '../src/auth/policy.js';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

const postgres = process.env.WHATSAPP_TEST_POSTGRES === 'true';
if (postgres) dotenv.config({ path: '../../.env', quiet: true });

describe('WhatsApp API tenant boundary and durable queue', () => {
  let db: Knex;
  let app: ReturnType<typeof Fastify>;
  let companyId: number;
  let schema: string;
  const previousToken = process.env.WHATSAPP_INTERNAL_TOKEN;
  const previousNodeEnvironment = process.env.NODE_ENV;
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

  beforeAll(async () => {
    process.env.WHATSAPP_INTERNAL_TOKEN = 'unit-test-internal-token-with-enough-length';
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
    await installAddons(db, [baseManifest, jobsManifest, whatsappManifest]);
    companyId = Number((await db('companies').first('id'))?.id);
  }, 120_000);

  beforeEach(async () => {
    process.env.WHATSAPP_INTERNAL_TOKEN = 'unit-test-internal-token-with-enough-length';
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
    for (const table of [
      'whatsapp_events',
      'whatsapp_jobs',
      'whatsapp_messages',
      'whatsapp_conversations',
      'whatsapp_accounts',
    ])
      await db(table).delete();
    stored.clear();
    if (previousToken === undefined) delete process.env.WHATSAPP_INTERNAL_TOKEN;
    else process.env.WHATSAPP_INTERNAL_TOKEN = previousToken;
    if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnvironment;
  });

  afterAll(async () => {
    if (postgres) await db.raw(`DROP SCHEMA "${schema}" CASCADE`);
    await db.destroy();
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
      Number(
        (await db('whatsapp_jobs').where({ company_id: companyId }).count({ count: '*' }).first())
          ?.count
      )
    ).toBe(1);
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

  async function setupChat(group = false) {
    const response = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    const accountId = response.json().data.id as number;
    await db('whatsapp_accounts').where({ id: accountId }).update({ status: 'connected' });
    const [chat] = await db('whatsapp_conversations')
      .insert({
        company_id: companyId,
        account_id: accountId,
        jid: group ? '123@g.us' : '123@s.whatsapp.net',
        name: 'Test',
        is_group: group,
        unread_count: 0,
      })
      .returning('id');
    return { accountId, conversationId: chat.id as number };
  }
  const serviceHeaders = () => ({
    'x-whatsapp-internal-token': process.env.WHATSAPP_INTERNAL_TOKEN!,
  });

  it('guards every Board and internal operation and prevents generic WhatsApp mutations', async () => {
    for (const [method, url] of [
      ['GET', '/whatsapp/account'],
      ['POST', '/whatsapp/connect'],
      ['POST', '/whatsapp/disconnect'],
      ['GET', '/whatsapp/conversations'],
      ['POST', '/whatsapp/conversations'],
      ['GET', '/whatsapp/conversations/1/messages'],
      ['POST', '/whatsapp/conversations/1/messages'],
      ['GET', '/whatsapp/media/1'],
      ['POST', '/whatsapp/messages/1/retry'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method,
            url,
            headers: { authorization: 'Bearer test', 'x-test-company': 'none' },
          })
        ).statusCode
      ).toBe(403);
    }
    for (const [method, path] of [
      ['GET', 'accounts'],
      ['POST', 'connection-control'],
      ['POST', 'jobs/claim'],
      ['POST', 'jobs/heartbeat'],
      ['POST', 'job-result'],
      ['POST', 'status'],
      ['POST', 'incoming'],
      ['POST', 'events/process'],
      ['POST', 'message-status'],
      ['GET', 'media/123'],
    ] as const)
      expect((await app.inject({ method, url: `/internal/whatsapp/${path}` })).statusCode).toBe(
        401
      );
    for (const role of ['superadmin', 'system', 'user']) {
      expect(canAccess(role, 'whatsapp.account', 'read')).toBe(true);
      for (const operation of ['create', 'write', 'unlink', 'action'] as const)
        expect(canAccess(role, 'whatsapp.account', operation)).toBe(false);
    }
  });

  it('uses development token defaults but rejects that fallback in production', async () => {
    delete process.env.WHATSAPP_INTERNAL_TOKEN;
    process.env.NODE_ENV = 'test';
    const headers = {
      'x-whatsapp-internal-token': 'moonwitness-local-whatsapp-internal-token-v1-unsafe',
    };
    expect(
      (await app.inject({ method: 'GET', url: '/internal/whatsapp/accounts', headers })).statusCode
    ).toBe(200);
    process.env.NODE_ENV = 'production';
    expect(
      (await app.inject({ method: 'GET', url: '/internal/whatsapp/accounts', headers })).statusCode
    ).toBe(401);
  });

  it('preserves internal connection control and deduplicates media through the incoming queue', async () => {
    const { accountId } = await setupChat();
    const control = (connected: boolean) =>
      app.inject({
        method: 'POST',
        url: '/internal/whatsapp/connection-control',
        headers: serviceHeaders(),
        payload: { account_id: accountId, connected },
      });
    expect((await control(false)).statusCode).toBe(200);
    expect((await db('whatsapp_accounts').where({ id: accountId }).first()).status).toBe(
      'disconnected'
    );
    expect((await control(true)).statusCode).toBe(200);
    expect((await db('whatsapp_accounts').where({ id: accountId }).first()).status).toBe(
      'connecting'
    );
    const payload = {
      account_id: accountId,
      jid: '123@g.us',
      external_id: 'compat-media',
      content: 'photo',
      media_base64: Buffer.from('media').toString('base64'),
      media_mime_type: 'image/png',
    };
    for (let i = 0; i < 2; i++)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/internal/whatsapp/incoming',
            headers: serviceHeaders(),
            payload,
          })
        ).statusCode
      ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/whatsapp/events/process',
          headers: serviceHeaders(),
        })
      ).statusCode
    ).toBe(200);
    expect(Number((await db('whatsapp_messages').count({ count: '*' }).first())?.count)).toBe(1);
    expect(stored.size).toBe(1);
  });

  it('starts private chats with validated phone numbers and reuses an existing company conversation', async () => {
    await setupChat();
    const request = {
      method: 'POST' as const,
      url: '/whatsapp/conversations',
      headers: { authorization: 'Bearer test' },
    };
    expect((await app.inject({ ...request, payload: { phone: 'invalid' } })).statusCode).toBe(400);
    const first = await app.inject({
      ...request,
      payload: { phone: '+6281234567890', name: 'Test contact' },
    });
    const second = await app.inject({ ...request, payload: { phone: '6281234567890' } });
    expect(first.statusCode).toBe(201);
    expect(second.json().data.id).toBe(first.json().data.id);
    expect(first.json().data.company_id).toBe(companyId);
    expect(
      (
        await app.inject({
          ...request,
          headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
          payload: { phone: '6281234567890' },
        })
      ).statusCode
    ).toBe(409);
  });

  it('serializes concurrent claims and incoming group events without losing unread counts', async () => {
    const { accountId, conversationId } = await setupChat();
    const incoming = (external_id: string) =>
      app.inject({
        method: 'POST',
        url: '/internal/whatsapp/incoming',
        headers: serviceHeaders(),
        payload: { account_id: accountId, jid: '999@g.us', external_id, content: 'Test' },
      });
    const received = await Promise.all([incoming('one'), incoming('two'), incoming('one')]);
    expect(received.every((result) => result.statusCode === 200)).toBe(true);
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: '/internal/whatsapp/events/process',
          headers: serviceHeaders(),
        })
      )
    );
    expect(results.every((result) => result.statusCode === 200)).toBe(true);
    expect(
      (await db('whatsapp_conversations').where({ jid: '999@g.us' }).first()).unread_count
    ).toBe(2);
    await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: { content: 'Concurrent claim' },
    });
    const claims = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: '/internal/whatsapp/jobs/claim',
          headers: serviceHeaders(),
        })
      )
    );
    expect(claims.filter((result) => result.json().data !== null)).toHaveLength(1);
  });

  it('keeps historical messages ordered and does not mark history as unread', async () => {
    const { accountId } = await setupChat();
    for (const [external_id, content, timestamp, notify] of [
      ['new', 'Latest', '2026-01-02T00:00:00.000Z', true],
      ['old', 'Historical', '2026-01-01T00:00:00.000Z', false],
    ] as const) {
      await app.inject({
        method: 'POST',
        url: '/internal/whatsapp/incoming',
        headers: serviceHeaders(),
        payload: {
          account_id: accountId,
          jid: '999@g.us',
          external_id,
          content,
          timestamp,
          notify,
        },
      });
      await app.inject({
        method: 'POST',
        url: '/internal/whatsapp/events/process',
        headers: serviceHeaders(),
      });
    }
    const chat = await db('whatsapp_conversations').where({ jid: '999@g.us' }).first();
    expect(chat.last_message).toBe('Latest');
    expect(chat.unread_count).toBe(1);
    const response = await app.inject({
      method: 'GET',
      url: `/whatsapp/conversations/${chat.id}/messages`,
      headers: { authorization: 'Bearer test' },
    });
    expect(response.json().data.map((item: { content: string }) => item.content)).toEqual([
      'Latest',
      'Historical',
    ]);
  });

  it('keeps a single account and does not interrupt an already connected account', async () => {
    const { accountId } = await setupChat();
    const response = await app.inject({
      method: 'POST',
      url: '/whatsapp/connect',
      headers: { authorization: 'Bearer test' },
      payload: {},
    });
    expect(response.json().data).toEqual({ id: accountId, status: 'connected' });
    expect(Number((await db('whatsapp_accounts').count({ count: '*' }).first())?.count)).toBe(1);
    await app.inject({
      method: 'POST',
      url: '/whatsapp/disconnect',
      headers: { authorization: 'Bearer test' },
    });
    await app.inject({
      method: 'POST',
      url: '/internal/whatsapp/status',
      headers: serviceHeaders(),
      payload: { account_id: accountId, status: 'connected' },
    });
    expect((await db('whatsapp_accounts').where({ id: accountId }).first()).status).toBe(
      'disconnected'
    );
  });

  it('rejects empty messages and disconnected media without leaving stored attachments', async () => {
    const { accountId, conversationId } = await setupChat();
    const request = {
      method: 'POST' as const,
      url: `/whatsapp/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer test' },
    };
    expect((await app.inject({ ...request, payload: { content: '   ' } })).statusCode).toBe(400);
    expect(
      (await app.inject({ ...request, payload: { content: '', media_base64: 'invalid!' } }))
        .statusCode
    ).toBe(400);
    await db('whatsapp_accounts').where({ id: accountId }).update({ status: 'disconnected' });
    expect(
      (
        await app.inject({
          ...request,
          payload: { content: '', media_base64: Buffer.from('test').toString('base64') },
        })
      ).statusCode
    ).toBe(409);
    expect(stored.size).toBe(0);
    expect(Number((await db('whatsapp_jobs').count({ count: '*' }).first())?.count)).toBe(0);
  });

  it('recovers expired claims, fences old attempts and preserves read status on delayed send callbacks', async () => {
    const { conversationId } = await setupChat(true);
    const sent = await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: { content: 'Test group' },
    });
    expect(sent.statusCode).toBe(202);
    const externalId = sent.json().data.external_id as string;
    const claim = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/internal/whatsapp/jobs/claim',
          headers: serviceHeaders(),
        })
      ).json().data;
    const first = await claim();
    expect(first).toMatchObject({ attempts: 1, recipient_jid: '123@g.us' });
    expect(await claim()).toBe(null);
    await db('whatsapp_jobs')
      .where({ id: first.id })
      .update({ write_date: new Date(Date.now() - 120_000).toISOString() });
    const second = await claim();
    expect(second.attempts).toBe(2);
    for (const [attempts, statusCode] of [
      [1, 409],
      [2, 200],
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/internal/whatsapp/jobs/heartbeat',
            headers: serviceHeaders(),
            payload: { job_id: first.id, attempts },
          })
        ).statusCode
      ).toBe(statusCode);
    const result = (attempts: number, status: string) =>
      app.inject({
        method: 'POST',
        url: '/internal/whatsapp/job-result',
        headers: serviceHeaders(),
        payload: { job_id: first.id, attempts, status, external_id: externalId },
      });
    expect((await result(1, 'dead')).statusCode).toBe(409);
    for (const status of ['read', 'sent', 'delivered'])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/internal/whatsapp/message-status',
            headers: serviceHeaders(),
            payload: { account_id: first.account_id, external_id: externalId, status },
          })
        ).statusCode
      ).toBe(200);
    expect((await result(2, 'done')).statusCode).toBe(200);
    expect((await db('whatsapp_messages').where({ id: sent.json().data.id }).first()).status).toBe(
      'read'
    );
    expect((await result(2, 'retry')).statusCode).toBe(409);
    expect(await claim()).toBe(null);
  });

  it('backs off retries and stops after the maximum attempt count', async () => {
    const { accountId, conversationId } = await setupChat();
    await app.inject({
      method: 'POST',
      url: `/whatsapp/conversations/${conversationId}/messages`,
      headers: { authorization: 'Bearer test' },
      payload: { content: 'Retry test' },
    });
    const claim = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/internal/whatsapp/jobs/claim',
          headers: serviceHeaders(),
        })
      ).json().data;
    const job = await claim();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/internal/whatsapp/job-result',
          headers: serviceHeaders(),
          payload: { job_id: job.id, attempts: 1, status: 'retry', error: 'temporary' },
        })
      ).statusCode
    ).toBe(200);
    expect(await claim()).toBe(null);
    await db('whatsapp_accounts').where({ id: accountId }).update({ status: 'disconnected' });
    await db('whatsapp_jobs')
      .where({ id: job.id })
      .update({ available_at: new Date(0).toISOString() });
    expect(await claim()).toBe(null);
    await db('whatsapp_accounts').where({ id: accountId }).update({ status: 'connected' });
    await db('whatsapp_jobs').where({ id: job.id }).update({ attempts: 8 });
    expect(await claim()).toBe(null);
    expect((await db('whatsapp_jobs').where({ id: job.id }).first()).status).toBe('dead');
    expect((await db('whatsapp_messages').where({ id: job.message_id }).first()).status).toBe(
      'failed'
    );
    const retryUrl = `/whatsapp/messages/${job.message_id}/retry`;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: retryUrl,
          headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
        })
      ).statusCode
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: retryUrl,
          headers: { authorization: 'Bearer test' },
        })
      ).statusCode
    ).toBe(202);
    expect((await claim()).attempts).toBe(1);
  });

  it('persists incoming group media, retries storage errors, and protects company and sensitive fields', async () => {
    const { accountId } = await setupChat();
    const headers = serviceHeaders();
    const payload = {
      account_id: accountId,
      jid: '456@g.us',
      external_id: 'incoming-media',
      name: 'Group',
      sender_jid: '789@s.whatsapp.net',
      content: 'Caption',
      media_base64: Buffer.from('test-media').toString('base64'),
      media_mime_type: 'image/png',
      media_file_name: 'sample.png',
    };
    expect(
      (await app.inject({ method: 'POST', url: '/internal/whatsapp/incoming', headers, payload }))
        .statusCode
    ).toBe(200);
    const put = storage.put;
    storage.put = async () => {
      throw new Error('storage unavailable');
    };
    expect(
      (await app.inject({ method: 'POST', url: '/internal/whatsapp/events/process', headers }))
        .statusCode
    ).toBe(500);
    storage.put = put;
    expect((await db('whatsapp_events').first()).status).toBe('pending');
    expect((await db('whatsapp_events').first()).attempts).toBe(1);
    await db('whatsapp_events').update({ available_at: '' });
    expect(
      (await app.inject({ method: 'POST', url: '/internal/whatsapp/events/process', headers }))
        .statusCode
    ).toBe(200);
    const message = await db('whatsapp_messages').where({ external_id: 'incoming-media' }).first();
    expect(message).toMatchObject({
      content: 'Caption',
      sender_jid: '789@s.whatsapp.net',
      message_type: 'image',
    });
    expect(stored.get(message.media_key)?.toString()).toBe('test-media');
    const own = await app.inject({
      method: 'GET',
      url: `/whatsapp/conversations/${message.conversation_id}/messages`,
      headers: { authorization: 'Bearer test' },
    });
    expect(own.json().data[0]).not.toHaveProperty('media_key');
    const foreign = await app.inject({
      method: 'GET',
      url: `/whatsapp/conversations/${message.conversation_id}/messages`,
      headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
    });
    expect(foreign.statusCode).toBe(404);
    const inbox = await app.inject({
      method: 'GET',
      url: '/whatsapp/conversations',
      headers: { authorization: 'Bearer test', 'x-test-company': 'foreign' },
    });
    expect(inbox.json().data).toEqual([]);
    const account = await app.inject({
      method: 'GET',
      url: '/whatsapp/account',
      headers: { authorization: 'Bearer test' },
    });
    expect(account.json().data).not.toHaveProperty('auth_state');
    for (const role of ['superadmin', 'user', 'system'])
      expect(
        await getRecordRuleDomain({ auth: { role, companyId } } as never, 'whatsapp.account')
      ).toEqual([['company_id', '=', companyId]]);
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
    expect(Number((await db('whatsapp_events').count({ count: '*' }).first())?.count)).toBe(1);
    expect(Number((await db('whatsapp_messages').count({ count: '*' }).first())?.count)).toBe(0);
    expect(
      (
        await app.inject({ method: 'POST', url: '/internal/whatsapp/events/process', headers })
      ).json().data.processed
    ).toBe(true);
    expect(
      (
        await app.inject({ method: 'POST', url: '/internal/whatsapp/events/process', headers })
      ).json().data.processed
    ).toBe(false);
    expect(Number((await db('whatsapp_messages').count({ count: '*' }).first())?.count)).toBe(1);
    expect((await db('whatsapp_conversations').first()).unread_count).toBe(1);
  });
});
