import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('public homepage renders its message, canonical metadata, and workspace action', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Real people\. Unfiltered worlds\./u);
  await expect(page.getByRole('heading', { level: 1, name: 'MoonWitness' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sign in to your workspace/u })).toHaveAttribute(
    'href',
    '/login'
  );

  const origin = new URL(page.url()).origin;
  const canonical = new URL(
    (await page.locator('link[rel="canonical"]').getAttribute('href'))!,
    origin
  );
  expect(canonical.origin).toBe(origin);
  expect(canonical.pathname).toBe('/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    `${origin}/brand/social-card.png`
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index/u);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('legacy Board routes redirect to canonical paths and preserve query strings', async ({
  request,
}) => {
  const cases = [
    ['/profile', '/board/profile'],
    ['/settings', '/board/settings'],
    ['/knowledge', '/board/knowledge'],
    ['/stories/workbench', '/board/stories/workbench'],
    ['/m/base.partner', '/board/m/base.partner'],
    ['/m/base.partner/123', '/board/m/base.partner/123'],
  ];

  for (const [source, destination] of cases) {
    const response = await request.get(`${source}?view=compact`, { maxRedirects: 0 });
    expect(response.status(), source).toBe(308);
    const location = response.headers().location;
    expect(location, `${source} redirect location`).toBe(`${destination}?view=compact`);
  }
});

test('auth pages stay out of search and external login return paths are discarded', async ({
  page,
}) => {
  await page.goto('/login?returnTo=https%3A%2F%2Fevil.example%2F');

  await expect(page).toHaveTitle(/Sign in/u);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/u);
  const register = new URL(
    (await page.getByRole('link', { name: 'Register' }).getAttribute('href'))!,
    page.url()
  );
  expect(register.searchParams.get('returnTo')).toBe('/board');
});

test('homepage adapts to a narrow mobile viewport without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'MoonWitness' })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);

  const filmstrip = page.getByRole('region', {
    name: 'How MoonWitness connects people, knowledge, and story work',
  });
  await expect(filmstrip).toHaveAttribute('tabindex', '0');
  await expect(page.locator('.home-step-card')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Share with care' })).toBeVisible();
  const instructionsId = await filmstrip.getAttribute('aria-describedby');
  expect(instructionsId).toBeTruthy();
  await expect(page.locator(`[id="${instructionsId}"]`)).toHaveText(
    /left and right arrow keys.*Home and End/iu
  );
  await filmstrip.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await filmstrip.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => filmstrip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.keyboard.press('Home');
  await expect.poll(() => filmstrip.evaluate((element) => element.scrollLeft)).toBeLessThan(10);
});
