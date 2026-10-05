import { expect, test } from '@playwright/test';

const repositoryBase = process.env.MW_DOCS_BASE_PATH ?? '/moonwitness-xi/';
const portalPath = (route: string) => `${repositoryBase}${route.replace(/^\//u, '')}`;

test('lands in the guide and renders responsive navigation and document content', async ({
  page,
}) => {
  await page.goto('');
  await expect(page).toHaveURL(new RegExp(`${portalPath('guide/tutorials/quickstart')}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Quickstart lingkungan lokal' })).toBeVisible();
  await expect(page.getByLabel('Versi dokumentasi')).toContainText(/(?:Preview|Stable|Next)/u);
  await expect(page.getByLabel('Versi dokumentasi')).toContainText('1.0.0-rc.1');
  await expect(page.getByRole('navigation', { name: 'Mulai' })).toContainText('Arsitektur');

  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = page.getByRole('complementary', { name: 'Navigasi dokumentasi' });
  await expect(navigation).not.toHaveClass(/sidebar-open/u);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(navigation).toHaveClass(/sidebar-open/u);
  await page.getByRole('link', { name: /Membuat addon/u }).click();
  await expect(page.getByRole('heading', { name: 'Membuat addon' })).toBeVisible();
  await expect(navigation).not.toHaveClass(/sidebar-open/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('search is keyboard reachable and routes to matching guide pages', async ({ page }) => {
  await page.goto('');
  const search = page.getByRole('searchbox', { name: 'Cari dokumentasi' });
  await expect(search).toBeVisible();
  await page.keyboard.press('Slash');
  await expect(search).toBeFocused();
  await search.fill('addon');
  const result = page.getByRole('option', { name: /Membuat addon/u });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(new RegExp(`${portalPath('guide/how-to/addon-development')}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Membuat addon' })).toBeVisible();
});

test('nested page reload and branded not-found route work under the repository base path', async ({
  page,
}) => {
  await page.goto('guide/how-to/addon-development');
  await expect(page.getByRole('heading', { name: 'Membuat addon' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${portalPath('guide/how-to/addon-development')}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Membuat addon' })).toBeVisible();

  await page.goto('does-not-exist');
  await expect(page.getByRole('heading', { name: 'Halaman ini tidak ditemukan.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Buka panduan awal/u })).toHaveAttribute(
    'href',
    new RegExp(`${portalPath('guide/tutorials/quickstart')}`, 'u')
  );
});
