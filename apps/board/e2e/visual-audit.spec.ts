import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { E2E_SUPERADMIN_PASSWORD } from './constants.js';

const root = path.resolve(import.meta.dirname, '../../..');
const auditDirectory = path.join(root, 'test-results/visual-audit');
const sizes = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
] as const;
const views = [
  { name: 'dashboard', path: '/', heading: 'Welcome, superadmin!' },
  { name: 'list', path: '/m/base.partner', heading: 'Partners' },
  { name: 'form', path: '/m/base.partner/new', heading: 'New Partner' },
  { name: 'profile', path: '/profile', heading: 'Profile' },
  { name: 'settings', path: '/settings', heading: 'Settings' },
] as const;

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `${label} has unintended horizontal overflow (${dimensions.scrollWidth}px > ${dimensions.clientWidth}px)`
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      nodes: nodes.map((node) => node.target),
    })),
    `${label} has WCAG accessibility violations`
  ).toEqual([]);
}

test('responsive screen audit: login across mobile, tablet, and desktop', async ({ page }) => {
  await mkdir(auditDirectory, { recursive: true });
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    // Wait for Motion entrance effects so axe does not audit text mid-fade in slower engines.
    await expect(page.getByRole('heading', { name: 'Sign in' }).locator('..')).toHaveCSS(
      'opacity',
      '1'
    );
    await expect(page.locator('main .inline-block')).toHaveCSS('opacity', '1');
    await expectNoHorizontalOverflow(page, `login/${size.name}`);
    await page.screenshot({
      path: path.join(auditDirectory, `login-${size.name}-light.png`),
      fullPage: true,
    });
    await expectNoA11yViolations(page, `login/${size.name}`);
    if (size.name === 'mobile-375') {
      await page.getByLabel('Login').focus();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Password')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Enter the board' })).toBeFocused();
    }
  }
});

test('responsive protected screens fit and remain accessible in both themes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);

  for (const theme of ['light', 'dark'] as const) {
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      if (
        (await page.locator('html').evaluate((element) => element.classList.contains('dark'))) !==
        (theme === 'dark')
      ) {
        await page.getByRole('button', { name: 'Toggle theme' }).click();
      }

      for (const view of views) {
        await page.goto(view.path);
        await expect(page.getByRole('heading', { name: view.heading, exact: false })).toBeVisible();
        const label = `${view.name}/${size.name}/${theme}`;
        await expectNoHorizontalOverflow(page, label);
        if (view.name === 'profile' && size.name === 'mobile-375') {
          await expect(page.getByRole('heading', { name: 'Super Administrator' })).toBeVisible();
        }
        await page.screenshot({
          path: path.join(auditDirectory, `${view.name}-${size.name}-${theme}.png`),
          fullPage: true,
        });
        if (view.name === 'dashboard' && size.name === 'mobile-375') {
          await expect(page.getByRole('button', { name: 'Open model navigation' })).toBeVisible();
          await page.getByRole('button', { name: 'Open model navigation' }).focus();
          await expect(page.getByRole('button', { name: 'Open model navigation' })).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('dialog', { name: 'Model navigation' })).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog', { name: 'Model navigation' })).toBeHidden();
        }
        if (size.name === 'desktop-1440') await expectNoA11yViolations(page, label);
      }
    }
  }
});
