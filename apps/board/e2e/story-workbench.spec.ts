import { expect, test } from '@playwright/test';
import { E2E_SUPERADMIN_PASSWORD } from './constants.js';

test('story workbench preserves page text while selecting and reordering pages', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);

  await page.getByRole('button', { name: 'Switch company. Current scope: Global Scope' }).click();
  await page.getByRole('menuitem', { name: 'MoonWitness' }).click();
  await page.getByRole('link', { name: 'Story workbench' }).click();
  await expect(page.getByRole('heading', { name: 'Story workbench' })).toBeVisible();

  const pageSelector = page.getByLabel('Story page');
  const originalPageId = await pageSelector.inputValue();
  const initialPageCount = await pageSelector.locator('option').count();
  const editor = page.getByLabel('Page text · exact whitespace is preserved');
  await page.getByRole('button', { name: 'Add page' }).click();
  const addedPageId = await pageSelector.inputValue();
  const secondPageText = `Synthetic page ${Date.now()}\n  `;
  await editor.fill(secondPageText);
  await page.getByRole('button', { name: 'Move up' }).click();
  await expect(pageSelector).toHaveValue(addedPageId);
  await page.getByRole('button', { name: 'Move down' }).click();
  await expect(pageSelector).toHaveValue(addedPageId);

  await pageSelector.selectOption(originalPageId);
  await editor.fill('Synthetic first page.\n');
  await expect(pageSelector).toHaveValue(originalPageId);
  await expect(editor).toHaveValue('Synthetic first page.\n');
  await pageSelector.selectOption(addedPageId);
  await expect(editor).toHaveValue(secondPageText);
  await page.getByRole('button', { name: 'Remove page' }).click();
  await expect(pageSelector.locator('option')).toHaveCount(initialPageCount);
  await pageSelector.selectOption(originalPageId);
  await expect(editor).toHaveValue('Synthetic first page.\n');
});

test('story workbench keeps drafts and requires retry after an unavailable read', async ({
  page,
}) => {
  let readAttempts = 0;
  let writeAttempts = 0;
  await page.route('**/api/research/stories/**', async (route) => {
    if (route.request().method() === 'POST') {
      writeAttempts += 1;
      await route.fulfill({ status: 500, json: { success: false, error: 'Unexpected write' } });
      return;
    }
    readAttempts += 1;
    await route.fulfill(
      readAttempts === 1
        ? { status: 503, json: { success: false, error: 'Temporary failure' } }
        : { status: 404, json: { success: false, error: 'Story is unavailable' } }
    );
  });

  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);

  await page.getByRole('button', { name: 'Switch company. Current scope: Global Scope' }).click();
  await page.getByRole('menuitem', { name: 'MoonWitness' }).click();
  await page.getByRole('link', { name: 'Story workbench' }).click();
  await expect(page.getByRole('heading', { name: 'Story workbench' })).toBeVisible();
  await expect(page.getByText(/Could not confirm the saved story state/u)).toBeVisible();

  const editor = page.getByLabel('Page text · exact whitespace is preserved');
  const draft = 'Unsubmitted synthetic draft.\n  keep whitespace  ';
  await editor.fill(draft);
  await expect(page.getByRole('button', { name: 'Save revision 1' })).toBeDisabled();
  expect(writeAttempts).toBe(0);

  await page.getByRole('button', { name: 'Retry loading story' }).click();
  await expect(page.getByText(/No saved sample is available in this company yet/u)).toBeVisible();
  await expect(editor).toHaveValue(draft);
  await expect(page.getByRole('button', { name: 'Save revision 1' })).toBeEnabled();
  expect(readAttempts).toBe(2);
  expect(writeAttempts).toBe(0);
});
