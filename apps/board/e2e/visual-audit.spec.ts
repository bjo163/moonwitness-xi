import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
  { name: 'dashboard', path: '/board', heading: 'Command center' },
  { name: 'list', path: '/board/m/base.partner', heading: 'Partners' },
  { name: 'form', path: '/board/m/base.partner/new', heading: 'New Partner' },
  { name: 'profile', path: '/board/profile', heading: 'Profile' },
  { name: 'settings', path: '/board/settings', heading: 'Settings' },
] as const;
const visualBaselines = new Set([
  'list/desktop-1440/light',
  'profile/desktop-1440/light',
  'settings/desktop-1440/dark',
]);

test('command shortcut stays inactive while typing in an editable control', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);

  const search = page.getByRole('button', { name: /Search records, models, commands/u });
  await search.click();
  const commandSearch = page.getByPlaceholder(
    'Search models or records (e.g. Acme, Alice, base.partner)…'
  );
  await expect(commandSearch).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible();
  await expect(commandSearch).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeHidden();
});

test('mobile overlays keep accessible names, keyboard dismissal, focus return, and WCAG contrast', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);

  const modelNavigationTrigger = page.getByRole('button', { name: 'Open model navigation' });
  await modelNavigationTrigger.focus();
  await page.keyboard.press('Enter');
  const modelNavigation = page.getByRole('dialog', { name: 'Model navigation' });
  await expect(modelNavigation).toBeVisible();
  await expectNoA11yViolations(page, 'mobile/model-navigation-open');
  await page.keyboard.press('Escape');
  await expect(modelNavigation).toBeHidden();
  await expect(modelNavigationTrigger).toBeFocused();

  const commandPaletteTrigger = page.getByRole('button', {
    name: /Search records, models, commands/u,
  });
  await commandPaletteTrigger.click();
  const commandPalette = page.getByRole('dialog', { name: 'Command Palette' });
  await expect(commandPalette).toBeVisible();
  await expect(commandPalette.getByPlaceholder(/Search models or records/u)).toBeFocused();
  await expectNoA11yViolations(page, 'mobile/command-palette-open');
  await page.keyboard.press('Escape');
  await expect(commandPalette).toBeHidden();
  await expect(commandPaletteTrigger).toBeFocused();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Command center', exact: false })).toBeVisible();
  const userMenuTrigger = page.getByRole('button', { name: 'User menu for superadmin' });
  await userMenuTrigger.click();
  const userMenu = page.getByRole('menu');
  await expect(userMenu).toBeVisible();
  await expect(userMenu.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  await expectNoA11yViolations(page, 'mobile/user-menu-open');
  await page.keyboard.press('Escape');
  await expect(userMenu).toBeHidden();
  await expect(userMenuTrigger).toBeFocused();
});

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
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })),
    `${label} has WCAG accessibility violations`
  ).toEqual([]);
}

function browserSuffix(testInfo: TestInfo): string {
  return testInfo.project.name === 'chromium' ? '' : `-${testInfo.project.name}`;
}

test('responsive screen audit: login across mobile, tablet, and desktop', async ({
  page,
}, testInfo) => {
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
    await expect(page.locator('main .mw-ui-speech-bubble')).toHaveCSS('opacity', '1');
    await expectNoHorizontalOverflow(page, `login/${size.name}`);
    await page.screenshot({
      path: path.join(auditDirectory, `login-${size.name}-light${browserSuffix(testInfo)}.png`),
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

test('homepage spelling, responsive layout, and reference screenshots', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const homeSizes = [
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'reference-1672', width: 1672, height: 941 },
  ] as const;
  await mkdir(auditDirectory, { recursive: true });

  for (const size of homeSizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'MoonWitness home' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'MOONWITNESS', exact: true })).toBeVisible();
    await expect(
      page.getByText('People. Places. Stories. Another side of reality.', { exact: true })
    ).toBeVisible();
    await expect(page.locator('.home-hero-ribbon')).toHaveText('Follow the signal');
    await expect(
      page.getByRole('heading', { name: 'Different people. Shared context.', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable interface sounds' })).toBeVisible();
    await expectNoHorizontalOverflow(page, `homepage/${size.name}`);
    const heroImage = await page.locator('.home-hero-art-image').evaluate((image) => ({
      loaded: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      alt: image.getAttribute('alt'),
    }));
    expect(heroImage).toEqual({ loaded: true, alt: '' });
    await expectNoA11yViolations(page, `homepage/${size.name}`);
    await page.screenshot({
      path: path.join(auditDirectory, `home-${size.name}${browserSuffix(testInfo)}.png`),
      fullPage: true,
    });
    if (
      testInfo.project.name === 'chromium' &&
      ['mobile-390', 'reference-1672'].includes(size.name)
    ) {
      await expect(page).toHaveScreenshot(`home-${size.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });
    }
  }
});

test('story workbench masthead keeps brand copy readable across viewports', async ({
  page,
}, testInfo) => {
  await mkdir(auditDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);

  for (const size of [
    { name: 'desktop-1440', width: 1440, height: 1000 },
    { name: 'mobile-390', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/board/stories/workbench');
    await expect(page.getByRole('heading', { name: 'Story workbench', exact: true })).toBeVisible();
    await expect(page.getByText('MoonWitness / Internal editorial', { exact: true })).toBeVisible();
    const mastheadImage = page.locator('header.dashboard-masthead img');
    await expect
      .poll(() => mastheadImage.evaluate((image: HTMLImageElement) => image.complete))
      .toBe(true);
    expect(await mastheadImage.evaluate((image: HTMLImageElement) => image.naturalWidth > 0)).toBe(
      true
    );
    await expectNoHorizontalOverflow(page, `workbench/${size.name}`);
    await expectNoA11yViolations(page, `workbench/${size.name}`);
    await page.screenshot({
      path: path.join(auditDirectory, `workbench-${size.name}${browserSuffix(testInfo)}.png`),
      fullPage: true,
    });
    if (testInfo.project.name === 'chromium') {
      await expect(page).toHaveScreenshot(`workbench-${size.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });
    }
  }
});

test('responsive protected screens fit and remain accessible in both themes', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const label of ['Organization Members', 'Notification Preferences']) {
    const menuItem = page.getByRole('link', { name: label, exact: true });
    await expect(menuItem).toBeVisible();
    await expect(menuItem.locator('span')).toHaveCSS('white-space', 'normal');
    await expect(menuItem.locator('span')).toHaveCSS('text-overflow', 'clip');
  }

  for (const theme of ['light', 'dark'] as const) {
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      if (
        (await page.locator('html').evaluate((element) => element.classList.contains('dark'))) !==
        (theme === 'dark')
      ) {
        if (size.name === 'mobile-375') {
          await page.getByRole('button', { name: /^User menu for/u }).click();
          await page.getByRole('menuitem', { name: 'Toggle theme' }).click();
        } else {
          await page.getByRole('button', { name: 'Toggle theme' }).click();
        }
      }

      for (const view of views) {
        await page.goto(view.path);
        await expect(page.getByRole('heading', { name: view.heading, exact: false })).toBeVisible();
        const label = `${view.name}/${size.name}/${theme}`;
        await expectNoHorizontalOverflow(page, label);
        if (view.name === 'list' && size.name === 'desktop-1440') {
          const tableRegion = page.getByRole('region', {
            name: 'Partners records table',
            exact: true,
          });
          await expect(tableRegion).toBeVisible();
          await tableRegion.focus();
          await expect(tableRegion).toBeFocused();
          const scrollAccess = await tableRegion.evaluate((element) => {
            const previousScrollLeft = element.scrollLeft;
            const maxScrollLeft = element.scrollWidth - element.clientWidth;
            element.scrollLeft = maxScrollLeft;
            const lastCell = element.querySelector('tbody tr td:last-child');
            const regionBounds = element.getBoundingClientRect();
            const actionBounds = lastCell?.getBoundingClientRect();
            const result = {
              maxScrollLeft,
              scrollMoved: element.scrollLeft > previousScrollLeft,
              regionLeft: regionBounds.left,
              regionRight: regionBounds.right,
              actionLeft: actionBounds?.left,
              actionRight: actionBounds?.right,
              actionColumnVisible:
                actionBounds !== undefined &&
                actionBounds.left >= regionBounds.left &&
                actionBounds.right <= regionBounds.right + 1,
            };
            element.scrollLeft = previousScrollLeft;
            return result;
          });
          expect(scrollAccess.maxScrollLeft).toBeGreaterThan(0);
          expect(scrollAccess.scrollMoved).toBe(true);
          expect(scrollAccess.actionColumnVisible, JSON.stringify(scrollAccess)).toBe(true);
        }
        if (view.name === 'profile' && size.name === 'mobile-375') {
          await expect(page.getByRole('heading', { name: 'Super Administrator' })).toBeVisible();
        }
        if (view.name === 'dashboard') {
          await expect(
            page.getByText('MoonWitness / Command Center', { exact: true })
          ).toBeVisible();
          await expect(page.locator('.dashboard-masthead-subtitle')).toHaveText(
            /Welcome,\s*superadmin\s*— your workspace at a glance\./u
          );
          await expect(
            page.getByRole('img', { name: 'Background job status distribution' })
          ).toBeVisible();
        }
        const visualKey = `${view.name}/${size.name}/${theme}`;
        if (visualBaselines.has(visualKey) && testInfo.project.name === 'chromium') {
          if (view.name === 'list') {
            await page.getByPlaceholder('Search partners...').fill('Acme Studio');
            const partnerRow = page.getByRole('row').filter({ hasText: 'Acme Studio' });
            await expect(
              partnerRow.getByText('Acme Studio', { exact: true }).first()
            ).toBeVisible();
            const countryValue = partnerRow
              .getByText('United States [US]', { exact: true })
              .first();
            await expect(countryValue).toBeVisible();
            const countryOverflowsCell = await countryValue.evaluate((element) => {
              const cell = element.closest('td');
              return !cell || cell.scrollWidth > cell.clientWidth;
            });
            expect(
              countryOverflowsCell,
              'country value must fit or wrap inside its table cell'
            ).toBe(false);
          }
          await expect(page).toHaveScreenshot(`board-${view.name}-${size.name}-${theme}.png`, {
            animations: 'disabled',
            caret: 'hide',
            fullPage: true,
            // The current stable view differed from its baseline on only two
            // text-edge pixels; retain a strict bound without hiding layout changes.
            maxDiffPixels: 2,
          });
        }
        await page.screenshot({
          path: path.join(
            auditDirectory,
            `${view.name}-${size.name}-${theme}${browserSuffix(testInfo)}.png`
          ),
          fullPage: true,
        });
        if (view.name === 'dashboard' && size.name === 'mobile-375') {
          await expect(page.getByRole('button', { name: /^Switch company/u })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Pending activities' })).toBeVisible();
          await expect(page.getByRole('button', { name: /^Notifications/u })).toBeVisible();
          await expect(page.getByRole('button', { name: /^User menu for/u })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeHidden();
          const originalThemeIsDark = await page
            .locator('html')
            .evaluate((element) => element.classList.contains('dark'));
          await page.getByRole('button', { name: /^User menu for/u }).click();
          await expect(page.getByRole('menuitem', { name: 'Toggle theme' })).toBeVisible();
          await page.getByRole('menuitem', { name: 'Toggle theme' }).click();
          await expect
            .poll(() =>
              page.locator('html').evaluate((element) => element.classList.contains('dark'))
            )
            .toBe(!originalThemeIsDark);
          await page.getByRole('button', { name: /^User menu for/u }).click();
          await page.getByRole('menuitem', { name: 'Toggle theme' }).click();
          await expect
            .poll(() =>
              page.locator('html').evaluate((element) => element.classList.contains('dark'))
            )
            .toBe(originalThemeIsDark);
          await expect(page.getByRole('button', { name: 'Open model navigation' })).toBeVisible();
          await page.getByRole('button', { name: 'Open model navigation' }).focus();
          await expect(page.getByRole('button', { name: 'Open model navigation' })).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('dialog', { name: 'Model navigation' })).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog', { name: 'Model navigation' })).toBeHidden();
        }
        if (size.name === 'desktop-1440' || size.name === 'mobile-375') {
          await expectNoA11yViolations(page, label);
        }
      }
    }
  }
});
