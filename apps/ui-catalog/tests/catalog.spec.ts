import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('static catalog loads under the repository Pages subpath with its shared UI assets', async ({
  page,
}, testInfo) => {
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  await page.goto('./');

  await expect(
    page.getByRole('heading', { name: 'One system. Every screen.', exact: true })
  ).toBeVisible();
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

test('brand, typography, and homepage proof use canonical assets and correct spelling', async ({
  page,
}, testInfo) => {
  await page.goto('./#brand');
  const logoImages = page.locator('.brand-variant img');
  await expect(logoImages).toHaveCount(3);
  for (const image of await logoImages.all()) {
    await expect(image).toBeVisible();
    expect(
      await image.evaluate(
        (element: HTMLImageElement) => element.complete && element.naturalWidth > 0
      )
    ).toBe(true);
  }

  await expect(page.getByRole('heading', { name: 'Brand system' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Typography' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Materials & effects' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Homepage hero proof' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MOONWITNESS', exact: true })).toBeVisible();

  const heroImage = page.locator('.catalog-hero-proof picture img');
  await expect(heroImage).toBeVisible();
  expect(
    await heroImage.evaluate(
      (element: HTMLImageElement) => element.complete && element.naturalWidth > 0
    )
  ).toBe(true);

  for (const viewport of [
    { name: 'desktop', width: 1672, height: 941 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#editorial-proof');
    await page.locator('.catalog-hero-proof').scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    ).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`editorial-proof-${viewport.name}.png`) });
  }
});

test('dashboard proof uses canonical masthead and labels all fixture content as sample data', async ({
  page,
}, testInfo) => {
  await page.goto('./#board-proof');
  await expect(page.getByRole('heading', { name: 'Board dashboard proof' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SHADOW COMMAND CENTER' })).toBeVisible();
  await expect(page.getByText('Contoh desain', { exact: true })).toBeVisible();
  await expect(
    page.getByText('All values are illustrative and do not represent production data.')
  ).toBeVisible();

  for (const label of ['Partners', 'Active users', 'Companies', 'Planned activities']) {
    await expect(
      page.locator('.catalog-board-metrics').getByText(label, { exact: true })
    ).toBeVisible();
  }

  const masthead = page.locator('.catalog-board-masthead > img');
  await expect(masthead).toBeVisible();
  expect(
    await masthead.evaluate(
      (element: HTMLImageElement) => element.complete && element.naturalWidth > 0
    )
  ).toBe(true);

  for (const viewport of [
    { name: 'desktop', width: 1672, height: 941 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#board-proof');
    await page.locator('.catalog-board-proof').scrollIntoViewIfNeeded();
    await page.locator('.catalog-board-proof').evaluate((element) => {
      window.scrollBy(0, element.getBoundingClientRect().top - 88);
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    ).toBe(false);
    if (viewport.name === 'mobile') {
      await page.locator('.catalog-topbar').evaluate((element: HTMLElement) => {
        element.style.position = 'static';
      });
    }
    await page
      .locator('.catalog-board-proof')
      .screenshot({ path: testInfo.outputPath(`board-proof-${viewport.name}.png`) });
  }
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

test('button links preserve navigation and disabled links cannot activate', async ({
  page,
}, testInfo) => {
  await page.goto('./#actions');
  const enabledLink = page.getByRole('link', { name: 'Enabled link action' });
  await expect(enabledLink).toHaveAttribute('href', '#brand');
  await expect(enabledLink).toHaveAttribute('data-slot', 'button');
  await enabledLink.click();
  await expect(page).toHaveURL(/#brand$/u);
  await page.goto('./#actions');

  const disabledLink = page.getByTestId('disabled-button-link');
  await expect(disabledLink).toHaveAttribute('aria-disabled', 'true');
  await expect(disabledLink).toHaveAttribute('tabindex', '-1');
  await expect(disabledLink).toHaveAttribute('href', '#brand');
  await disabledLink.dispatchEvent('click');
  await expect(page).toHaveURL(/#actions$/u);
  await page.locator('.catalog-button-grid').screenshot({
    path: testInfo.outputPath('button-link-states.png'),
  });
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

test('shared table keeps sort, selection, pagination, and overflow accessible', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#data-display');

  const scrollRegion = page.getByRole('region', {
    name: 'Installed add-ons table horizontal scroll',
  });
  const table = page.getByRole('table', { name: 'Installed add-ons' });
  await expect(scrollRegion).toBeVisible();
  await expect(scrollRegion).toHaveAttribute('tabindex', '0');
  await expect(table.getByRole('row')).toHaveCount(4);
  expect(await scrollRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
  await scrollRegion.focus();
  await expect(scrollRegion).toBeFocused();
  const initialScrollLeft = await scrollRegion.evaluate((element) => element.scrollLeft);
  await page.keyboard.press('ArrowRight');
  const afterArrowRight = await scrollRegion.evaluate((element) => element.scrollLeft);
  expect(afterArrowRight).toBeGreaterThan(initialScrollLeft);
  await page.keyboard.press('End');
  expect(await scrollRegion.evaluate((element) => element.scrollLeft)).toBe(
    await scrollRegion.evaluate((element) => element.scrollWidth - element.clientWidth)
  );
  await page.keyboard.press('Home');
  expect(await scrollRegion.evaluate((element) => element.scrollLeft)).toBe(0);

  const addonHeader = table.getByRole('row').first().getByRole('columnheader').first();
  await addonHeader.getByRole('button', { name: 'Sort by addon' }).focus();
  await page.keyboard.press('Enter');
  await expect(addonHeader).toHaveAttribute('aria-sort', 'ascending');
  await expect(table.getByRole('row').nth(1)).toContainText('Analytics');

  await table.getByRole('checkbox', { name: 'Select all add-ons on this page' }).check();
  for (const name of ['Analytics', 'Base', 'CRM']) {
    await expect(table.getByRole('checkbox', { name: `Select ${name}` })).toBeChecked();
  }

  const pagination = page.getByRole('navigation', { name: 'Pagination' });
  await pagination.getByRole('button', { name: 'Next' }).click();
  await expect(pagination).toContainText('Page 2 of 2');
  await expect(table.getByRole('row').nth(1)).toContainText('Inventory');

  await addonHeader.getByRole('button', { name: 'Sort by addon' }).click();
  await expect(addonHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(pagination).toContainText('Page 1 of 2');
  await expect(table.getByRole('row').nth(1)).toContainText('Timeline');

  await scrollRegion.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await scrollRegion.screenshot({ path: testInfo.outputPath('table-mobile.png') });
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

  const snapshotText = JSON.stringify({ desktop, darkTokens, mobile }, null, 2);
  await expect(snapshotText).toMatchSnapshot('layout-contract.txt');
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
