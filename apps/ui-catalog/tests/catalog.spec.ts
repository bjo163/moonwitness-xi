import { expect, test } from '@playwright/test';

test('static catalog loads under the repository Pages subpath with its shared UI assets', async ({
  page,
}) => {
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
  await page.screenshot({ path: 'test-results/ui-catalog-desktop.png', fullPage: false });
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

test('catalog reflows component examples for a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#actions');
  const columns = await page
    .locator('.catalog-example')
    .first()
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);

  expect(columns.trim().split(/\s+/u)).toHaveLength(1);
  await expect(page.getByRole('navigation', { name: 'Component sections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Primary action' })).toBeVisible();
  await page.screenshot({ path: 'test-results/ui-catalog-mobile.png', fullPage: false });
});
