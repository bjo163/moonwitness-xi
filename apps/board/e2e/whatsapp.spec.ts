import { expect, test } from '@playwright/test';
import { E2E_SUPERADMIN_PASSWORD } from './constants.js';

test('company WhatsApp inbox displays chats and sends a reply', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or Username').fill('superadmin');
  await page.getByLabel('Password', { exact: true }).fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the Shadow' }).click();
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
        status: 201,
        json: { success: true, data: { id: 51, status: 'sent' } },
      });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: 52,
            direction: 'outbound',
            content: 'A failed reply',
            status: 'sent',
            message_type: 'text',
            create_date: new Date().toISOString(),
          },
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
  await expect(page.locator('article').getByText('sent')).toBeVisible();
  await page.screenshot({ path: '../../test-results/whatsapp-board.png', fullPage: true });
});

test('connect shows QR, media is sent, and failures preserve the draft', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or Username').fill('superadmin');
  await page.getByLabel('Password', { exact: true }).fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the Shadow' }).click();
  await expect(page).toHaveURL(/\/board$/u);
  let status = 'disconnected';
  await page.route('**/whatsapp/account', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { status, qr_code: status === 'qr' ? 'mock-qr-for-test' : null },
      },
    })
  );
  await page.route('**/whatsapp/connect', (route) => {
    status = 'qr';
    return route.fulfill({ status: 202, json: { success: true } });
  });
  await page.route('**/whatsapp/disconnect', (route) => {
    status = 'disconnected';
    return route.fulfill({ json: { success: true } });
  });
  let createdChat = false;
  const contact = {
    id: 12,
    name: 'Test contact',
    jid: '123@s.whatsapp.net',
    is_group: false,
    unread_count: 0,
  };
  await page.route('**/whatsapp/conversations', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ phone: '6281234567890' });
      createdChat = true;
      return route.fulfill({ status: 201, json: { success: true, data: contact } });
    }
    return route.fulfill({ json: { success: true, data: createdChat ? [contact] : [] } });
  });
  let fail = false,
    queued = false;
  await page.route('**/whatsapp/conversations/12/messages', async (route) => {
    if (route.request().method() === 'POST') {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { success: false, error: 'Service unavailable' },
        });
      const payload = route.request().postDataJSON();
      expect(payload.media_file_name).toBe('sample.txt');
      expect(Buffer.from(payload.media_base64, 'base64').toString()).toBe('test attachment');
      queued = true;
      return route.fulfill({
        status: 201,
        json: { success: true, data: { id: 2, status: 'sent' } },
      });
    }
    return route.fulfill({
      json: {
        success: true,
        data: queued
          ? [
              {
                id: 2,
                direction: 'outbound',
                content: 'Test caption',
                status: 'sent',
                message_type: 'text',
                create_date: new Date().toISOString(),
              },
            ]
          : [],
      },
    });
  });
  await page.goto('/board/whatsapp');
  await page.getByRole('button', { name: 'Connect WhatsApp' }).click();
  await expect(page.getByAltText('WhatsApp connection QR code')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel connection' }).click();
  await expect(page.getByRole('button', { name: 'Connect WhatsApp' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect WhatsApp' }).click();
  await expect(page.getByAltText('WhatsApp connection QR code')).toBeVisible();
  status = 'connected';
  await page.reload();
  await page.getByLabel('Phone number with country code').fill('6281234567890');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByPlaceholder('Write a message…').fill('Test caption');
  await page.getByLabel('Attach media', { exact: true }).setInputFiles({
    name: 'sample.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test attachment'),
  });
  await expect(page.getByText('Attached: sample.txt')).toBeVisible();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByPlaceholder('Write a message…')).toHaveValue('');
  await expect(page.locator('article').getByText('sent')).toBeVisible();
  fail = true;
  await page.getByPlaceholder('Write a message…').fill('Keep this draft');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByPlaceholder('Write a message…')).toHaveValue('Keep this draft');
  await expect(page.getByText('Service unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect WhatsApp' })).toBeVisible();
});
