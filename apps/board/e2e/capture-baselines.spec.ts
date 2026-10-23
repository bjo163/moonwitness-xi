import { expect, test } from '@playwright/test';
import { E2E_SUPERADMIN_PASSWORD } from './constants.js';

test('capture CI-rendered visual baselines', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);
  await expect(
    page.getByRole('heading', { name: 'Welcome, superadmin', exact: false })
  ).toBeVisible();

  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: testInfo.outputPath(`${name}-chromium-linux.png`),
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });
  };

  await page.goto('/board/m/base.partner');
  await expect(page.getByRole('heading', { name: 'Partners', exact: false })).toBeVisible();
  await page.getByPlaceholder('Search partners...').fill('Acme Studio');
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'Acme Studio' })
      .getByText('Acme Studio', { exact: true })
      .first()
  ).toBeVisible();
  await capture('board-list-desktop-1440-light');

  await page.goto('/board/profile');
  await expect(page.getByRole('heading', { name: 'Profile', exact: false })).toBeVisible();
  await capture('board-profile-desktop-1440-light');

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/u);
  await page.goto('/board/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: false })).toBeVisible();
  await capture('board-settings-desktop-1440-dark');
});
