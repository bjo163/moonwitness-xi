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
      json: {
        success: true,
        data: {
          status: 'connected',
          phone_number: '6281234567890',
          permissions: { manage: true, createConversation: true, send: true },
        },
      },
    })
  );
  let failSearchConversationLoad = false;
  let includeNewInboundMessage = false;
  await page.route('**/whatsapp/conversations*', (route) => {
    const url = new URL(route.request().url());
    if (failSearchConversationLoad && url.searchParams.get('search') === 'trigger-error') {
      return route.fulfill({ status: 503, json: { success: false, error: 'temporary failure' } });
    }
    if (url.searchParams.get('offset') === '50') {
      return route.fulfill({
        json: {
          success: true,
          data: [
            {
              id: 99,
              jid: '628999000111@s.whatsapp.net',
              name: 'Older conversation',
              is_group: false,
              unread_count: 0,
            },
          ],
        },
      });
    }
    const conversations = [
      {
        id: 42,
        jid: '120363000@g.us',
        name: 'Project group',
        is_group: true,
        unread_count: 1,
        last_message: 'Can you help?',
        last_message_at: new Date().toISOString(),
      },
      {
        id: 43,
        jid: '628111222333@s.whatsapp.net',
        name: 'Rani Putri',
        is_group: false,
        unread_count: 0,
        last_message: 'See you soon',
        last_message_at: new Date().toISOString(),
      },
      ...Array.from({ length: 48 }, (_, index) => ({
        id: 100 + index,
        jid: `${628200000000 + index}@s.whatsapp.net`,
        name: `Contact ${index}`,
        is_group: false,
        unread_count: 0,
      })),
    ];
    const search = url.searchParams.get('search')?.toLocaleLowerCase();
    return route.fulfill({
      json: {
        success: true,
        data: search
          ? conversations.filter((chat) =>
              `${chat.name} ${chat.jid} ${chat.last_message ?? ''}`
                .toLocaleLowerCase()
                .includes(search)
            )
          : conversations,
      },
    });
  });
  await page.route('**/whatsapp/conversations/42/messages*', async (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toMatchObject({
        content: 'Thanks, I will take a look.',
      });
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      await route.fulfill({
        status: 202,
        json: { success: true, data: { id: 51, status: 'queued' } },
      });
      return;
    }
    const url = new URL(route.request().url());
    if (url.searchParams.get('offset') === '50') {
      await route.fulfill({
        json: {
          success: true,
          data: [
            {
              id: 1,
              direction: 'inbound',
              content: 'Older history',
              status: 'received',
              message_type: 'text',
              create_date: new Date(Date.now() - 60_000).toISOString(),
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: [
          ...(includeNewInboundMessage
            ? [{
                id: 55,
                direction: 'inbound',
                content: 'New inbound message',
                status: 'received',
                is_unread: true,
                message_type: 'text',
                create_date: new Date(Date.now() + 1000).toISOString(),
              }]
            : []),
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
            is_unread: true,
            is_last_read: false,
            content: 'Can you help?',
            status: 'received',
            message_type: 'text',
            create_date: new Date().toISOString(),
          },
          {
            id: 53,
            direction: 'inbound',
            is_unread: true,
            content: 'Storage failure attachment',
            status: 'received',
            message_type: 'image',
            create_date: new Date(Date.now() - 500).toISOString(),
          },
          {
            id: 54,
            direction: 'inbound',
            is_unread: true,
            content: 'Gateway failure attachment',
            status: 'received',
            message_type: 'image',
            create_date: new Date(Date.now() - 250).toISOString(),
          },
          ...Array.from({ length: 46 }, (_, index) => ({
            id: 49 - index,
            direction: 'inbound',
            is_unread: true,
            content: `Older item ${index}`,
            status: 'received',
            message_type: 'text',
            create_date: new Date(Date.now() - (index + 1) * 1000).toISOString(),
          })),
        ],
      },
    });
  });
  await page.route('**/whatsapp/conversations/100/messages*', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  );
  await page.route('**/whatsapp/conversations/42/read', (route) =>
    route.fulfill({ json: { success: true, data: { marked: true, message_id: 50 } } })
  );
  await page.route('**/whatsapp/media/53', (route) =>
    route.fulfill({
      status: 503,
      json: { success: false, error: 'Media storage is temporarily unavailable' },
    })
  );
  await page.route('**/whatsapp/media/54', (route) =>
    route.fulfill({
      status: 502,
      json: { success: false, error: 'WhatsApp gateway returned incomplete media' },
    })
  );

  await page.goto('/board/whatsapp');
  await expect(page.getByText('+6281234567890')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project group' })).toBeVisible();
  await expect(page.getByText('Group ID: 120363000')).toBeVisible();
  await expect(page.getByRole('separator', { name: 'New messages' })).toBeVisible();
  await expect(
    page.locator('article').getByText('Attachment storage is temporarily unavailable. Try again.')
  ).toBeVisible();
  await expect(
    page.locator('article').getByText('WhatsApp could not retrieve this attachment. Try again.')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Unread' }).click();
  await expect(page.getByRole('button', { name: /Project group/u })).toBeVisible();
  await expect(page.getByRole('button', { name: /Rani Putri/u })).toHaveCount(0);
  await page.getByRole('button', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Mark latest as read' }).click();
  await page.getByRole('button', { name: 'Load more conversations' }).click();
  await expect(page.getByRole('button', { name: /Older conversation/u })).toBeVisible();
  await expect(page.locator('article').getByText('Can you help?')).toBeVisible();
  await expect(page.locator('article time').first()).toHaveAttribute(
    'datetime',
    /^\d{4}-\d{2}-\d{2}T/u
  );
  await expect(page.locator('article time').first()).not.toHaveText('—');
  await page.getByRole('button', { name: 'Load older messages' }).click();
  await expect(page.locator('article').getByText('Older history')).toBeVisible();
  const messageScroller = page.locator('div.overflow-y-auto').last();
  await expect.poll(() => messageScroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.locator('article').last().scrollIntoViewIfNeeded();
  await expect.poll(() => messageScroller.evaluate((element) => element.scrollTop)).toBeLessThan(-48);
  includeNewInboundMessage = true;
  await expect(page.getByRole('button', { name: 'New messages · Jump to latest' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'New messages · Jump to latest' }).click();
  await expect(page.locator('article').getByText('New inbound message')).toBeVisible();
  await page.getByPlaceholder('Write a message…').fill('Thanks, I will take a look.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByPlaceholder('Write a message…')).toHaveValue('');
  await expect(page.locator('article').getByText('sent')).toBeVisible();
  await page.getByLabel('Search conversations by name, number, or message').fill('Rani');
  await expect(page.getByRole('button', { name: /Rani Putri/u })).toBeVisible();
  await page.getByLabel('Search conversations by name, number, or message').fill('');
  await page.getByRole('button', { name: 'Groups' }).click();
  await expect(page.getByRole('button', { name: /Project group/u })).toBeVisible();
  await expect(page.getByRole('button', { name: /Rani Putri/u })).toHaveCount(0);
  await page.getByLabel('Search conversations by name, number, or message').fill('120363000');
  await expect(page.getByRole('button', { name: /Project group/u })).toBeVisible();
  await page.getByLabel('Search conversations by name, number, or message').fill('help');
  await expect(page.getByRole('button', { name: /Project group/u })).toBeVisible();
  await page.getByLabel('Search conversations by name, number, or message').fill('');
  await page.waitForTimeout(300);
  failSearchConversationLoad = true;
  await page.getByLabel('Search conversations by name, number, or message').fill('trigger-error');
  await expect(page.getByRole('button', { name: 'Retry inbox' })).toBeVisible();
  failSearchConversationLoad = false;
  await page.getByRole('button', { name: 'Retry inbox' }).click();
  await page.getByLabel('Search conversations by name, number, or message').fill('');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByRole('button', { name: /Rani Putri/u })).toBeVisible();
  await page.getByRole('button', { name: 'Private' }).click();
  await page.getByRole('button', { name: /Contact 0/u }).click();
  await expect(page.getByRole('heading', { name: 'Contact 0' })).toBeVisible();
  await expect(page.getByText('+628200000000')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Private' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByRole('heading', { name: 'Contact 0' })).toBeVisible();
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
        data: {
          status,
          qr_code: status === 'qr' ? 'mock-qr-for-test' : null,
          permissions: { manage: true, createConversation: true, send: true },
        },
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
  await page.route('**/whatsapp/conversations*', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ phone: '6281234567890' });
      createdChat = true;
      return route.fulfill({ status: 201, json: { success: true, data: contact } });
    }
    return route.fulfill({ json: { success: true, data: createdChat ? [contact] : [] } });
  });
  let fail = false,
    queued = false;
  await page.route('**/whatsapp/conversations/12/messages*', async (route) => {
    if (route.request().method() === 'POST') {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { success: false, error: 'Service unavailable' },
        });
      const payload = route.request().postDataJSON();
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      expect(payload.media_file_name).toBe('sample.txt');
      expect(Buffer.from(payload.media_base64, 'base64').toString()).toBe('test attachment');
      queued = true;
      return route.fulfill({
        status: 202,
        json: { success: true, data: { id: 2, status: 'queued' } },
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
  status = 'qr_expired';
  await expect(page.getByText('QR code expired')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh QR code' }).click();
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

test('pins, archives, and restores a conversation from the inbox', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or Username').fill('superadmin');
  await page.getByLabel('Password', { exact: true }).fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the Shadow' }).click();
  await expect(page).toHaveURL(/\/board$/u);

  let archived = false;
  let pinned = false;
  const conversation = {
    id: 77,
    jid: '628555111222@s.whatsapp.net',
    name: 'Archive and pin test',
    is_group: false,
    is_archived: false,
    is_pinned: false,
    unread_count: 0,
    last_message: 'Latest preview',
    last_message_at: new Date().toISOString(),
  };
  await page.route('**/whatsapp/account', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          status: 'connected',
          permissions: {
            manage: true,
            manageConversations: true,
            createConversation: true,
            send: true,
          },
        },
      },
    })
  );
  await page.route('**/whatsapp/conversations*', (route) => {
    const url = new URL(route.request().url());
    const requestedArchived = url.searchParams.get('archived') === 'true';
    return route.fulfill({
      json: {
        success: true,
        data:
          requestedArchived === archived
            ? [{ ...conversation, is_archived: archived, is_pinned: pinned }]
            : [],
      },
    });
  });
  await page.route('**/whatsapp/conversations/77/messages*', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  );
  await page.route('**/whatsapp/conversations/77/pin', async (route) => {
    pinned = route.request().postDataJSON().pinned;
    await route.fulfill({
      json: { success: true, data: { ...conversation, is_archived: archived, is_pinned: pinned } },
    });
  });
  await page.route('**/whatsapp/conversations/77/archive', async (route) => {
    archived = route.request().postDataJSON().archived;
    await route.fulfill({
      json: { success: true, data: { ...conversation, is_archived: archived, is_pinned: pinned } },
    });
  });

  await page.goto('/board/whatsapp');
  await expect(page.getByRole('button', { name: /Archive and pin test/u })).toBeVisible();
  await page.getByRole('button', { name: 'Pin chat' }).click();
  await expect(page.getByRole('button', { name: 'Unpin chat' })).toBeVisible();
  await page.getByRole('button', { name: 'Archive chat' }).click();
  await expect(page.getByText('No conversations yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Archived' }).click();
  await expect(page.getByRole('button', { name: /Archive and pin test/u })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unpin chat' })).toBeVisible();
  await page.getByRole('button', { name: 'Unarchive chat' }).click();
  await expect(page.getByText('No conversations yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Active' }).click();
  await expect(page.getByRole('button', { name: /Archive and pin test/u })).toBeVisible();
});

test('pauses WhatsApp account polling while the Board tab is hidden', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or Username').fill('superadmin');
  await page.getByLabel('Password', { exact: true }).fill(E2E_SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enter the Shadow' }).click();
  await expect(page).toHaveURL(/\/board$/u);

  let accountPolls = 0;
  await page.route('**/whatsapp/account', async (route) => {
    accountPolls += 1;
    await route.fulfill({
      json: {
        success: true,
        data: {
          status: 'connected',
          phone_number: '6281234567890',
          permissions: { manage: true, createConversation: true, send: true },
        },
      },
    });
  });
  await page.goto('/board/whatsapp');
  await expect.poll(() => accountPolls).toBe(1);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(4000);
  expect(accountPolls).toBe(1);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => accountPolls, { timeout: 5000 }).toBeGreaterThan(1);
});
