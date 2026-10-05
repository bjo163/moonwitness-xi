import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import { Company, CompanyMembership, Partner, User } from '@moonwitness/orm-base';
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
  let resourceId: number;
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
    resourceId = partner.id;
    const user = await User.query().insertAndFetch({
      login: 'workflow-user',
      password: USER_PASSWORD,
      partner_id: partner.id,
      role: 'user',
    });
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
    const start = await request(userToken, 'POST', '/workflows/instances', {
      code: 'sample.request_approval',
      resource_model: 'base.partner',
      resource_id: resourceId,
      idempotency_key: 'api-workflow-start-0001',
    });
    expect(start.statusCode).toBe(201);
    instanceId = start.json().data.id as number;
    expect(
      (
        await request(userToken, 'POST', '/workflows/instances', {
          code: 'sample.request_approval',
          resource_model: 'base.partner',
          resource_id: resourceId,
          idempotency_key: 'api-workflow-start-0001',
        })
      ).statusCode
    ).toBe(201);
    expect(
      (await request(userToken, 'GET', '/workflows/instances?limit=10')).json().data
    ).toHaveLength(1);
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

  it('rejects unexpected fields and prevents idempotency keys from crossing actors', async () => {
    const invalid = await request(userToken, 'POST', '/workflows/instances', {
      code: 'sample.request_approval',
      resource_model: 'base.partner',
      resource_id: resourceId,
      idempotency_key: 'api-workflow-start-0002',
      company_id: companyId,
    });
    expect(invalid.statusCode).toBe(400);
    const collision = await request(adminToken, 'POST', '/workflows/instances', {
      code: 'sample.request_approval',
      resource_model: 'base.partner',
      resource_id: resourceId,
      idempotency_key: 'api-workflow-start-0001',
    });
    expect(collision.statusCode).toBe(400);
  });
});
