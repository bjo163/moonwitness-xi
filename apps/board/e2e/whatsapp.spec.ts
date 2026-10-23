import { expect, test } from '@playwright/test';
import { E2E_SUPERADMIN_PASSWORD } from './constants.js';

test('company WhatsApp inbox displays chats and queues a reply', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Login').fill('superadmin');
  await page.getByLabel('Password').fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/board$/u);

  await page.route('**/whatsapp/account', (route) =>
    route.fulfill({
      json: { success: true, data: { status: 'connected', phone_number: '6281234567890' } },
    })
  );
  await page.route('**/whatsapp/conversations', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: 42,
            jid: '120363000@g.us',
            name: 'Project group',
            is_group: true,
            unread_count: 1,
            last_message: 'Can you help?',
            last_message_at: new Date().toISOString(),
          },
        ],
      },
    })
  );
  await page.route('**/whatsapp/conversations/42/messages', async (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({
        content: 'Thanks, I will take a look.',
      });
      await route.fulfill({
        status: 202,
        json: { success: true, data: { id: 51, status: 'queued' } },
      });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: 50,
            direction: 'inbound',
            content: 'Can you help?',
            status: 'received',
            message_type: 'text',
            create_date: new Date().toISOString(),
          },
        ],
      },
    });
  });

  await page.goto('/board/whatsapp');
  await expect(page.getByText('+6281234567890')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project group' })).toBeVisible();
  await expect(page.locator('article').getByText('Can you help?')).toBeVisible();
  await page.getByPlaceholder('Write a message…').fill('Thanks, I will take a look.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByPlaceholder('Write a message…')).toHaveValue('');
});
