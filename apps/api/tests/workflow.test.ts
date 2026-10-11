import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import {
  assignDefaultUserGroup,
  Company,
  CompanyMembership,
  Currency,
  Partner,
  User,
} from '@moonwitness/orm-base';
import { buildApp } from '../src/app.js';

const ADMIN_PASSWORD = 'workflow-admin-password';
const USER_PASSWORD = 'workflow-user-password';
interface LoginResponse {
  data: { access_token: string };
}

describe('workflow API authorization and lifecycle', () => {
  let db: Knex;
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;
  let companyId: number;
  let resourceId = 0;
  let instanceId: number;

  const request = (token: string, method: string, url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
      headers: { authorization: `Bearer ${token}` },
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
      jwtSecret: 'test-workflow-secret-test-workflow-secret',
      loginRateMax: 1000,
    });
    await app.ready();
    const company = await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound();
    companyId = company.id;
    const partner = await Partner.query().insert({
      name: 'Workflow requester',
      company_id: companyId,
    });
    const user = await User.query().insertAndFetch({
      login: 'workflow-user',
      password: USER_PASSWORD,
      partner_id: partner.id,
      role: 'user',
    });
    await assignDefaultUserGroup(user.id);
    await CompanyMembership.query().insert({
      user_id: user.id,
      company_id: companyId,
      is_default: true,
    });
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'superadmin', password: ADMIN_PASSWORD },
    });
    adminToken = adminLogin.json<LoginResponse>().data.access_token;
    const userLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: USER_PASSWORD },
    });
    userToken = userLogin.json<LoginResponse>().data.access_token;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('requires auth, starts/list/details a company scoped workflow, and hides generic mutation routes', async () => {
    expect((await app.inject({ method: 'GET', url: '/workflows/instances' })).statusCode).toBe(401);
    const currency = await Currency.query().findOne({ code: 'USD' }).throwIfNotFound();
    const requestView = await request(userToken, 'GET', '/api/request.purchase/views');
    expect(requestView.statusCode).toBe(200);
    expect(requestView.json().list.columns).toContain('amount_minor');
    const definitions = await request(
      userToken,
      'GET',
      '/workflows/definitions?resource_model=request.purchase'
    );
    expect(definitions.statusCode).toBe(200);
    expect(
      definitions.json().data.map((definition: { code: string }) => definition.code)
    ).toContain('request.purchase_approval');
    expect(definitions.json().data).toContainEqual(
      expect.objectContaining({ code: 'request.purchase_approval', canStart: true })
    );
    const reviewerDefinitions = await request(
      adminToken,
      'GET',
      '/workflows/definitions?resource_model=request.purchase'
    );
    expect(reviewerDefinitions.json().data).toContainEqual(
      expect.objectContaining({ code: 'request.purchase_approval', canStart: false })
    );
    const createdRequest = await request(userToken, 'POST', '/api/request.purchase', {
      title: 'Workflow API example',
      description: 'Demonstrate the request addon using generic model CRUD.',
      amount_minor: 75000,
      currency_id: currency.id,
      company_id: companyId,
    });
    expect(createdRequest.statusCode).toBe(201);
    expect(createdRequest.json().data.create_uid).toBeGreaterThan(0);
    resourceId = createdRequest.json().data.id as number;
    const start = await request(userToken, 'POST', '/workflows/instances', {
      code: 'request.purchase_approval',
      resource_model: 'request.purchase',
      resource_id: resourceId,
      idempotency_key: 'api-workflow-start-0001',
    });
    expect(start.statusCode).toBe(201);
    instanceId = start.json().data.id as number;
    expect(
      (
        await request(userToken, 'POST', '/workflows/instances', {
          code: 'request.purchase_approval',
          resource_model: 'request.purchase',
          resource_id: resourceId,
          idempotency_key: 'api-workflow-start-0001',
        })
      ).statusCode
    ).toBe(201);
    const scopedInstances = await request(
      userToken,
      'GET',
      `/workflows/instances?limit=10&resource_model=request.purchase&resource_id=${resourceId}`
    );
    expect(scopedInstances.json().data).toMatchObject([
      {
        resource_model: 'request.purchase',
        resource_id: resourceId,
        definition_code: 'request.purchase_approval',
      },
    ]);
    expect((await request(userToken, 'GET', '/workflows/instances?limit=10')).statusCode).toBe(400);
    expect(
      (await request(userToken, 'GET', `/workflows/instances/${instanceId}`)).json().data.events
    ).toHaveLength(1);
    expect((await request(userToken, 'GET', '/api/workflow.instance?count=true')).statusCode).toBe(
      403
    );
    expect((await request(userToken, 'GET', `/workflows/instances/${instanceId}`)).statusCode).toBe(
      200
    );
  });

  it('enforces requester/reviewer separation and records the successful approval lifecycle', async () => {
    const submit = await request(userToken, 'POST', `/workflows/instances/${instanceId}/actions`, {
      action: 'submit',
      expected_revision: 0,
      idempotency_key: 'api-workflow-submit-0001',
    });
    expect(submit.statusCode).toBe(200);
    const selfApproval = await request(
      userToken,
      'POST',
      `/workflows/instances/${instanceId}/actions`,
      {
        action: 'approve',
        expected_revision: 1,
        idempotency_key: 'api-workflow-self-approve-0001',
      }
    );
    expect(selfApproval.statusCode).toBe(403);
    const approval = await request(
      adminToken,
      'POST',
      `/workflows/instances/${instanceId}/actions`,
      {
        action: 'approve',
        expected_revision: 1,
        idempotency_key: 'api-workflow-admin-approve-0001',
      }
    );
    expect(approval.statusCode).toBe(200);
    expect(approval.json().data).toMatchObject({
      status: 'completed',
      currentState: 'approved',
      revision: 2,
    });
    expect(
      (await request(userToken, 'GET', `/workflows/instances/${instanceId}`)).json().data.events
    ).toHaveLength(3);
  });

  it('supports rejecting a request through the same generic workflow API', async () => {
    const currency = await Currency.query().findOne({ code: 'USD' }).throwIfNotFound();
    const created = await request(userToken, 'POST', '/api/request.purchase', {
      title: 'Workflow rejection example',
      description: 'Exercise the rejected terminal state.',
      amount_minor: 10000,
      currency_id: currency.id,
      company_id: companyId,
    });
    expect(created.statusCode).toBe(201);
    const requestId = created.json().data.id as number;
    const started = await request(userToken, 'POST', '/workflows/instances', {
      code: 'request.purchase_approval',
      resource_model: 'request.purchase',
      resource_id: requestId,
      idempotency_key: 'api-request-reject-start-01',
    });
    expect(started.statusCode).toBe(201);
    const rejectedId = started.json().data.id as number;
    await request(userToken, 'POST', `/workflows/instances/${rejectedId}/actions`, {
      action: 'submit',
      expected_revision: 0,
      idempotency_key: 'api-request-reject-submit-01',
    });
    const rejected = await request(
      adminToken,
      'POST',
      `/workflows/instances/${rejectedId}/actions`,
      {
        action: 'reject',
        expected_revision: 1,
        idempotency_key: 'api-request-reject-decision-01',
        comment: 'Not approved this cycle.',
      }
    );
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().data).toMatchObject({ currentState: 'rejected', status: 'rejected' });
    expect(
      (await request(userToken, 'GET', `/workflows/instances/${rejectedId}`)).json().data.events
    ).toHaveLength(3);
  });

  it('rejects unexpected fields and prevents idempotency keys from crossing actors', async () => {
    const invalid = await request(userToken, 'POST', '/workflows/instances', {
      code: 'request.purchase_approval',
      resource_model: 'request.purchase',
      resource_id: resourceId,
      idempotency_key: 'api-workflow-start-0002',
      company_id: companyId,
    });
    expect(invalid.statusCode).toBe(400);
    const collision = await request(adminToken, 'POST', '/workflows/instances', {
      code: 'request.purchase_approval',
      resource_model: 'request.purchase',
      resource_id: resourceId,
      idempotency_key: 'api-workflow-start-0001',
    });
    expect(collision.statusCode).toBe(400);
  });

  it('hides workflow list, history, and decisions when the resource is outside the active company', async () => {
    const otherCompany = await Company.query().insertAndFetch({ name: 'Other Workflow Company' });
    const otherPartner = await Partner.query().insert({
      name: 'Other company requester',
      company_id: otherCompany.id,
    });
    const otherUser = await User.query().insertAndFetch({
      login: 'other-company-requester',
      password: USER_PASSWORD,
      partner_id: otherPartner.id,
      role: 'user',
    });
    await assignDefaultUserGroup(otherUser.id);
    await CompanyMembership.query().insert({
      user_id: otherUser.id,
      company_id: otherCompany.id,
      is_default: true,
    });
    const otherLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: otherUser.login, password: USER_PASSWORD },
    });
    const otherToken = otherLogin.json<LoginResponse>().data.access_token;
    const currency = await Currency.query().findOne({ code: 'USD' }).throwIfNotFound();
    const created = await request(otherToken, 'POST', '/api/request.purchase', {
      title: 'Private company workflow',
      description: 'This record belongs to another company.',
      amount_minor: 12000,
      currency_id: currency.id,
      company_id: otherCompany.id,
    });
    expect(created.statusCode).toBe(201);
    const otherResourceId = created.json().data.id as number;
    const started = await request(otherToken, 'POST', '/workflows/instances', {
      code: 'request.purchase_approval',
      resource_model: 'request.purchase',
      resource_id: otherResourceId,
      idempotency_key: 'other-company-flow-start-01',
    });
    expect(started.statusCode).toBe(201);
    const otherInstanceId = started.json().data.id as number;

    expect(
      (
        await request(
          userToken,
          'GET',
          `/workflows/instances?resource_model=request.purchase&resource_id=${otherResourceId}`
        )
      ).statusCode
    ).toBe(404);
    expect(
      (await request(userToken, 'GET', `/workflows/instances/${otherInstanceId}`)).statusCode
    ).toBe(404);
    expect(
      (
        await request(userToken, 'POST', `/workflows/instances/${otherInstanceId}/actions`, {
          action: 'submit',
          expected_revision: 0,
          idempotency_key: 'cross-company-action-01',
        })
      ).statusCode
    ).toBe(404);
    expect(
      (await request(adminToken, 'GET', `/workflows/instances/${otherInstanceId}`)).statusCode
    ).toBe(404);
    expect(
      (await request(otherToken, 'GET', `/workflows/instances/${otherInstanceId}`)).json().data
    ).toMatchObject({ current_state: 'draft', revision: 0 });
  });
});
