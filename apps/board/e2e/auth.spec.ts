import { expect, test } from '@playwright/test';
import { E2E_SUPERADMIN_PASSWORD } from './constants.js';

test('login form renders and rejects invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Login')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();

  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill('incorrect-e2e-password');
  await page.getByRole('button', { name: 'Enter the board' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/u);
});

test('superadmin can log in, open dashboard, and log out', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();

  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByText('Welcome, superadmin!', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Background job status distribution' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Background job status distribution' })
  ).toBeAttached();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('img', { name: 'Background job status distribution' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'superadmin' }).click();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('login layout fits a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('shared select works with keyboard and profile feedback is announced', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByText('Welcome, superadmin!', { exact: false })).toBeVisible();

  await page.goto('/settings');
  const language = page.getByRole('combobox').first();
  await language.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(language).toBeFocused();

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile updated')).toBeVisible();
});
