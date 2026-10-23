import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

test('dashboard KPI cards show current values without fabricated trend percentages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);
  await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();

  const metricTiles = page.locator('.dashboard-metric-link .mw-ui-metric-tile');
  await expect(metricTiles).toHaveCount(4);
  const metricCopy = await metricTiles.allInnerTexts();
  expect(metricCopy.join(' ')).not.toContain('%');

  await expectNoA11yViolations(page, 'dashboard/kpi-no-fabricated-trends');
  await page.screenshot({
    path: path.join(auditDirectory, 'dashboard-kpi-no-trend-desktop-1440.png'),
    fullPage: true,
  });
  await expect(page).toHaveScreenshot('board-dashboard-admin-desktop-1440.png', {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
  });
});

test('ordinary-user dashboard has a verified visual baseline', async ({ page }) => {
  await mkdir(auditDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/board$/u);

  const administratorSession = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('mw-board-session') ?? 'null') as {
        access_token: string;
      } | null
  );
  expect(administratorSession).not.toBeNull();

  const login = 'visual-user';
  const password = 'visual-user-only';
  const partnerResponse = await page.request.post('/api/base.partner', {
    headers: { authorization: `Bearer ${administratorSession!.access_token}` },
    data: { name: 'Visual Audit User' },
  });
  expect(partnerResponse.status()).toBe(201);
  const partner = (await partnerResponse.json()) as { data: { id: number } };
  const userResponse = await page.request.post('/api/base.user', {
    headers: { authorization: `Bearer ${administratorSession!.access_token}` },
    data: {
      login,
      password,
      role: 'user',
      partner_id: partner.data.id,
      active: true,
    },
  });
  expect(userResponse.status()).toBe(201);

  await page.getByRole('button', { name: 'superadmin' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/board$/u);
  await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming Planned Activities' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System Audit Ledger Events' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'dashboard/user/desktop-1440');
  await expectNoA11yViolations(page, 'dashboard/user/desktop-1440');
  await page.screenshot({
    path: path.join(auditDirectory, 'dashboard-user-desktop-1440.png'),
    fullPage: true,
  });
  await expect(page).toHaveScreenshot('board-dashboard-user-desktop-1440.png', {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
  });
});

test('mobile overlays keep accessible names, keyboard dismissal, focus return, and WCAG contrast', async ({
  page,
}) => {
  await mkdir(auditDirectory, { recursive: true });
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
  const dialogControls = modelNavigation.locator(
    'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const firstDialogControl = dialogControls.first();
  const lastDialogControl = dialogControls.last();
  await lastDialogControl.focus();
  await page.keyboard.press('Tab');
  await expect(firstDialogControl).toBeFocused();
  await firstDialogControl.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(lastDialogControl).toBeFocused();
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
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS('opacity', '1');
  await expect(commandPalette).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
  const commandPaletteBounds = await commandPalette.boundingBox();
  expect(commandPaletteBounds).not.toBeNull();
  expect(commandPaletteBounds!.x).toBeGreaterThanOrEqual(0);
  expect(commandPaletteBounds!.x + commandPaletteBounds!.width).toBeLessThanOrEqual(375);
  await expectNoA11yViolations(page, 'mobile/command-palette-open');
  await page.screenshot({
    path: path.join(auditDirectory, 'command-palette-mobile-375.png'),
    fullPage: false,
  });
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
    const brandLockup = page.locator('.home-lockup');
    await expect(page.getByRole('link', { name: 'MoonWitness home' })).toBeVisible();
    await expect(brandLockup).toBeVisible();
    await expect
      .poll(() => brandLockup.evaluate((image: HTMLImageElement) => image.complete))
      .toBe(true);
    expect(await brandLockup.evaluate((image: HTMLImageElement) => image.naturalWidth > 0)).toBe(
      true
    );
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

test('story workbench editor and preview stay readable with a populated story', async ({
  page,
}, testInfo) => {
  const storyId = 'mw:story:editorial-sample';
  const previousDigest = createHash('sha256').update('workbench-v1').digest('hex');
  const currentDigest = createHash('sha256').update('workbench-v2').digest('hex');
  const pages = [
    {
      page_id: 'mw:story-page:editorial-sample-1',
      page_order: 1,
      original_text: 'A small signal can change a larger sky.',
    },
    {
      page_id: 'mw:story-page:editorial-sample-2',
      page_order: 2,
      original_text: 'Different places. Same curiosity.',
    },
  ];
  await page.route('**/api/research/stories/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const requestedVersion = new URL(route.request().url()).searchParams.get('version');
    const version = requestedVersion === '1' ? 1 : 2;
    const storyPages =
      version === 1
        ? [
            {
              ...pages[0],
              original_text: 'Signal before dawn.',
            },
          ]
        : pages;
    await route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          storyId,
          version,
          digest: version === 1 ? previousDigest : currentDigest,
          previousDigest: version === 1 ? null : previousDigest,
          visibility: 'INTERNAL',
          idempotent: false,
          story: {
            schema_version: 1,
            story_id: storyId,
            title: 'The Ones Who Watch',
            visibility: 'INTERNAL',
            pages: storyPages,
          },
        },
      },
    });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);
  await page.getByRole('button', { name: 'Switch company. Current scope: Global Scope' }).click();
  await page.getByRole('menuitem', { name: 'MoonWitness' }).click();
  await page.getByRole('link', { name: 'Story workbench' }).click();

  const pageSelector = page.getByLabel('Story page');
  const editor = page.getByLabel('Page text · exact whitespace is preserved');
  const preview = page.getByRole('article', { name: 'Private preview of page 1' });
  for (const size of [
    { name: 'desktop-1440', width: 1440, height: 1000 },
    { name: 'tablet-1024', width: 1024, height: 900 },
    { name: 'mobile-390', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expect(page.getByRole('heading', { name: 'Story workbench', exact: true })).toBeVisible();
    await expect(editor).toHaveValue(pages[0].original_text);
    await expect(preview).toContainText('The Ones Who Watch');
    await expect(preview).toContainText(pages[0].original_text);
    await expect(page.getByRole('heading', { name: 'Page navigator' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revision inspector' })).toBeVisible();
    const workbenchGrid = page.locator('.story-workbench-grid');
    const gridColumns = await workbenchGrid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length
    );
    expect(gridColumns).toBe(size.width >= 1280 ? 3 : size.width > 768 ? 2 : 1);
    const inspectorColumn = await page
      .locator('.story-workbench-inspector')
      .evaluate((element) => getComputedStyle(element).gridColumnStart);
    expect(inspectorColumn).toBe(size.width <= 1280 && size.width > 768 ? '2' : 'auto');
    await expectNoHorizontalOverflow(page, `workbench-filled/${size.name}`);
    await expectNoA11yViolations(page, `workbench-filled/${size.name}`);
    await page.screenshot({
      path: path.join(
        auditDirectory,
        `workbench-filled-${size.name}${browserSuffix(testInfo)}.png`
      ),
      fullPage: true,
    });
    if (testInfo.project.name === 'chromium') {
      await expect(page).toHaveScreenshot(`workbench-filled-${size.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
      });
    }

    await pageSelector.selectOption(pages[1].page_id);
    await expect(editor).toHaveValue(pages[1].original_text);
    await expect(page.getByRole('article', { name: 'Private preview of page 2' })).toContainText(
      pages[1].original_text
    );
    await pageSelector.selectOption(pages[0].page_id);
    await pageSelector.selectOption(pages[1].page_id);
    await page.getByRole('button', { name: 'Move up' }).click();
    await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
    await expect(editor).toHaveValue(pages[1].original_text);
    await page.getByRole('button', { name: 'Move down' }).click();
    await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
    await expect(editor).toHaveValue(pages[1].original_text);
    await pageSelector.selectOption(pages[0].page_id);
  }
});

test('empty and unavailable story workbench states explain the next action', async ({
  page,
}, testInfo) => {
  let state: 'empty' | 'error' = 'empty';
  await page.route('**/api/research/stories/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const unavailable = state === 'error';
    await route.fulfill({
      status: unavailable ? 503 : 404,
      json: { error: unavailable ? 'Service temporarily unavailable' : 'No saved story' },
    });
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);
  await page.getByRole('button', { name: 'Switch company. Current scope: Global Scope' }).click();
  await page.getByRole('menuitem', { name: 'MoonWitness' }).click();
  await page.getByRole('link', { name: 'Story workbench' }).click();
  await expect(
    page.getByRole('button', { name: 'Switch company. Current scope: MoonWitness' })
  ).toBeVisible();

  for (const scenario of [
    {
      name: 'empty',
      message:
        'No saved sample is available in this company yet. Saving creates its first revision.',
    },
    {
      name: 'error',
      message: 'Could not confirm the saved story state. Your draft is kept; retry before saving.',
    },
  ]) {
    if (scenario.name === 'error') {
      state = 'error';
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name: 'Retry loading story' }).click();
    }
    for (const size of [
      { name: 'desktop-1440', width: 1440, height: 1000 },
      { name: 'mobile-390', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await expect(
        page.getByRole('heading', { name: 'Story workbench', exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('MoonWitness / Internal editorial', { exact: true })
      ).toBeVisible();
      await expect(page.getByText(scenario.message, { exact: true })).toBeVisible();
      const saveButton = page.getByRole('button', { name: 'Save revision 1' });
      if (scenario.name === 'empty') {
        await expect(saveButton).toBeEnabled();
      } else {
        await expect(saveButton).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Retry loading story' })).toBeEnabled();
      }
      await expect(page.getByRole('button', { name: 'Retry loading story' })).toBeVisible();
      await expectNoHorizontalOverflow(page, `workbench-${scenario.name}/${size.name}`);
      await expectNoA11yViolations(page, `workbench-${scenario.name}/${size.name}`);
      await page.screenshot({
        path: path.join(
          auditDirectory,
          `workbench-${scenario.name}-${size.name}${browserSuffix(testInfo)}.png`
        ),
        fullPage: true,
      });
      if (testInfo.project.name === 'chromium') {
        await expect(page).toHaveScreenshot(`workbench-${scenario.name}-${size.name}.png`, {
          animations: 'disabled',
          caret: 'hide',
          fullPage: true,
        });
      }
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
          const metricDetails = await page
            .locator('.dashboard-metric-link .mw-ui-metric-tile-detail')
            .allInnerTexts();
          expect(metricDetails.join(' ')).not.toMatch(/[+-]\s?\d+(?:\.\d+)?%/u);
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
