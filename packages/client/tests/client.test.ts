import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage, MoonWitnessClient } from '../src/client.js';
import {
  ApiError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '../src/errors.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const tokens = (access: string, refresh = `r-${access}`) => ({
  success: true,
  data: {
    access_token: access,
    refresh_token: refresh,
    token_type: 'Bearer',
    expires_in: 900,
    user: { id: 1, login: 'alice', role: 'user' },
  },
});

function makeClient(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
  baseUrl = 'http://api.test/'
) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) =>
    handler(new URL(input), init)
  );
  const storage = new MemoryStorage();
  const client = new MoonWitnessClient({
    baseUrl,
    fetch: fetchMock as unknown as typeof fetch,
    storage,
  });
  return { client, fetchMock, storage };
}

describe('MoonWitnessClient', () => {
  it('removes all trailing slashes from the configured API URL', () => {
    const { client } = makeClient(() => json({}), 'http://api.test////');
    expect(client.baseUrl).toBe('http://api.test');
  });

  it('uploads file bytes and downloads attachments as blobs', async () => {
    let uploadBody: BodyInit | null | undefined;
    let uploadHeaders: Record<string, string> = {};
    const { client } = makeClient((url, init) => {
      if (url.pathname === '/auth/login') return json(tokens('attachment-token'));
      if (url.pathname === '/api/base.attachment/upload') {
        uploadBody = init?.body;
        uploadHeaders = init?.headers as Record<string, string>;
        return json({ data: { id: 17 } }, 201);
      }
      if (url.pathname === '/api/base.attachment/17/download') {
        return new Response(new Blob(['real file bytes'], { type: 'text/plain' }), {
          headers: { 'content-type': 'text/plain' },
        });
      }
      return json({ error: 'unexpected request' }, 404);
    });
    await client.login({ login: 'alice', password: 'pw' });
    const repository = client.model<{ id: number }>('base.attachment');
    const attachment = await repository.uploadAttachment(
      'base.partner',
      42,
      new File(['real file bytes'], 'note.txt', { type: 'text/plain' })
    );
    expect(attachment).toEqual({ id: 17 });
    expect(uploadBody).toBeInstanceOf(Blob);
    expect(uploadHeaders['Content-Type']).toBe('application/octet-stream');
    expect(uploadHeaders['X-File-Mime']).toBe('text/plain');
    const downloaded = await repository.downloadAttachment(17);
    expect(await downloaded.text()).toBe('real file bytes');
  });

  it('sends the bearer token and builds list queries', async () => {
    let seen: { auth?: string; query?: string } = {};
    const { client } = makeClient((url, init) => {
      if (url.pathname === '/auth/login') return json(tokens('a1'));
      seen = { auth: (init?.headers as Record<string, string>).Authorization, query: url.search };
      return json({ success: true, data: [{ id: 1 }], count: 1, total: 7 });
    });

    await client.login({ login: 'alice', password: 'pw' });
    const page = await client.model('base.partner').searchRead({
      domain: [['active', '=', true]],
      limit: 10,
      count: true,
    });

    expect(page).toEqual({ records: [{ id: 1 }], total: 7 });
    expect(seen.auth).toBe('Bearer a1');
    const params = new URLSearchParams(seen.query);
    expect(params.get('domain')).toBe('[["active","=",true]]');
    expect(params.get('limit')).toBe('10');
    expect(params.get('count')).toBe('true');
  });

  it('shares one refresh across concurrent 401s and retries each request', async () => {
    let refreshes = 0;
    const { client } = makeClient((url, init) => {
      if (url.pathname === '/auth/login') return json(tokens('old'));
      if (url.pathname === '/auth/refresh') {
        refreshes++;
        return json(tokens('new'));
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new' ? json({ models: [] }) : json({ error: 'expired' }, 401);
    });

    await client.login({ login: 'alice', password: 'pw' });
    await Promise.all([client.getModels(), client.getModels(), client.getModels()]);
    expect(refreshes).toBe(1);
  });

  it('keeps the session when refresh fails for a non-auth reason', async () => {
    const { client } = makeClient((url) => {
      if (url.pathname === '/auth/login') return json(tokens('a1'));
      if (url.pathname === '/auth/refresh') return json({ error: 'boom' }, 503);
      return json({ error: 'expired' }, 401);
    });
    await client.login({ login: 'alice', password: 'pw' });
    await expect(client.getModels()).rejects.toBeInstanceOf(AuthenticationError);
    expect(client.isAuthenticated).toBe(true);
  });

  it('notifies session listeners on login and logout', async () => {
    const { client } = makeClient((url) =>
      url.pathname === '/auth/login' ? json(tokens('a1')) : json({ success: true })
    );
    const events: (string | null)[] = [];
    client.onSessionChange((user) => events.push(user?.login ?? null));
    await client.login({ login: 'alice', password: 'pw' });
    await client.logout();
    expect(events).toEqual(['alice', null]);
  });

  it('supports async storages via ready()', async () => {
    const backing = new MemoryStorage();
    backing.setItem('moonwitness_auth', JSON.stringify(tokens('stored').data));
    const client = new MoonWitnessClient({
      baseUrl: 'http://api.test',
      fetch: vi.fn() as unknown as typeof fetch,
      storage: {
        getItem: async (k) => backing.getItem(k),
        setItem: async (k, v) => backing.setItem(k, v),
        removeItem: async (k) => backing.removeItem(k),
      },
    });
    await client.ready();
    expect(client.currentUser?.login).toBe('alice');
  });

  it('maps HTTP status codes to typed errors', async () => {
    const { client } = makeClient((url) => json({ error: 'x' }, Number(url.pathname.slice(1))));
    await expect(client.request('/400')).rejects.toBeInstanceOf(ValidationError);
    await expect(client.request('/401')).rejects.toBeInstanceOf(AuthenticationError);
    await expect(client.request('/403')).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(client.request('/404')).rejects.toBeInstanceOf(NotFoundError);
    await expect(client.request('/409')).rejects.toBeInstanceOf(ConflictError);
    await expect(client.request('/500')).rejects.toBeInstanceOf(ApiError);
  });
});
