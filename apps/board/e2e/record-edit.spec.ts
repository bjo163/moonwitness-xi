import { expect, test } from '@playwright/test';
import { createE2eSuffix, E2E_SUPERADMIN_PASSWORD } from './constants.js';

interface BoardSession {
  access_token: string;
}

interface CreatedRecord {
  id: number;
}

test('record forms validate, edit relations, scope state by country, archive, restore, and delete', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = createE2eSuffix();
  const partnerName = `Record E2E ${suffix}`;
  const partnerEmail = `record-${suffix}@example.test`;

  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);

  const session = await page.evaluate(
    () => JSON.parse(localStorage.getItem('mw-board-session') ?? 'null') as BoardSession | null
  );
  expect(session).not.toBeNull();
  const authorization = { authorization: `Bearer ${session!.access_token}` };
  const addressViewsResponse = await page.request.get('/api/base.partner_address/views', {
    headers: authorization,
  });
  expect(addressViewsResponse.status()).toBe(200);
  const addressViews = (await addressViewsResponse.json()) as {
    fields: Array<{ name: string; default?: unknown }>;
  };
  expect(addressViews.fields.find((field) => field.name === 'address_type')?.default).toBe('other');

  await page.goto('/m/base.partner/new');
  await expect(page.getByRole('heading', { name: 'New Partner' })).toBeVisible();
  await page.getByLabel('Name').fill('Temporary value');
  await page.getByLabel('Name').clear();
  await page.getByRole('button', { name: 'Save Record' }).click();
  await expect(page.getByText("Field 'Name' is required.")).toBeVisible();
  const rejectedPartner = await page.request.get('/api/base.partner', {
    headers: authorization,
    params: { domain: JSON.stringify([['name', '=', 'Temporary value']]) },
  });
  expect(rejectedPartner.status()).toBe(200);
  expect(((await rejectedPartner.json()) as { data: CreatedRecord[] }).data).toHaveLength(0);
  await page.getByLabel('Name').fill(partnerName);
  await page.getByLabel('Email', { exact: true }).fill(partnerEmail);
  await page.getByRole('button', { name: 'Save Record' }).click();
  await expect(page).toHaveURL(/\/m\/base\.partner\/\d+$/u);

  const createdPartner = await page.request.get('/api/base.partner', {
    headers: authorization,
    params: { domain: JSON.stringify([['email', '=', partnerEmail]]) },
  });
  expect(createdPartner.status()).toBe(200);
  const partnerList = (await createdPartner.json()) as { data: CreatedRecord[] };
  expect(partnerList.data).toHaveLength(1);
  const partnerId = partnerList.data[0].id;

  const nameField = page.getByLabel('Name');
  await expect(nameField).toHaveValue(partnerName);
  await nameField.fill(`${partnerName} Updated`);
  const saveButton = page.getByRole('button', { name: 'Save Record' });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByText('Record saved successfully!')).toBeVisible();

  const duplicatePartner = await page.request.post('/api/base.partner', {
    headers: authorization,
    data: { name: `Duplicate ${suffix}`, email: partnerEmail },
  });
  expect(duplicatePartner.status()).toBe(409);

  await page.goto('/m/base.partner_address/new');
  await expect(page.getByRole('heading', { name: 'New Partner Address' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Address Type' })).toContainText('Other');

  await page.getByLabel('Partner').click();
  await page.getByPlaceholder('Search partner…').fill(`${partnerName} Updated`);
  await page.getByRole('option', { name: new RegExp(partnerName) }).click();
  await page.getByLabel('Label').fill(`Primary ${suffix}`);
  await page.getByRole('textbox', { name: 'Street *', exact: true }).fill('1 Example Street');
  await page.getByRole('textbox', { name: 'City *', exact: true }).fill('Jakarta');

  await page.getByLabel('Country').click();
  await page.getByPlaceholder('Search country…').fill('Indonesia');
  await page.getByRole('option', { name: /Indonesia/u }).click();
  await page.getByLabel('State / Province').click();
  await page.getByPlaceholder('Search state / province…').fill('DKI Jakarta');
  await page.getByRole('option', { name: /DKI Jakarta/u }).click();

  await page.getByLabel('Country').click();
  await page.getByPlaceholder('Search country…').fill('United States');
  await page.getByRole('option', { name: /United States/u }).click();
  const statePicker = page.getByLabel('State / Province');
  await expect(statePicker).toContainText('Pick a state / province…');
  await statePicker.click();
  await page.getByPlaceholder('Search state / province…').fill('California');
  await expect(page.getByRole('option', { name: /California/u })).toBeVisible();
  await expect(page.getByRole('option', { name: /DKI Jakarta/u })).toHaveCount(0);
  await page.getByRole('option', { name: /California/u }).click();

  await page.getByRole('button', { name: 'Save Record' }).click();
  await expect(page).toHaveURL(/\/m\/base\.partner_address\/\d+$/u);
  const addressId = Number(new URL(page.url()).pathname.split('/').at(-1));
  const savedAddressResponse = await page.request.get(`/api/base.partner_address/${addressId}`, {
    headers: authorization,
    params: { with: 'partner,country,state' },
  });
  expect(savedAddressResponse.status()).toBe(200);
  const savedAddress = (await savedAddressResponse.json()) as {
    data: {
      partner_id: number;
      country_id: number;
      country: { name: string };
      state: { name: string; country_id: number };
    };
  };
  expect(savedAddress.data.partner_id).toBe(partnerId);
  expect(savedAddress.data.country.name).toBe('United States');
  expect(savedAddress.data.state.name).toBe('California');
  expect(savedAddress.data.state.country_id).toBe(savedAddress.data.country_id);

  const viewerPartnerResponse = await page.request.post('/api/base.partner', {
    headers: authorization,
    data: { name: `Record E2E Viewer ${suffix}` },
  });
  expect(viewerPartnerResponse.status()).toBe(201);
  const viewerPartner = (await viewerPartnerResponse.json()) as { data: CreatedRecord };
  const viewerLogin = `record-viewer-${suffix}`;
  const viewerPassword = `record-viewer-password-${suffix}`;
  const viewerResponse = await page.request.post('/api/base.user', {
    headers: authorization,
    data: {
      login: viewerLogin,
      password: viewerPassword,
      role: 'user',
      partner_id: viewerPartner.data.id,
    },
  });
  expect(viewerResponse.status()).toBe(201);
  const viewerLoginResponse = await page.request.post('/auth/login', {
    data: { login: viewerLogin, password: viewerPassword },
  });
  expect(viewerLoginResponse.status()).toBe(200);
  const viewerSession = (await viewerLoginResponse.json()) as {
    data: { access_token: string };
  };
  const deniedDelete = await page.request.delete(`/api/base.partner_address/${addressId}`, {
    headers: { authorization: `Bearer ${viewerSession.data.access_token}` },
  });
  expect(deniedDelete.status()).toBe(403);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page).toHaveURL(/\/m\/base\.partner_address$/u);
  const archivedAddress = await page.request.get(`/api/base.partner_address/${addressId}`, {
    headers: authorization,
  });
  expect(archivedAddress.status()).toBe(200);
  expect(((await archivedAddress.json()) as { data: { active: boolean } }).data.active).toBe(false);

  await page.goto(`/m/base.partner_address/${addressId}`);
  await expect(page.getByRole('button', { name: 'Unarchive' })).toBeVisible();
  await page.getByRole('button', { name: 'Unarchive' }).click();
  await expect(page.getByText('Action executed successfully.')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page).toHaveURL(/\/m\/base\.partner_address$/u);
  expect(
    (
      await page.request.get(`/api/base.partner_address/${addressId}`, {
        headers: authorization,
      })
    ).status()
  ).toBe(404);
});
