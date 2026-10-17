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
