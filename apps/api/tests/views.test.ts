import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import {
  Company,
  CompanyMembership,
  Country,
  Currency,
  Language,
  Partner,
  User,
} from '@moonwitness/orm-base';
import { defineView, describeFields } from '@moonwitness/orm';
import { buildApp } from '../src/app.js';

interface FieldMeta {
  name: string;
  type: string;
  label: string;
  required: boolean;
  readonly: boolean;
  writeOnly?: boolean;
  relation?: string;
  selection?: { value: string }[];
}
interface ViewsBody {
  model: string;
  title: string;
  fields: FieldMeta[];
  permissions: Record<'read' | 'create' | 'write' | 'unlink', boolean>;
  list: { columns: string[]; order?: string };
  form: { sections: { title?: string; fields: string[] }[] };
  search: { fields: string[]; filters: { label: string; domain: unknown[] }[] };
}

describe('data-driven view metadata', () => {
  let db: Knex;
  let app: FastifyInstance;
  let adminToken = '';
  let systemToken = '';
  let userToken = '';

  const get = (token: string, url: string) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    app = await buildApp({
      db,
      superadminPassword: 'views-admin-password',
      jwtSecret: 'test-secret-test-secret-test-secret-123',
      loginRateMax: 1000,
    });
    await app.ready();
    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const partner = await Partner.query().insert({ name: 'Viewer', company_id: company.id });
    const viewer = await User.query().insert({
      login: 'viewer',
      password: 'viewer-password',
      partner_id: partner.id,
      role: 'user',
    });
    await CompanyMembership.query().insert({
      user_id: viewer.id,
      company_id: company.id,
      is_default: true,
    });
    const login = async (loginName: string, password: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { login: loginName, password },
        })
      ).json<{ data: { access_token: string } }>().data.access_token;
    adminToken = await login('superadmin', 'views-admin-password');
    userToken = await login('viewer', 'viewer-password');
    const system = await User.query().findOne({ login: 'system' }).throwIfNotFound();
    await User.query().findById(system.id).patch({ password: 'views-system-password' });
    systemToken = await login('system', 'views-system-password');
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('describes fields with types, labels, relations and selections', async () => {
    const response = await get(adminToken, '/api/base.user/fields');
    expect(response.statusCode).toBe(200);
    const fields = response.json<{ fields: FieldMeta[] }>().fields;
    const byName = Object.fromEntries(fields.map((field) => [field.name, field]));

    expect(byName.login).toMatchObject({ type: 'string', label: 'Login', required: true });
    expect(byName.partner_id).toMatchObject({
      type: 'many2one',
      relation: 'base.partner',
      label: 'Contact',
    });
    expect(byName.role.type).toBe('selection');
    expect(byName.role.selection?.map((option) => option.value)).toEqual([
      'system',
      'superadmin',
      'user',
    ]);
    // Has a default, so the client need not send it.
    expect(byName.role.required).toBe(false);
    expect(byName.password).toMatchObject({ type: 'password', writeOnly: true });
    expect(byName.id).toMatchObject({ type: 'integer', readonly: true });
    expect(byName.create_date).toMatchObject({ type: 'datetime', readonly: true });
    expect(response.payload).not.toContain('scrypt$');
  });

  it('serves explicit views resolved to API column names', async () => {
    const response = await get(adminToken, '/api/base.partner/views');
    expect(response.statusCode).toBe(200);
    const body = response.json<ViewsBody>();
    expect(body.title).toBe('Partners');
    expect(body.list.columns).toEqual([
      'name',
      'is_company',
      'parent_id',
      'job_title',
      'email',
      'phone',
      'city',
      'country_id',
    ]);
    expect(body.form.sections.map((section) => section.title)).toEqual([
      'Identity',
      'Contact Details',
      'Address',
      'Classification',
      'Internal Notes',
    ]);
    expect(body.form.sections[0].fields).toEqual([
      'name',
      'is_company',
      'parent_id',
      'job_title',
      'vat',
      'company_id',
    ]);
    expect(body.search.filters.map((filter) => filter.label)).toContain('Companies');
    expect(body.permissions).toEqual({ read: true, create: true, write: true, unlink: true });
  });

  it('never lists write-only fields as columns or search fields', async () => {
    const body = (await get(adminToken, '/api/base.user/views')).json<ViewsBody>();
    expect(body.list.columns).not.toContain('password');
    expect(body.search.fields).not.toContain('password');
    // ...but the form may still offer it for setting a new password.
    expect(body.form.sections.flatMap((section) => section.fields)).toContain('password');
    expect(body.form.sections.flatMap((section) => section.fields)).toContain('language_id');
  });

  it('marks everything readonly and denies actions for read-only roles', async () => {
    const body = (await get(userToken, '/api/base.partner/views')).json<ViewsBody>();
    expect(body.permissions).toEqual({ read: true, create: false, write: false, unlink: false });
    expect(body.fields.every((field) => field.readonly)).toBe(true);
  });

  it('applies the same RBAC as data endpoints', async () => {
    expect((await get(userToken, '/api/base.user/views')).statusCode).toBe(403);
    expect((await get(userToken, '/api/base.user/fields')).statusCode).toBe(403);
    expect((await get(adminToken, '/api/auth.refresh_token/views')).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/base.partner/views' })).statusCode).toBe(
      401
    );
    expect((await get(adminToken, '/api/nope.model/views')).statusCode).toBe(404);
  });

  it('distinguishes system account authority from superadmin authority', async () => {
    const system = await User.query().findOne({ login: 'system' }).throwIfNotFound();
    const viewer = await User.query().findOne({ login: 'viewer' }).throwIfNotFound();

    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/base.user/${system.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { timezone: 'Asia/Jakarta' },
        })
      ).statusCode
    ).toBe(403);
    const rpcRoleChange = await app.inject({
      method: 'POST',
      url: '/jsonrpc',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: ['base.user', 'write', [[viewer.id], { role: 'system' }]],
        },
      },
    });
    expect(rpcRoleChange.statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/base.user/${viewer.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { role: 'system' },
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/base.user/${viewer.id}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { timezone: 'Asia/Jakarta' },
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/base.user/${system.id}`,
          headers: { authorization: `Bearer ${systemToken}` },
          payload: { timezone: 'Asia/Jakarta' },
        })
      ).statusCode
    ).toBe(200);
  });

  it('prevents archiving active partners and referenced base data', async () => {
    const viewer = await User.query()
      .findOne({ login: 'viewer' })
      .withGraphFetched('partner')
      .throwIfNotFound();
    const viewerPartnerId = viewer.partner_id;
    const archivePartner = await app.inject({
      method: 'DELETE',
      url: `/api/base.partner/${viewerPartnerId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(archivePartner.statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/base.partner/${viewerPartnerId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { active: false },
        })
      ).statusCode
    ).toBe(409);

    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const country = await Country.query().findOne({ code: 'US' }).throwIfNotFound();
    const currency = await Currency.query().findOne({ code: 'USD' }).throwIfNotFound();
    const language = await Language.query().findOne({ code: 'en-US' }).throwIfNotFound();
    for (const [model, id] of [
      ['base.company', company.id],
      ['base.country', country.id],
      ['base.currency', currency.id],
      ['base.language', language.id],
    ]) {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/${model}/${id}${model === 'base.company' ? '?hard=true' : ''}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(response.statusCode).toBe(409);
    }
    const rpcDelete = await app.inject({
      method: 'POST',
      url: '/jsonrpc',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: ['base.company', 'unlink', [[company.id]]],
        },
      },
    });
    expect(rpcDelete.statusCode).toBe(409);
  });

  it('hides archived records from normal search and lets admins restore them', async () => {
    const partner = await Partner.query().insert({ name: 'Archive Candidate' });
    const authorization = { authorization: `Bearer ${adminToken}` };
    const archived = await app.inject({
      method: 'DELETE',
      url: `/api/base.partner/${partner.id}`,
      headers: authorization,
    });
    expect(archived.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/base.user',
          headers: authorization,
          payload: { login: 'inactive-partner-user', partner_id: partner.id },
        })
      ).statusCode
    ).toBe(409);
    const domain = encodeURIComponent(JSON.stringify([['id', '=', partner.id]]));
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/base.partner?domain=${domain}`,
          headers: authorization,
        })
      ).json<{ data: unknown[] }>().data
    ).toHaveLength(0);

    const restored = await app.inject({
      method: 'POST',
      url: `/api/base.partner/${partner.id}/action/action_unarchive`,
      headers: authorization,
    });
    expect(restored.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/base.partner?domain=${domain}`,
          headers: authorization,
        })
      ).json<{ data: unknown[] }>().data
    ).toHaveLength(1);
  });

  it('rejects views that reference unknown fields at definition time', () => {
    expect(() => defineView(Partner, { list: { columns: ['nope'] } })).toThrow('Unknown field');
    expect(() => defineView(User, { list: { columns: ['password'] } })).toThrow('Write-only');
    expect(describeFields(Partner).some((field) => field.name === 'company_id')).toBe(true);
  });
});
