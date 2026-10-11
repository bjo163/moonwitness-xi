import {
  ApiError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from './errors.js';
import { ModelRepository, type HttpClient, type RequestOptions } from './repository.js';
import type {
  AuthTokens,
  LoginParams,
  ModelInfo,
  MoonWitnessClientOptions,
  RegisterParams,
  TokenStorage,
  UserProfile,
} from './types.js';

/** Fallback when no Web Storage exists (Node, SSR, tests). */
export class MemoryStorage implements TokenStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function defaultStorage(): TokenStorage {
  try {
    // Accessing localStorage can throw (privacy mode, Node without --localstorage-file).
    if (typeof globalThis.localStorage?.getItem === 'function') return globalThis.localStorage;
  } catch {
    /* fall through */
  }
  return new MemoryStorage();
}

interface InternalRequestOptions extends RequestOptions {
  skipAuth?: boolean;
  isRetry?: boolean;
}

function isBinaryBody(value: unknown): value is Blob | string {
  return typeof value === 'string' || (typeof Blob !== 'undefined' && value instanceof Blob);
}

interface ErrorBody {
  error?: string;
  message?: string;
  type?: string;
  data?: unknown;
}

type SessionListener = (user: UserProfile | null) => void;

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

export class MoonWitnessClient implements HttpClient {
  readonly baseUrl: string;
  private readonly storage: TokenStorage;
  private readonly storageKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onSessionExpired?: () => void;
  private readonly listeners = new Set<SessionListener>();

  private tokens: AuthTokens | null = null;
  private currentCompanyId?: number;
  private refreshPromise: Promise<AuthTokens> | null = null;
  private static readonly refreshes = new WeakMap<TokenStorage, Map<string, Promise<AuthTokens>>>();
  private readonly hydrated: Promise<void>;

  constructor(options: MoonWitnessClientOptions) {
    this.baseUrl = trimTrailingSlashes(options.baseUrl);
    this.storage = options.storage ?? defaultStorage();
    this.storageKey = options.storageKey ?? 'moonwitness_auth';
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.onSessionExpired = options.onSessionExpired;
    this.hydrated = this.hydrate();
  }

  setCompanyId(companyId?: number): void {
    this.currentCompanyId = companyId;
  }

  getCompanyId(): number | undefined {
    return this.currentCompanyId ?? this.tokens?.user.company_id;
  }

  /**
   * Loads the persisted session. Synchronous storages (localStorage) are read immediately so
   * `isAuthenticated` is correct right after construction; async storages resolve via `ready()`.
   */
  private hydrate(): Promise<void> {
    const apply = (raw: string | null) => {
      try {
        this.tokens = raw ? (JSON.parse(raw) as AuthTokens) : null;
      } catch {
        this.tokens = null;
      }
    };
    const raw = this.storage.getItem(this.storageKey);
    if (raw instanceof Promise) return raw.then(apply, () => apply(null));
    apply(raw);
    return Promise.resolve();
  }

  /** Resolves once the persisted session is loaded. Only needed for async storages. */
  ready(): Promise<void> {
    return this.hydrated;
  }

  /** Subscribe to login/logout/refresh changes. Returns an unsubscribe function. */
  onSessionChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async saveTokens(tokens: AuthTokens | null): Promise<void> {
    this.tokens = tokens;
    if (tokens) await this.storage.setItem(this.storageKey, JSON.stringify(tokens));
    else await this.storage.removeItem(this.storageKey);
    for (const listener of this.listeners) listener(tokens?.user ?? null);
  }

  get currentUser(): UserProfile | null {
    return this.tokens?.user ?? null;
  }

  get isAuthenticated(): boolean {
    return Boolean(this.tokens?.access_token);
  }

  model<TRecord = Record<string, unknown>>(modelName: string): ModelRepository<TRecord> {
    return new ModelRepository<TRecord>(modelName, this);
  }

  /** Models the current user may read. */
  async getModels(): Promise<ModelInfo[]> {
    const res = await this.request<{ models: ModelInfo[] }>('/api/models');
    return res.models;
  }

  async register(params: RegisterParams): Promise<AuthTokens> {
    return this.authenticate('/auth/register', params);
  }

  async login(params: LoginParams): Promise<AuthTokens> {
    return this.authenticate('/auth/login', params);
  }

  private async authenticate(path: string, body: unknown): Promise<AuthTokens> {
    const res = await this.request<{ data: AuthTokens }>(path, {
      method: 'POST',
      body,
      skipAuth: true,
    });
    await this.saveTokens(res.data);
    return res.data;
  }

  /** Rotates the refresh token. Concurrent callers share one in-flight request. */
  refresh(): Promise<AuthTokens> {
    // Must be assigned synchronously: any await before this line lets concurrent callers
    // each start a refresh, and the server revokes the session on refresh-token reuse.
    const key = this.storageKey;
    let shared = MoonWitnessClient.refreshes.get(this.storage);
    if (!shared) {
      shared = new Map();
      MoonWitnessClient.refreshes.set(this.storage, shared);
    }
    const existing = shared.get(key);
    if (existing)
      return existing.then(async (tokens) => {
        this.tokens = tokens;
        return tokens;
      });
    this.refreshPromise ??= (async () => {
      try {
        await this.hydrated;
        const refreshToken = this.tokens?.refresh_token;
        if (!refreshToken) {
          await this.expireSession();
          throw new AuthenticationError('No refresh token available');
        }
        const res = await this.request<{ data: AuthTokens }>('/auth/refresh', {
          method: 'POST',
          body: { refresh_token: refreshToken },
          skipAuth: true,
        });
        await this.saveTokens(res.data);
        return res.data;
      } catch (error) {
        // Only a rejected token ends the session; a network blip should not log the user out.
        if (error instanceof AuthenticationError) await this.expireSession();
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();
    shared.set(key, this.refreshPromise);
    void this.refreshPromise
      .finally(() => {
        if (shared?.get(key) === this.refreshPromise) shared.delete(key);
      })
      .catch(() => undefined);
    return this.refreshPromise;
  }

  /** Reuse a token another tab has already rotated before attempting a second rotation. */
  private async refreshAfterUnauthorized(sentToken: string): Promise<void> {
    try {
      const persisted = await this.storage.getItem(this.storageKey);
      if (persisted) {
        const latest = JSON.parse(persisted) as AuthTokens;
        if (
          latest.access_token &&
          latest.access_token !== sentToken &&
          latest.user.id === this.tokens?.user.id
        ) {
          this.tokens = latest;
          return;
        }
      }
    } catch {
      // Storage may be unavailable; the server-side grace handles simultaneous rotations.
    }
    await this.refresh();
  }

  private async expireSession(): Promise<void> {
    const hadSession = this.tokens !== null;
    await this.saveTokens(null);
    if (hadSession) this.onSessionExpired?.();
  }

  async logout(): Promise<void> {
    const refreshToken = this.tokens?.refresh_token;
    await this.saveTokens(null);
    if (!refreshToken) return;
    try {
      await this.request('/auth/logout', {
        method: 'POST',
        body: { refresh_token: refreshToken },
        skipAuth: true,
      });
    } catch {
      // The local session is already gone; server-side revocation is best effort.
    }
  }

  async getMe(): Promise<UserProfile> {
    const res = await this.request<{ data: UserProfile }>('/auth/me');
    if (this.tokens) await this.saveTokens({ ...this.tokens, user: res.data });
    return res.data;
  }

  /** Odoo-style JSON-RPC call; exposes search_read, search, create, write and unlink. */
  async executeKw<T = unknown>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    const res = await this.request<{
      result?: T;
      error?: { code: number; message: string; data?: unknown };
    }>('/jsonrpc', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'call',
        params: { service: 'object', method: 'execute_kw', args: [model, method, args, kwargs] },
      },
    });
    if (res.error) {
      throw new ApiError(res.error.message, res.error.code, 'JsonRpcError', res.error.data);
    }
    return res.result as T;
  }

  /** Authenticated request; retries once after a silent refresh on 401. */
  async request<T>(path: string, options: InternalRequestOptions = {}): Promise<T> {
    if (!options.skipAuth) await this.hydrated;

    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }

    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    let requestBody: Blob | string | undefined;
    if (options.body !== undefined) {
      if (isBinaryBody(options.body)) requestBody = options.body;
      else {
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(options.body);
      }
    }
    const sentToken = options.skipAuth ? undefined : this.tokens?.access_token;
    if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
    const effectiveCompanyId = this.getCompanyId();
    if (effectiveCompanyId) headers['X-Company-Id'] = String(effectiveCompanyId);

    const res = await this.fetchImpl(url.toString(), {
      method: options.method?.toUpperCase() ?? 'GET',
      headers,
      body: requestBody,
    });

    if (res.status === 401 && !options.skipAuth && !options.isRetry && this.tokens?.refresh_token) {
      // Another request may already have rotated the tokens; replaying the old refresh token
      // would be treated as theft by the server and revoke the whole session.
      if (this.tokens.access_token === sentToken) {
        try {
          await this.refreshAfterUnauthorized(sentToken);
        } catch {
          throw new AuthenticationError('Session expired');
        }
      }
      return this.request<T>(path, { ...options, isRetry: true });
    }

    if (res.ok && options.responseType === 'blob') return (await res.blob()) as T;
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { error: text };
      }
    }

    if (!res.ok) {
      const body = (json ?? {}) as ErrorBody;
      const message = body.error ?? body.message ?? `HTTP ${res.status} ${res.statusText}`;
      switch (res.status) {
        case 400:
          throw new ValidationError(message, body.data);
        case 401:
          throw new AuthenticationError(message, body.data);
        case 403:
          throw new PermissionDeniedError(message, body.data);
        case 404:
          throw new NotFoundError(message, body.data);
        case 409:
          throw new ConflictError(message, body.data);
        default:
          throw new ApiError(message, res.status, body.type, body.data);
      }
    }
    return json as T;
  }
}
