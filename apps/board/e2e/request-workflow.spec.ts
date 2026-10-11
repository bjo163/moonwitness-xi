import { expect, test } from '@playwright/test';
import { createE2eSuffix, E2E_SUPERADMIN_PASSWORD } from './constants.js';

interface BoardSession {
  access_token: string;
}

interface AuthProfile {
  data: { id: number; company_id: number };
}

interface CreatedRecord {
  id: number;
  create_uid: number;
}

interface ApiRecord<T> {
  data: T;
}

test('requester submits a seeded approval workflow and superadmin approves it in Board', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = createE2eSuffix();
  const requesterLogin = `request-e2e-${suffix}`;
  const requesterPassword = `request-e2e-password-${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);

  const adminSession = await page.evaluate(
    () => JSON.parse(localStorage.getItem('mw-board-session') ?? 'null') as BoardSession | null
  );
  expect(adminSession).not.toBeNull();
  const adminHeaders = { authorization: `Bearer ${adminSession!.access_token}` };
  const adminProfileResponse = await page.request.get('/auth/me', { headers: adminHeaders });
  expect(adminProfileResponse.status()).toBe(200);
  const adminProfile = (await adminProfileResponse.json()) as AuthProfile;

  const partnerResponse = await page.request.post('/api/base.partner', {
    headers: adminHeaders,
    data: {
      name: `Request E2E ${suffix}`,
      email: `request-${suffix}@example.test`,
      company_id: adminProfile.data.company_id,
    },
  });
  expect(partnerResponse.status()).toBe(201);
  const partner = (await partnerResponse.json()) as ApiRecord<{ id: number }>;
  const requesterResponse = await page.request.post('/api/base.user', {
    headers: adminHeaders,
    data: {
      login: requesterLogin,
      password: requesterPassword,
      role: 'user',
      partner_id: partner.data.id,
      active: true,
    },
  });
  expect(requesterResponse.status()).toBe(201);

  await page.getByRole('button', { name: 'superadmin' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel('Login').fill(requesterLogin);
  await page.getByLabel('Password').fill(requesterPassword);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);

  const requesterSession = await page.evaluate(
    () => JSON.parse(localStorage.getItem('mw-board-session') ?? 'null') as BoardSession | null
  );
  expect(requesterSession).not.toBeNull();
  const requesterHeaders = { authorization: `Bearer ${requesterSession!.access_token}` };
  const requesterProfileResponse = await page.request.get('/auth/me', {
    headers: requesterHeaders,
  });
  expect(requesterProfileResponse.status()).toBe(200);
  const requesterProfile = (await requesterProfileResponse.json()) as AuthProfile;
  expect(requesterProfile.data.company_id).toBe(adminProfile.data.company_id);

  const currencyResponse = await page.request.get('/api/base.currency', {
    headers: requesterHeaders,
    params: { domain: JSON.stringify([['code', '=', 'USD']]) },
  });
  expect(currencyResponse.status()).toBe(200);
  const currencies = (await currencyResponse.json()) as ApiRecord<Array<{ id: number }>>;
  expect(currencies.data).toHaveLength(1);
  const requestTitle = `Workflow Board E2E ${suffix}`;
  const requestResponse = await page.request.post('/api/request.purchase', {
    headers: requesterHeaders,
    data: {
      title: requestTitle,
      description: 'Verify the request approval journey through the Board UI.',
      amount_minor: 87500,
      currency_id: currencies.data[0]!.id,
      company_id: requesterProfile.data.company_id,
    },
  });
  expect(requestResponse.status()).toBe(201);
  const createdRequest = (await requestResponse.json()) as ApiRecord<CreatedRecord>;
  expect(createdRequest.data.create_uid).toBe(requesterProfile.data.id);

  await page.goto(`/m/request.purchase/${createdRequest.data.id}`);
  const workflow = page.getByRole('region', { name: 'Approval workflow' });
  await expect(workflow).toBeVisible();
  await expect(
    workflow.getByRole('button', { name: 'Start Purchase request approval' })
  ).toBeVisible();
  await workflow.getByRole('button', { name: 'Start Purchase request approval' }).click();
  await expect(workflow.getByText(/Current state: draft · Revision 0/u)).toBeVisible();
  await workflow.getByLabel('Review comment').fill('Please review this purchase request.');
  await workflow.getByRole('button', { name: 'submit', exact: true }).click();
  await expect(workflow.getByText(/Current state: submitted · Revision 1/u)).toBeVisible();
  await expect(workflow.getByRole('list', { name: 'Approval history' })).toContainText(
    'Please review this purchase request.'
  );

  await page.getByRole('button', { name: requesterLogin }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).not.toHaveURL(/\/login$/u);
  await page.goto(`/m/request.purchase/${createdRequest.data.id}`);
  const reviewerSession = await page.evaluate(
    () => JSON.parse(localStorage.getItem('mw-board-session') ?? 'null') as BoardSession | null
  );
  expect(reviewerSession).not.toBeNull();
  const reviewerHeaders = { authorization: `Bearer ${reviewerSession!.access_token}` };

  const reviewerWorkflow = page.getByRole('region', { name: 'Approval workflow' });
  await expect(reviewerWorkflow.getByText(/Current state: submitted · Revision 1/u)).toBeVisible();
  await reviewerWorkflow.getByLabel('Review comment').fill('Approved in the Board E2E review.');
  await reviewerWorkflow.getByRole('button', { name: 'approve', exact: true }).click();
  await expect(reviewerWorkflow.getByText('completed', { exact: true })).toBeVisible();
  await expect(reviewerWorkflow.getByText(/Current state: approved · Revision 2/u)).toBeVisible();
  await expect(reviewerWorkflow.getByRole('list', { name: 'Approval history' })).toContainText(
    'Approved in the Board E2E review.'
  );

  const instancesResponse = await page.request.get('/workflows/instances', {
    headers: reviewerHeaders,
    params: {
      limit: '10',
      resource_model: 'request.purchase',
      resource_id: String(createdRequest.data.id),
    },
  });
  expect(instancesResponse.status()).toBe(200);
  const instances = (await instancesResponse.json()) as ApiRecord<
    Array<{ id: number; current_state: string; status: string; revision: number }>
  >;
  expect(instances.data).toContainEqual(
    expect.objectContaining({ current_state: 'approved', status: 'completed', revision: 2 })
  );
  const instance = instances.data.find(({ current_state }) => current_state === 'approved');
  expect(instance).toBeDefined();
  const historyResponse = await page.request.get(`/workflows/instances/${instance!.id}`, {
    headers: reviewerHeaders,
  });
  expect(historyResponse.status()).toBe(200);
  const history = (await historyResponse.json()) as ApiRecord<{
    events: Array<{ action: string; from_state: string; to_state: string; comment: string | null }>;
  }>;
  expect(history.data.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action: 'submit', from_state: 'draft', to_state: 'submitted' }),
      expect.objectContaining({ action: 'approve', from_state: 'submitted', to_state: 'approved' }),
    ])
  );
});
