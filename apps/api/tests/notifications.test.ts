import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import { Company, CompanyMembership, Partner, User } from '@moonwitness/orm-base';
import { Notification, NotificationTemplate } from '@moonwitness/orm-notification';
import { buildApp } from '../src/app.js';

const ADMIN_PASSWORD = 'notification-admin-password';
const USER_PASSWORD = 'notification-user-password';

interface LoginResponse {
  data: { access_token: string; user: { id: number; login: string } };
}

describe('notification inbox authorization', () => {
  let db: Knex;
  let app: FastifyInstance;
  let userToken: string;
  let adminNotificationId: number;
  let userNotificationId: number;
  let alternateCompanyId: number;
  let alternateCompanyNotificationId: number;

  const authenticated = (
    token: string,
    input: { method: string; url: string; payload?: unknown; companyId?: number }
  ) => {
    const { companyId, ...request } = input;
    return app.inject({
      ...request,
      headers: {
        authorization: `Bearer ${token}`,
        ...(companyId ? { 'x-company-id': String(companyId) } : {}),
      },
    });
  };

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
      jwtSecret: 'test-notification-secret-test-notification-secret',
      loginRateMax: 1000,
    });
    await app.ready();

    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const alternateCompany = await Company.query().insertAndFetch({
      name: 'Notification Alternate',
    });
    alternateCompanyId = alternateCompany.id;
    const partner = await Partner.query().insert({
      name: 'Notification User',
      company_id: company.id,
    });
    const user = await User.query().insertAndFetch({
      login: 'notification-user',
      password: USER_PASSWORD,
      partner_id: partner.id,
      role: 'user',
    });
    await CompanyMembership.query().insert({
      user_id: user.id,
      company_id: company.id,
      is_default: true,
    });
    await CompanyMembership.query().insert({
      user_id: user.id,
      company_id: alternateCompany.id,
      is_default: false,
    });

    const userSession = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: USER_PASSWORD },
    });
    userToken = userSession.json<LoginResponse>().data.access_token;

    const template = await NotificationTemplate.query()
      .findOne({ code: 'example.in_app' })
      .throwIfNotFound();
    const admin = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
    adminNotificationId = (
      await Notification.query().insertAndFetch({
        recipient_id: admin.id,
        company_id: company.id,
        template_id: template.id,
        channel: 'in_app',
        title: 'Private admin notice',
        body: 'This notice belongs to the administrator.',
        delivery_status: 'delivered',
        state: 'unread',
        idempotency_key: 'test:admin:notification',
        delivered_at: new Date().toISOString(),
      })
    ).id;
    userNotificationId = (
      await Notification.query().insertAndFetch({
        recipient_id: user.id,
        company_id: company.id,
        template_id: template.id,
        channel: 'in_app',
        title: 'Private user notice',
        body: 'This notice belongs to the regular user.',
        delivery_status: 'delivered',
        state: 'unread',
        idempotency_key: 'test:user:notification',
        delivered_at: new Date().toISOString(),
      })
    ).id;
    alternateCompanyNotificationId = (
      await Notification.query().insertAndFetch({
        recipient_id: user.id,
        company_id: alternateCompany.id,
        template_id: template.id,
        channel: 'in_app',
        title: 'Alternate company notice',
        body: 'This notice belongs to a different active company.',
        delivery_status: 'delivered',
        state: 'unread',
        idempotency_key: 'test:user:alternate-company-notification',
        delivered_at: new Date().toISOString(),
      })
    ).id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('allows a notification without its optional resource reference', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'superadmin', password: ADMIN_PASSWORD },
    });
    const adminToken = login.json<LoginResponse>().data.access_token;
    const admin = await User.query().findOne({ login: 'superadmin' }).throwIfNotFound();
    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    const template = await NotificationTemplate.query()
      .findOne({ code: 'example.in_app' })
      .throwIfNotFound();
    const response = await authenticated(adminToken, {
      method: 'POST',
      url: '/api/notification.notification',
      payload: {
        recipient_id: admin.id,
        company_id: company.id,
        template_id: template.id,
        channel: 'in_app',
        title: 'Optional resource test',
        body: 'A notification may omit its linked resource.',
        delivery_status: 'delivered',
        state: 'unread',
        idempotency_key: 'test:optional-resource:notification',
        delivered_at: new Date().toISOString(),
      },
    });
    expect(response.statusCode).toBe(201);
  });

  it('returns only the authenticated recipient inbox, even within one company', async () => {
    const response = await authenticated(userToken, { method: 'GET', url: '/notifications/inbox' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ unreadCount: 1 });
    expect(response.json().data.notifications).toHaveLength(1);
    expect(response.json().data.notifications[0]).toMatchObject({
      id: userNotificationId,
      title: 'Private user notice',
    });
    expect(JSON.stringify(response.json())).not.toContain('Private admin notice');

    const genericList = await authenticated(userToken, {
      method: 'GET',
      url: '/api/notification.notification?count=true',
    });
    expect(genericList.statusCode).toBe(200);
    expect(genericList.json().data).toHaveLength(1);
    expect(genericList.json().data[0]).toMatchObject({ id: userNotificationId });
    const otherById = await authenticated(userToken, {
      method: 'GET',
      url: `/api/notification.notification/${adminNotificationId}`,
    });
    expect(otherById.statusCode).toBe(404);
  });

  it('scopes the same recipient inbox to the explicitly selected active company', async () => {
    const defaultCompanyInbox = await authenticated(userToken, {
      method: 'GET',
      url: '/notifications/inbox',
    });
    expect(defaultCompanyInbox.json().data.notifications).toHaveLength(1);
    expect(defaultCompanyInbox.json().data.notifications[0].id).toBe(userNotificationId);

    const alternateCompanyInbox = await authenticated(userToken, {
      method: 'GET',
      url: '/notifications/inbox',
      companyId: alternateCompanyId,
    });
    expect(alternateCompanyInbox.statusCode).toBe(200);
    expect(alternateCompanyInbox.json().data.notifications).toHaveLength(1);
    expect(alternateCompanyInbox.json().data.notifications[0]).toMatchObject({
      id: alternateCompanyNotificationId,
      title: 'Alternate company notice',
    });

    const deniedCompany = await authenticated(userToken, {
      method: 'GET',
      url: '/notifications/inbox',
      companyId: Number.MAX_SAFE_INTEGER,
    });
    expect(deniedCompany.statusCode).toBe(403);
  });

  it('prevents cross-recipient reads and allows only the owner to mark delivered in-app notices read', async () => {
    const forbiddenRead = await authenticated(userToken, {
      method: 'PATCH',
      url: `/notifications/${adminNotificationId}/read`,
    });
    expect(forbiddenRead.statusCode).toBe(404);

    const ownRead = await authenticated(userToken, {
      method: 'PATCH',
      url: `/notifications/${userNotificationId}/read`,
    });
    expect(ownRead.statusCode).toBe(200);
    expect(ownRead.json().data).toMatchObject({ id: userNotificationId, state: 'read' });
    await expect(Notification.query().findById(userNotificationId)).resolves.toMatchObject({
      state: 'read',
    });
  });

  it('validates and scopes notification preference updates to the current user and company', async () => {
    const invalid = await authenticated(userToken, {
      method: 'PUT',
      url: '/notifications/preferences/in_app',
      payload: { enabled: false, user_id: 1 },
    });
    expect(invalid.statusCode).toBe(400);

    const update = await authenticated(userToken, {
      method: 'PUT',
      url: '/notifications/preferences/in_app',
      payload: { enabled: false },
    });
    expect(update.statusCode).toBe(200);
    const ownSettings = await authenticated(userToken, {
      method: 'GET',
      url: '/notifications/preferences',
    });
    expect(ownSettings.json().data).toContainEqual({ channel: 'in_app', enabled: false });
    expect(ownSettings.json().data).not.toContainEqual({ channel: 'email', enabled: false });
  });
});
