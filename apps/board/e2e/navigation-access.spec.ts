import { expect, test } from '@playwright/test';
import { E2E_SUPERADMIN_PASSWORD } from './constants.js';

test('development mode reveals technical navigation without changing API access', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);

  const session = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('mw-board-session') ?? 'null') as {
        access_token: string;
      } | null
  );
  expect(session).not.toBeNull();

  const modelResponse = await page.request.get('/api/models', {
    headers: { authorization: `Bearer ${session!.access_token}` },
  });
  expect(modelResponse.status()).toBe(200);
  const modelPayload = (await modelResponse.json()) as {
    models: Array<{ model: string; menu: { developmentOnly?: boolean } }>;
  };
  const technicalModel = modelPayload.models.find((item) => item.model === 'base.partner_address');
  expect(technicalModel?.menu.developmentOnly).toBe(true);

  await expect(
    page
      .getByRole('navigation', { name: 'Models' })
      .getByRole('link', { name: 'Partners', exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Models' })
      .getByRole('link', { name: 'Partner Addresses' })
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Search records, models, commands…' }).click();
  const palette = page.getByRole('dialog', { name: 'Command Palette' });
  await palette.getByRole('combobox').fill('Partner Addresses');
  await expect(palette.getByRole('option', { name: /partner address/i })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Development Mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Development Mode: On' }).first()).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Models' }).getByRole('link', { name: 'Partner address' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Search records, models, commands…' }).click();
  const developmentPalette = page.getByRole('dialog', { name: 'Command Palette' });
  await developmentPalette.getByRole('combobox').fill('Partner address');
  await expect(developmentPalette.getByRole('option', { name: /partner address/i })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Development Mode: On' }).first()).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Models' }).getByRole('link', { name: 'Partner address' })
  ).toBeVisible();

  const userLogin = `e2e-navigation-${Date.now()}`;
  const userPassword = `navigation-e2e-${Date.now()}`;
  const partnerResponse = await page.request.post('/api/base.partner', {
    headers: { authorization: `Bearer ${session!.access_token}` },
    data: { name: `Navigation E2E ${userLogin}` },
  });
  expect(partnerResponse.status()).toBe(201);
  const partnerPayload = (await partnerResponse.json()) as { data: { id: number } };
  const userResponse = await page.request.post('/api/base.user', {
    headers: { authorization: `Bearer ${session!.access_token}` },
    data: {
      login: userLogin,
      password: userPassword,
      role: 'user',
      partner_id: partnerPayload.data.id,
      active: true,
    },
  });
  expect(userResponse.status()).toBe(201);

  const ordinaryLogin = await page.request.post('/auth/login', {
    data: { login: userLogin, password: userPassword },
  });
  expect(ordinaryLogin.status()).toBe(200);
  const ordinarySession = (await ordinaryLogin.json()) as {
    data: { access_token: string };
  };
  const ordinaryModels = await page.request.get('/api/models', {
    headers: { authorization: `Bearer ${ordinarySession.data.access_token}` },
  });
  expect(ordinaryModels.status()).toBe(200);
  const ordinaryModelPayload = (await ordinaryModels.json()) as {
    models: Array<{ model: string }>;
  };
  expect(ordinaryModelPayload.models.some((item) => item.model === 'base.partner_address')).toBe(
    true
  );
  expect(ordinaryModelPayload.models.some((item) => item.model === 'base.partner')).toBe(true);
  const developmentOnlyMenuModel = technicalModel!.menu.developmentOnly;
  expect(developmentOnlyMenuModel).toBe(true);
  const modelRead = await page.request.get('/api/base.partner_address', {
    headers: { authorization: `Bearer ${ordinarySession.data.access_token}` },
  });
  expect(modelRead.status()).toBe(200);
});
