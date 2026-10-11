import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('static catalog loads under the repository Pages subpath with its shared UI assets', async ({
  page,
}, testInfo) => {
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'One system. Every screen.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Charts' })).toHaveAttribute('href', '#charts');
  await expect(page.locator('.mw-ui-button').first()).toBeVisible();
  await expect(page.locator('.catalog-footer a')).toHaveAttribute(
    'href',
    'https://github.com/bjo163/moonwitness-xi/tree/dev/packages/ui'
  );
  expect(failedRequests).toEqual([]);
  expect(new URL(page.url()).pathname).toBe('/moonwitness-xi/components/');
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: false });
});

test('theme toggle changes the shared token map without hiding readable labels', async ({
  page,
}) => {
  await page.goto('./');
  const initialBackground = await page
    .locator('html')
    .evaluate((element) => getComputedStyle(element).getPropertyValue('--mw-background').trim());

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/u);
  const darkBackground = await page
    .locator('html')
    .evaluate((element) => getComputedStyle(element).getPropertyValue('--mw-background').trim());

  expect(initialBackground).not.toBe(darkBackground);
  await expect(page.getByText('Success', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/u);
});

test('dialog and tabs support keyboard interaction and restore focus', async ({ page }) => {
  await page.goto('./#overlays');
  const dialogTrigger = page.getByRole('button', { name: 'Open dialog' });
  await dialogTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Confirm workspace change' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(dialogTrigger).toBeFocused();

  const overviewTab = page.getByRole('tab', { name: 'Overview' });
  await overviewTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByRole('tabpanel')).toContainText('Recent events');
});

test('filter input controls sample table and navigation keeps a deep link at the Pages base path', async ({
  page,
}) => {
  await page.goto('./#forms');
  await page.getByRole('textbox', { name: 'Filter records' }).fill('Inventory');
  const sampleTable = page.locator('table.mw-ui-table');
  await expect(sampleTable.getByRole('cell', { name: 'Inventory' })).toBeVisible();
  await expect(sampleTable.getByText('Base')).toHaveCount(0);

  await page.getByRole('link', { name: 'Charts' }).click();
  await expect(page).toHaveURL(/\/moonwitness-xi\/components\/#charts$/u);
  await expect(page.getByRole('heading', { name: 'Charts', exact: true })).toBeVisible();
});

test('catalog reflows component examples for a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#actions');
  const columns = await page
    .locator('.catalog-example')
    .first()
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);

  expect(columns.trim().split(/\s+/u)).toHaveLength(1);
  await expect(page.getByRole('navigation', { name: 'Component sections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Primary action' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: false });
});

test('representative visual layout and token contract stays stable @visual', async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto('./');
  const desktop = await page.evaluate(() => {
    const root = document.documentElement;
    const sidebar = document.querySelector<HTMLElement>('.catalog-sidebar');
    const topbar = document.querySelector<HTMLElement>('.catalog-topbar');
    const firstExample = document.querySelector<HTMLElement>('.catalog-example');
    const primaryButton = document.querySelector<HTMLElement>('.catalog-button-grid .mw-ui-button');
    if (!sidebar || !topbar || !firstExample || !primaryButton) {
      throw new Error('Visual contract elements are missing from the catalog page');
    }
    const roundedWidth = (element: HTMLElement) =>
      Math.round(element.getBoundingClientRect().width);
    return {
      sidebarWidth: roundedWidth(sidebar),
      topbarHeight: Math.round(topbar.getBoundingClientRect().height),
      exampleWidth: roundedWidth(firstExample),
      exampleColumnCount: getComputedStyle(firstExample).gridTemplateColumns.trim().split(/\s+/u)
        .length,
      primaryButtonMinHeight: getComputedStyle(primaryButton).minHeight,
      lightBackground: getComputedStyle(root).getPropertyValue('--mw-background').trim(),
      lightForeground: getComputedStyle(root).getPropertyValue('--mw-foreground').trim(),
    };
  });

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  const darkTokens = await page.locator('html').evaluate((element) => ({
    background: getComputedStyle(element).getPropertyValue('--mw-background').trim(),
    foreground: getComputedStyle(element).getPropertyValue('--mw-foreground').trim(),
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.locator('.catalog-main').evaluate((element) => getComputedStyle(element).marginLeft)
    )
    .toBe('0px');
  const mobile = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>('.catalog-sidebar');
    const main = document.querySelector<HTMLElement>('.catalog-main');
    const example = document.querySelector<HTMLElement>('.catalog-example');
    if (!sidebar || !main || !example) {
      throw new Error('Mobile visual contract elements are missing from the catalog page');
    }
    return {
      sidebarPosition: getComputedStyle(sidebar).position,
      mainMarginLeft: getComputedStyle(main).marginLeft,
      exampleColumnCount: getComputedStyle(example).gridTemplateColumns.trim().split(/\s+/u).length,
    };
  });

  await expect(JSON.stringify({ desktop, darkTokens, mobile }, null, 2)).toMatchSnapshot(
    'layout-contract.txt'
  );
});

test('catalog has no WCAG 2.1 A/AA accessibility violations in light or dark themes', async ({
  page,
}) => {
  await page.goto('./');
  for (const theme of ['light', 'dark'] as const) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Use dark theme' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      })),
      `${theme} theme accessibility violations`
    ).toEqual([]);
  }
});
