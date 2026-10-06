import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import type { FastifyInstance, InjectOptions } from 'fastify';
import {
  AccessGroup,
  AuditLog,
  Company,
  CompanyMembership,
  Country,
  GroupMembership,
  ModelAccess,
  PartnerAddress,
  PartnerCategory,
  PartnerCategoryLink,
  Partner,
  User,
} from '@moonwitness/orm-base';
import { buildApp } from '../src/app.js';
import { OutboxEvent } from '@moonwitness/jobs';

const ADMIN_PASSWORD = 'admin-test-password';
const USER_PASSWORD = 'alice-test-password';
const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret-123';

interface TokenBody {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    user: { id: number; login: string; role: string };
  };
}

describe('authentication and authorization', () => {
  let db: Knex;
  let app: FastifyInstance;
  let admin: TokenBody['data'];
  let alice: TokenBody['data'];

  const login = (loginName: string, password: string) =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { login: loginName, password } });
  const as = (token: string, options: InjectOptions) =>
    app.inject({ ...options, headers: { authorization: `Bearer ${token}`, ...options.headers } });
  const rpc = (token: string, args: unknown[]) =>
    as(token, {
      method: 'POST',
      url: '/jsonrpc',
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'call',
        params: { service: 'object', method: 'execute_kw', args },
      },
    });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    app = await buildApp({
      db,
      superadminPassword: ADMIN_PASSWORD,
      jwtSecret: TEST_JWT_SECRET,
      loginRateMax: 1000,
    });
    await app.ready();

    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const partner = await Partner.query().insert({ name: 'Alice Regular', company_id: company.id });
    const aliceUser = await User.query().insertAndFetch({
      login: 'alice',
      password: USER_PASSWORD,
      partner_id: partner.id,
      role: 'user',
    });
    await CompanyMembership.query().insert({
      user_id: aliceUser.id,
      company_id: company.id,
      is_default: true,
    });
    admin = (await login('superadmin', ADMIN_PASSWORD)).json<TokenBody>().data;
    alice = (await login('alice', USER_PASSWORD)).json<TokenBody>().data;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('register', () => {
    it('registers a new user and returns tokens without returning passwords', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          login: 'charlie',
          password: 'charlie-strong-password',
          name: 'Charlie Chaplin',
          email: 'charlie@example.com',
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<TokenBody>();
      expect(body.success).toBe(true);
      expect(body.data.user).toMatchObject({
        login: 'charlie',
        role: 'user',
      });
      expect(body.data.access_token.split('.')).toHaveLength(3);
      const registered = await User.query().findOne({ login: 'charlie' }).throwIfNotFound();
      const defaultGroup = await AccessGroup.query().findOne({ code: 'user' }).throwIfNotFound();
      expect(
        await GroupMembership.query().findOne({ user_id: registered.id, group_id: defaultGroup.id })
      ).toBeDefined();
      expect(
        await CompanyMembership.query().findOne({ user_id: registered.id, is_default: true })
      ).toMatchObject({ company_id: 1, is_default: true });
      expect(JSON.stringify(body)).not.toContain('scrypt$');
      expect(JSON.stringify(body)).not.toContain('charlie-strong-password');
    });

    it('rejects duplicate registration with 409 Conflict', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          login: 'charlie',
          password: 'another-password',
        },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ success: false, error: 'User already exists' });
    });

    it('validates registration input requirements', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          login: 'ab', // minLength 3
          password: '123', // minLength 6
        },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('login', () => {
    it('issues bearer tokens and never returns credentials', async () => {
      expect(admin).toMatchObject({
        token_type: 'Bearer',
        expires_in: 900,
        user: { login: 'superadmin', role: 'superadmin' },
      });
      expect(admin.access_token.split('.')).toHaveLength(3);
      expect(JSON.stringify(admin)).not.toContain('scrypt$');
      const tokenBytes = Buffer.from(admin.refresh_token, 'base64url');
      expect(tokenBytes).toHaveLength(32);
      expect(tokenBytes.toString('base64url')).toBe(admin.refresh_token);
      const storedToken = await db<{ token_hash: string }>('auth_refresh_tokens')
        .select('token_hash')
        .where({ user_id: admin.user.id })
        .first();
      expect(storedToken?.token_hash).toMatch(/^[a-f0-9]{64}$/u);
      expect(storedToken?.token_hash).not.toBe(admin.refresh_token);
    });

    it('answers wrong password and unknown login identically', async () => {
      const wrong = await login('superadmin', 'nope');
      const unknown = await login('ghost', 'nope');
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrong.json()).toEqual(unknown.json());
    });

    it('rejects malformed bodies and ignores unknown properties', async () => {
      for (const payload of [{}, { login: 'a' }, { login: 1, password: 'b' }]) {
        const response = await app.inject({ method: 'POST', url: '/auth/login', payload });
        expect(response.statusCode).toBe(400);
      }
      // Ajv strips unknown keys, so these cannot smuggle extra fields into the service.
      const extra = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { login: 'ghost', password: 'b', role: 'superadmin' },
      });
      expect(extra.statusCode).toBe(401);
    });
  });

  describe('request guard', () => {
    it('keeps health and docs public but protects the API', async () => {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/models' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/jsonrpc', payload: {} })).statusCode).toBe(
        401
      );
      expect((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401);
    });

    it('ignores the legacy x-user-id header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/models',
        headers: { 'x-user-id': String(admin.user.id) },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects garbage and wrongly-claimed tokens', async () => {
      const garbage = await as('not.a.jwt', { method: 'GET', url: '/api/models' });
      expect(garbage.statusCode).toBe(401);
      expect(garbage.headers['www-authenticate']).toBe('Bearer');

      const badSubject = app.jwt.sign({ role: 'superadmin' }, { sub: 'abc' });
      expect((await as(badSubject, { method: 'GET', url: '/api/models' })).statusCode).toBe(401);
      const badRole = app.jwt.sign({ role: 'root' }, { sub: '1' });
      expect((await as(badRole, { method: 'GET', url: '/api/models' })).statusCode).toBe(401);
    });

    it('accepts a live access token and rejects tokens at or beyond their expiry boundary', async () => {
      const live = app.jwt.sign({ role: 'superadmin' }, { sub: '1', expiresIn: '1 minute' });
      expect((await as(live, { method: 'GET', url: '/api/models' })).statusCode).toBe(200);

      const atExpiry = app.jwt.sign({ role: 'superadmin' }, { sub: '1', expiresIn: '-1 ms' });
      const expiredAtBoundary = await as(atExpiry, { method: 'GET', url: '/api/models' });
      expect(expiredAtBoundary.statusCode).toBe(401);
      expect(expiredAtBoundary.headers['www-authenticate']).toBe('Bearer');

      const alreadyExpired = app.jwt.sign(
        { role: 'superadmin' },
        { sub: '1', expiresIn: '-1 second' }
      );
      expect((await as(alreadyExpired, { method: 'GET', url: '/api/models' })).statusCode).toBe(
        401
      );
    });

    it('returns the current user from /auth/me', async () => {
      const response = await as(alice.access_token, { method: 'GET', url: '/auth/me' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ data: { login: 'alice', role: 'user' } });
      expect(response.payload).not.toContain('password');
    });

    it('returns manifest menu metadata for models visible to the current user', async () => {
      const response = await as(alice.access_token, { method: 'GET', url: '/api/models' });
      expect(response.statusCode).toBe(200);
      const models = response.json<{
        models: Array<{
          model: string;
          menu: { group: string; sequence: number; developmentOnly: boolean };
        }>;
      }>().models;
      expect(models.find((item) => item.model === 'base.partner')?.menu).toMatchObject({
        group: 'Workspace',
        sequence: 10,
        developmentOnly: false,
      });
      expect(models.some((item) => item.model === 'base.model_access')).toBe(false);
      expect(models.find((item) => item.model === 'base.bank')?.menu.developmentOnly).toBe(true);
      expect(models.some((item) => item.model === 'base.partner_bank')).toBe(false);
    });

    it('updates only the authenticated user regional preferences', async () => {
      const unauthenticated = await app.inject({
        method: 'PATCH',
        url: '/auth/me/preferences',
        payload: { language_id: null, timezone: 'Asia/Jakarta' },
      });
      expect(unauthenticated.statusCode).toBe(401);

      const invalid = await as(alice.access_token, {
        method: 'PATCH',
        url: '/auth/me/preferences',
        payload: { language_id: null, timezone: 'Not/A_Real_Zone' },
      });
      expect(invalid.statusCode).toBe(400);

      const updated = await as(alice.access_token, {
        method: 'PATCH',
        url: '/auth/me/preferences',
        payload: { language_id: null, timezone: 'Asia/Jakarta' },
      });
      expect(updated.statusCode).toBe(200);
      await expect(User.query().findById(alice.user.id)).resolves.toMatchObject({
        timezone: 'Asia/Jakarta',
      });
    });

    it('updates only the contact linked to the authenticated user profile', async () => {
      const response = await as(alice.access_token, {
        method: 'PATCH',
        url: '/auth/me/profile',
        payload: {
          name: 'Alice Regular',
          email: 'alice.updated@example.com',
          phone: '+62-555-0199',
          role: 'superadmin',
        },
      });
      expect(response.statusCode).toBe(200);
      const aliceRecord = await User.query().findById(alice.user.id).throwIfNotFound();
      const alicePartner = await Partner.query().findById(aliceRecord.partner_id).throwIfNotFound();
      expect(alicePartner).toMatchObject({
        name: 'Alice Regular',
        email: 'alice.updated@example.com',
        phone: '+62-555-0199',
      });
      expect(aliceRecord.role).toBe('user');
    });

    it('changes password only with the current password and revokes refresh sessions', async () => {
      const oldSession = (await login('alice', USER_PASSWORD)).json<TokenBody>().data;
      const anotherSession = (await login('alice', USER_PASSWORD)).json<TokenBody>().data;
      try {
        const wrongCurrentPassword = await as(alice.access_token, {
          method: 'POST',
          url: '/auth/me/password',
          payload: {
            current_password: 'incorrect-password',
            new_password: 'new-strong-password-123',
          },
        });
        expect(wrongCurrentPassword.statusCode).toBe(400);

        const belowMinimum = await as(alice.access_token, {
          method: 'POST',
          url: '/auth/me/password',
          payload: { current_password: USER_PASSWORD, new_password: 'a'.repeat(11) },
        });
        expect(belowMinimum.statusCode).toBe(400);

        const tooLong = await as(alice.access_token, {
          method: 'POST',
          url: '/auth/me/password',
          payload: {
            current_password: USER_PASSWORD,
            new_password: 'a'.repeat(1025),
          },
        });
        expect(tooLong.statusCode).toBe(400);

        const changed = await as(alice.access_token, {
          method: 'POST',
          url: '/auth/me/password',
          payload: {
            current_password: USER_PASSWORD,
            new_password: 'twelve-chars',
          },
        });
        expect(changed.statusCode).toBe(200);
        expect(changed.json()).toMatchObject({ data: { refresh_sessions_revoked: true } });

        const oldRefresh = await app.inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: { refresh_token: oldSession.refresh_token },
        });
        expect(oldRefresh.statusCode).toBe(401);
        const otherRefresh = await app.inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: { refresh_token: anotherSession.refresh_token },
        });
        expect(otherRefresh.statusCode).toBe(401);
        expect((await login('alice', USER_PASSWORD)).statusCode).toBe(401);
        expect((await login('alice', 'twelve-chars')).statusCode).toBe(200);

        const maximumLengthPassword = 'a'.repeat(1024);
        const changedToMaximumLength = await as(alice.access_token, {
          method: 'POST',
          url: '/auth/me/password',
          payload: { current_password: 'twelve-chars', new_password: maximumLengthPassword },
        });
        expect(changedToMaximumLength.statusCode).toBe(200);
        expect((await login('alice', maximumLengthPassword)).statusCode).toBe(200);
      } finally {
        await User.query().findById(alice.user.id).patch({ password: USER_PASSWORD });
      }
    }, 15000);
  });

  describe('refresh and logout', () => {
    it('rotates refresh tokens and invalidates the family on reuse', async () => {
      const first = (await login('alice', USER_PASSWORD)).json<TokenBody>().data;
      const refreshed = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: first.refresh_token },
      });
      expect(refreshed.statusCode).toBe(200);
      const second = refreshed.json<TokenBody>().data;
      expect(second.refresh_token).not.toBe(first.refresh_token);

      await new Promise((resolve) => setTimeout(resolve, 5200));
      const replay = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: first.refresh_token },
      });
      expect(replay.statusCode).toBe(401);
      const afterReplay = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: second.refresh_token },
      });
      expect(afterReplay.statusCode).toBe(401);
    }, 10000);

    it('keeps the session alive when the same refresh token is used concurrently', async () => {
      const first = (await login('alice', USER_PASSWORD)).json<TokenBody>().data;
      const rotated = await Promise.all(
        Array.from({ length: 8 }, () =>
          app.inject({
            method: 'POST',
            url: '/auth/refresh',
            payload: { refresh_token: first.refresh_token },
          })
        )
      );
      expect(rotated.map((response) => response.statusCode)).toEqual(Array(8).fill(200));
      const branch = rotated[0].json<TokenBody>().data;
      const next = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: branch.refresh_token },
      });
      expect(next.statusCode).toBe(200);
    });

    it('logs out without revealing whether the token existed', async () => {
      const session = (await login('alice', USER_PASSWORD)).json<TokenBody>().data;
      for (const token of [session.refresh_token, session.refresh_token, 'unknown']) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/logout',
          payload: { refresh_token: token },
        });
        expect(response.statusCode).toBe(200);
      }
      const refresh = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: session.refresh_token },
      });
      expect(refresh.statusCode).toBe(401);
    });
  });

  describe('authorization', () => {
    it('denies cross-company reads, writes, creation and company selection', async () => {
      const foreignCompany = await Company.query().insert({ name: 'Foreign Tenant' });
      const foreignPartner = await Partner.query().insert({
        name: 'Foreign Partner',
        company_id: foreignCompany.id,
      });
      expect(
        (
          await as(alice.access_token, {
            method: 'GET',
            url: `/api/base.partner/${foreignPartner.id}`,
          })
        ).statusCode
      ).toBe(404);
      const userGroup = await AccessGroup.query().findOne({ code: 'user' }).throwIfNotFound();
      const partnerGrant = await ModelAccess.query()
        .findOne({ group_id: userGroup.id, model_name: 'base.partner' })
        .throwIfNotFound();
      await ModelAccess.query().findById(partnerGrant.id).patch({ write: true, create: true });
      expect(
        (
          await as(alice.access_token, {
            method: 'PATCH',
            url: `/api/base.partner/${foreignPartner.id}`,
            payload: { name: 'Stolen Partner' },
          })
        ).statusCode
      ).toBe(403);
      const deniedCreate = await as(alice.access_token, {
        method: 'POST',
        url: '/api/base.partner',
        payload: { name: 'Cross-company write', company_id: foreignCompany.id },
      });
      expect(deniedCreate.statusCode).toBe(403);
      expect(deniedCreate.payload).not.toContain('Foreign Tenant');
      const count = await as(alice.access_token, {
        method: 'GET',
        url: '/api/base.partner?count=true&limit=500',
      });
      expect(count.statusCode).toBe(200);
      expect(count.json<{ total: number }>().total).toBe(1);
      const exportRows = await as(alice.access_token, {
        method: 'GET',
        url: '/api/base.partner?limit=500',
      });
      expect(JSON.stringify(exportRows.json())).not.toContain('Foreign Partner');
      await ModelAccess.query().findById(partnerGrant.id).patch({ write: false, create: false });
      expect(
        (
          await as(alice.access_token, {
            method: 'GET',
            url: '/auth/me',
            headers: { 'x-company-id': String(foreignCompany.id) },
          })
        ).statusCode
      ).toBe(403);
    });

    it('lets an ordinary user read business models only', async () => {
      const list = await as(alice.access_token, { method: 'GET', url: '/api/models' });
      const names = list.json<{ models: { model: string }[] }>().models.map((m) => m.model);
      expect(names).toContain('base.partner');
      expect(names).not.toContain('base.user');
      expect(names).not.toContain('auth.refresh_token');

      const read = await as(alice.access_token, { method: 'GET', url: '/api/base.partner' });
      expect(read.statusCode).toBe(200);
      expect(read.json<{ data: { name: string }[] }>().data.map((record) => record.name)).toEqual([
        'Alice Regular',
      ]);
      const otherPartner = await Partner.query().findOne({ name: 'System User' }).throwIfNotFound();
      expect(
        (
          await as(alice.access_token, {
            method: 'GET',
            url: `/api/base.partner/${otherPartner.id}`,
          })
        ).statusCode
      ).toBe(404);
      const ownCompany = await as(alice.access_token, {
        method: 'GET',
        url: '/api/base.company?with=country',
      });
      expect(ownCompany.json<{ data: { name: string }[] }>().data).toMatchObject([
        { name: 'MoonWitness' },
      ]);
      const publicCountry = await as(alice.access_token, {
        method: 'GET',
        url: `/api/base.country?domain=${encodeURIComponent(JSON.stringify([['code', '=', 'US']]))}`,
      });
      expect(publicCountry.json<{ data: { name: string }[] }>().data).toMatchObject([
        { name: 'United States' },
      ]);
      const scopedFilter = await as(alice.access_token, {
        method: 'GET',
        url: `/api/base.partner?domain=${encodeURIComponent(JSON.stringify([['id', '>', 0]]))}&order=name%20desc`,
      });
      expect(
        scopedFilter.json<{ data: { name: string }[] }>().data.map(({ name }) => name)
      ).toEqual(['Alice Regular']);
      const scopedRpc = await rpc(alice.access_token, [
        'base.partner',
        'search_read',
        [[['id', '>', 0]]],
        { order: 'name desc' },
      ]);
      expect(
        scopedRpc.json<{ result: { name: string }[] }>().result.map(({ name }) => name)
      ).toEqual(['Alice Regular']);
      expect(
        (
          await rpc(alice.access_token, [
            'base.partner',
            'search_read',
            [[]],
            { with: 'company.country' },
          ])
        ).statusCode
      ).toBe(403);
      expect(
        (
          await as(alice.access_token, {
            method: 'GET',
            url: '/api/base.partner?with=company.country',
          })
        ).statusCode
      ).toBe(403);
      const readViaRpc = await rpc(alice.access_token, ['base.partner', 'search_read', [[]]]);
      expect(readViaRpc.statusCode).toBe(200);
      expect(readViaRpc.json<{ result: { name: string }[] }>().result).toMatchObject([
        { name: 'Alice Regular' },
      ]);
    });

    it('denies writes, actions and administrative models to ordinary users', async () => {
      const denied = [
        await as(alice.access_token, {
          method: 'POST',
          url: '/api/base.partner',
          payload: { name: 'Nope' },
        }),
        await as(alice.access_token, {
          method: 'PUT',
          url: '/api/base.partner/1',
          payload: { name: 'Nope' },
        }),
        await as(alice.access_token, { method: 'DELETE', url: '/api/base.partner/1' }),
        await as(alice.access_token, {
          method: 'POST',
          url: '/api/base.partner/1/action/action_archive',
        }),
        await as(alice.access_token, { method: 'GET', url: '/api/base.user' }),
      ];
      expect(denied.map((response) => response.statusCode)).toEqual([403, 403, 403, 403, 403]);

      const rpcWrite = await rpc(alice.access_token, [
        'base.partner',
        'create',
        [{ name: 'Nope' }],
      ]);
      expect(rpcWrite.statusCode).toBe(403);
      expect(rpcWrite.json()).toMatchObject({ error: { code: -32003 } });
    });

    it('allows model-specific user writes granted through an access group', async () => {
      const group = await AccessGroup.query().insert({
        code: 'partner_creators',
        name: 'Partner Creators',
      });
      await GroupMembership.query().insert({ user_id: alice.user.id, group_id: group.id });
      await ModelAccess.query().insert({
        group_id: group.id,
        model_name: 'base.partner',
        create: true,
        write: true,
      });

      const created = await as(alice.access_token, {
        method: 'POST',
        url: '/api/base.partner',
        payload: { name: 'Group-created partner' },
      });
      expect(created.statusCode).toBe(201);
      const protectedGrant = await as(admin.access_token, {
        method: 'POST',
        url: '/api/base.model_access',
        payload: { group_id: group.id, model_name: 'base.model_access', create: true },
      });
      expect(protectedGrant.statusCode).toBe(400);
    });

    it('scopes structured addresses and categories to the user partner profile', async () => {
      const aliceUser = await User.query().findOne({ login: 'alice' }).throwIfNotFound();
      const customerCategory = await PartnerCategory.query()
        .findOne({ code: 'customer' })
        .throwIfNotFound();
      const indonesia = await Country.query().findOne({ code: 'ID' }).throwIfNotFound();
      await PartnerAddress.query().insert({
        partner_id: aliceUser.partner_id,
        label: 'Alice home',
        address_type: 'contact',
        street: '1 Main Street',
        city: 'Jakarta',
        country_id: indonesia.id,
        is_primary: true,
      });
      await PartnerCategoryLink.query().insert({
        partner_id: aliceUser.partner_id,
        category_id: customerCategory.id,
      });

      const profile = await as(alice.access_token, {
        method: 'GET',
        url: '/api/base.partner?with=addresses.country',
      });
      expect(profile.statusCode).toBe(200);
      expect(
        profile.json<{ data: { name: string; addresses: { city: string }[] }[] }>().data
      ).toMatchObject([{ name: 'Alice Regular', addresses: [{ city: 'Jakarta' }] }]);

      const assignments = await as(alice.access_token, {
        method: 'GET',
        url: '/api/base.partner_category_link?with=category',
      });
      expect(assignments.statusCode).toBe(200);
      expect(assignments.json<{ data: { partner_id: number }[] }>().data).toHaveLength(1);
      expect(assignments.json<{ data: { partner_id: number }[] }>().data[0]?.partner_id).toBe(
        aliceUser.partner_id
      );
    });

    it('hides internal auth models even from administrators', async () => {
      const rest = await as(admin.access_token, { method: 'GET', url: '/api/auth.refresh_token' });
      expect(rest.statusCode).toBe(403);
      const viaRpc = await rpc(admin.access_token, ['auth.refresh_token', 'search_read', [[]]]);
      expect(viaRpc.statusCode).toBe(403);
      const list = await as(admin.access_token, { method: 'GET', url: '/api/models' });
      expect(JSON.stringify(list.json())).not.toContain('auth.refresh_token');
    });

    it('stamps audit fields with the authenticated user', async () => {
      const created = await as(admin.access_token, {
        method: 'POST',
        url: '/api/base.partner',
        payload: { name: 'Audited Partner' },
      });
      expect(created.statusCode).toBe(201);
      const row = await Partner.query().findById(created.json<{ data: { id: number } }>().data.id);
      expect(row?.create_uid).toBe(admin.user.id);
    });

    it('does not let password hashes be probed through filters or sorting', async () => {
      const probe = await as(admin.access_token, {
        method: 'GET',
        url: `/api/base.user?domain=${encodeURIComponent(JSON.stringify([['password', 'like', 'scrypt%']]))}`,
      });
      expect(probe.statusCode).toBe(400);
      const sorted = await as(admin.access_token, {
        method: 'GET',
        url: '/api/base.user?order=password%20asc',
      });
      expect(sorted.statusCode).toBe(400);
    });

    it('uses stable cursor pagination with bounded pages', async () => {
      const first = await as(admin.access_token, {
        method: 'GET',
        url: '/api/base.partner?cursor=0&limit=2&order=id%20asc&count=true',
      });
      expect(first.statusCode).toBe(200);
      const firstPage = first.json<{
        data: { id: number }[];
        total: number;
        nextCursor?: number;
      }>();
      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.nextCursor).toBe(firstPage.data[1]?.id);
      expect(firstPage.total).toBeGreaterThan(2);

      const next = await as(admin.access_token, {
        method: 'GET',
        url: `/api/base.partner?cursor=${firstPage.nextCursor}&limit=2`,
      });
      const nextIds = next.json<{ data: { id: number }[] }>().data.map(({ id }) => id);
      expect(nextIds.every((id) => id > (firstPage.nextCursor ?? 0))).toBe(true);

      expect(
        (
          await as(admin.access_token, {
            method: 'GET',
            url: '/api/base.partner?cursor=0&limit=2&offset=1',
          })
        ).statusCode
      ).toBe(400);
      expect(
        (
          await as(admin.access_token, {
            method: 'GET',
            url: '/api/base.partner?cursor=0&order=name%20desc',
          })
        ).statusCode
      ).toBe(400);
    });

    it('stores append-only API changes without password or token values', async () => {
      const partner = await as(admin.access_token, {
        method: 'POST',
        url: '/api/base.partner',
        payload: { name: 'Audit Trail Person' },
      });
      const partnerId = partner.json<{ data: { id: number } }>().data.id;
      const created = await as(admin.access_token, {
        method: 'POST',
        url: '/api/base.user',
        payload: {
          login: 'audit-user',
          password: 'secret-audit-password',
          partner_id: partnerId,
          role: 'user',
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.payload).not.toContain('secret-audit-password');
      expect(created.payload).not.toContain('scrypt$');
      const userId = created.json<{ data: { id: number } }>().data.id;
      const event = await AuditLog.query()
        .findOne({ model: 'base.user', record_id: userId, operation: 'create' })
        .throwIfNotFound();
      expect(event.actor_id).toBe(admin.user.id);
      expect(event.changes).toContain('audit-user');
      expect(event.changes).not.toContain('secret-audit-password');
      expect(event.changes).not.toContain('scrypt$');
      const outboxEvent = await OutboxEvent.query()
        .findOne({
          aggregate_model: 'base.user',
          aggregate_id: userId,
          event_type: 'record.created',
        })
        .throwIfNotFound();
      expect(outboxEvent.status).toBe('pending');
      expect(outboxEvent.payload).not.toContain('secret-audit-password');
      expect(outboxEvent.payload).not.toContain('scrypt$');

      const restUser = await as(admin.access_token, {
        method: 'GET',
        url: `/api/base.user/${userId}?with=partner`,
      });
      expect(restUser.statusCode).toBe(200);
      expect(restUser.payload).not.toContain('secret-audit-password');
      expect(restUser.payload).not.toContain('scrypt$');

      const rpcUser = await rpc(admin.access_token, ['base.user', 'search_read', [[]], {}]);
      expect(rpcUser.statusCode).toBe(200);
      expect(rpcUser.payload).not.toContain('secret-audit-password');
      expect(rpcUser.payload).not.toContain('scrypt$');
      const ormUser = await User.query().findById(userId).throwIfNotFound();
      expect(JSON.stringify(ormUser.toJSON())).not.toContain('scrypt$');
      expect(
        JSON.stringify(await User.search_read([['id', '=', userId]], { limit: 1 }))
      ).not.toContain('scrypt$');

      const sensitiveError = await as(admin.access_token, {
        method: 'POST',
        url: '/api/base.user',
        payload: {
          login: 'invalid-secret-probe',
          partner_id: partnerId,
          password: 'secret-validation-probe',
          unexpected_secret: 'secret-error-probe',
        },
      });
      expect(sensitiveError.statusCode).toBe(400);
      expect(sensitiveError.payload).not.toContain('secret-validation-probe');
      expect(sensitiveError.payload).not.toContain('secret-error-probe');

      expect(
        (await as(alice.access_token, { method: 'GET', url: '/api/base.audit_log' })).statusCode
      ).toBe(403);
      expect(
        (await as(admin.access_token, { method: 'GET', url: '/api/base.audit_log' })).statusCode
      ).toBe(200);
      expect(
        (
          await as(admin.access_token, {
            method: 'DELETE',
            url: `/api/base.audit_log/${event.id}?hard=true`,
          })
        ).statusCode
      ).toBe(403);

      const rpcWrite = await rpc(admin.access_token, [
        'base.partner',
        'write',
        [[partnerId], { phone: '555-0100' }],
      ]);
      expect(rpcWrite.statusCode).toBe(200);
      const rpcEvent = await AuditLog.query().findOne({
        model: 'base.partner',
        record_id: partnerId,
        operation: 'write',
      });
      expect(rpcEvent?.changes).toContain('555-0100');
    });

    it('rolls back a business create when the audit outbox cannot be recorded', async () => {
      await db.raw(`
        CREATE TRIGGER reject_outbox_insert
        BEFORE INSERT ON outbox_events
        BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END;
      `);
      const response = await as(admin.access_token, {
        method: 'POST',
        url: '/api/base.partner',
        payload: { name: 'Must roll back' },
      });
      await db.raw('DROP TRIGGER reject_outbox_insert');
      expect(response.statusCode).toBe(500);
      expect(await Partner.query().findOne({ name: 'Must roll back' })).toBeUndefined();
    });

    it('rejects login and refresh for users whose partner is inactive', async () => {
      const session = (await login('alice', USER_PASSWORD)).json<TokenBody>().data;
      await Partner.query().findById(alice.user.partner_id).patch({ active: false });

      expect((await login('alice', USER_PASSWORD)).statusCode).toBe(401);
      const refreshed = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: session.refresh_token },
      });
      expect(refreshed.statusCode).toBe(401);
    });

    it('uses the current database role instead of stale JWT role claims', async () => {
      await User.query().findById(admin.user.id).patch({ role: 'user' });
      try {
        expect(
          (await as(admin.access_token, { method: 'GET', url: '/api/base.user' })).statusCode
        ).toBe(403);
      } finally {
        await User.query().findById(admin.user.id).patch({ role: 'superadmin' });
      }
    });

    it('applies role and active-state changes immediately to existing access tokens', async () => {
      await User.query().findById(admin.user.id).patch({ role: 'user' });
      try {
        const demoted = await as(admin.access_token, {
          method: 'GET',
          url: '/api/base.user',
        });
        expect(demoted.statusCode).toBe(403);
        await User.query().findById(admin.user.id).patch({ active: false });
        const disabled = await as(admin.access_token, {
          method: 'GET',
          url: '/api/base.user',
        });
        expect(disabled.statusCode).toBe(401);
      } finally {
        await User.query().findById(admin.user.id).patch({ role: 'superadmin', active: true });
      }
    });
  });
});
