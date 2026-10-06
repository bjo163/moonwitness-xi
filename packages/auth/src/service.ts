import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Transaction } from 'objection';
import { hashPassword, verifyPassword } from '@moonwitness/orm';
import {
  Company,
  Partner,
  User,
  assignDefaultCompanyMembership,
  assignDefaultUserGroup,
} from '@moonwitness/orm-base';
import { RefreshToken } from './refresh-token.js';

export type Role = 'system' | 'superadmin' | 'user';

/** Raised for every credential/token failure; the message is safe to show to clients. */
export class AuthError extends Error {
  readonly statusCode = 401;
  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  constructor(message = 'User already exists') {
    super(message);
    this.name = 'ConflictError';
  }
}

export interface RegisterInput {
  login: string;
  password: string;
  name?: string;
  email?: string;
}

export interface RequestMeta {
  userAgent?: string;
}

export interface AuthSession {
  userId: number;
  login: string;
  role: Role;
  partnerId: number;
  refreshToken: string;
  /** ISO-8601 UTC. */
  refreshExpiresAt: string;
}

export interface AuthServiceOptions {
  /** Refresh token lifetime in seconds. Defaults to 14 days. */
  refreshTtlSeconds?: number;
}

/**
 * Refresh tokens are generated from 256 bits of cryptographic randomness, not passwords.
 * A fast one-way digest is appropriate for their indexed lookup; user passwords use scrypt.
 */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const REFRESH_REUSE_GRACE_MS = 5_000;

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code, nativeError } = error as {
    name?: string;
    code?: string;
    nativeError?: { code?: string };
  };
  const codes = [code, nativeError?.code];
  return (
    name === 'UniqueViolationError' ||
    codes.includes('23505') ||
    codes.includes('SQLITE_CONSTRAINT_UNIQUE') ||
    codes.includes('ER_DUP_ENTRY')
  );
}

export function createAuthService(options: AuthServiceOptions = {}) {
  const ttlMs = (options.refreshTtlSeconds ?? 14 * 24 * 60 * 60) * 1000;
  // Verified against when the login is unknown, so response time does not reveal which
  // logins exist. Computed once, up front, to keep the first miss as slow as a hit.
  // Use the same scrypt work factor for unknown logins without a fixed dummy password.
  const dummyHash = hashPassword(randomBytes(32).toString('base64url'));

  async function revokeFamily(family: string, trx?: Transaction) {
    await RefreshToken.query(trx)
      .patch({ revoked: true, rotated_at: null, rotation_lease_until: null })
      .where({ family });
  }

  async function issue(
    user: { id: number; login: string; role: Role; partner_id: number },
    family: string,
    meta: RequestMeta,
    trx?: Transaction
  ): Promise<AuthSession> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + ttlMs).toISOString();
    await RefreshToken.query(trx).insert({
      user_id: user.id,
      token_hash: hashToken(refreshToken),
      family,
      expires_at: refreshExpiresAt,
      user_agent: meta.userAgent?.slice(0, 255),
    });
    return {
      userId: user.id,
      login: user.login,
      role: user.role,
      partnerId: user.partner_id,
      refreshToken,
      refreshExpiresAt,
    };
  }

  return {
    /** Self-service sign-up. Always creates role 'user'; partner and user are atomic. */
    async register(input: RegisterInput, meta: RequestMeta = {}): Promise<AuthSession> {
      if (await User.query().findOne({ login: input.login })) {
        throw new ConflictError('User already exists');
      }
      let user;
      try {
        user = await User.transaction(async (trx) => {
          const company = await Company.query(trx)
            .where({ active: true })
            .orderBy('id', 'asc')
            .first();
          if (!company)
            throw new Error('Registration is unavailable until a company is configured');
          const partner = await Partner.query(trx).insert({
            name: input.name?.trim() || input.login,
            email: input.email?.trim() || null,
            company_id: company.id,
          });
          const user = await User.query(trx).insert({
            login: input.login,
            password: input.password,
            partner_id: partner.id,
            role: 'user',
          });
          await assignDefaultUserGroup(user.id, trx);
          await assignDefaultCompanyMembership(user.id, trx);
          return user;
        });
      } catch (error) {
        // A concurrent signup with the same login, or an email already in use.
        if (isUniqueViolation(error)) throw new ConflictError('Login or email already registered');
        throw error;
      }
      return issue(user, randomUUID(), meta);
    },

    async login(login: string, password: string, meta: RequestMeta = {}): Promise<AuthSession> {
      const user = await User.query().findOne({ login }).withGraphFetched('partner');
      const stored =
        user && user.active !== false && user.partner && user.partner.active !== false
          ? user.password
          : null;
      const valid = await verifyPassword(password, stored ?? (await dummyHash));
      if (!user || !stored || !valid) throw new AuthError();

      // Opportunistic cleanup keeps the table from growing without a background job.
      await RefreshToken.query()
        .delete()
        .where('user_id', user.id)
        .where('expires_at', '<', new Date().toISOString());
      return issue(user, randomUUID(), meta);
    },

    /** Change credentials only after verifying the current secret, then revoke every session. */
    async changePassword(
      userId: number,
      currentPassword: string,
      newPassword: string
    ): Promise<void> {
      if (newPassword.length < 12 || newPassword.length > 1024) {
        throw new RangeError('New password must be between 12 and 1024 characters');
      }
      const user = await User.query().findById(userId);
      if (
        !user ||
        user.active === false ||
        !(await verifyPassword(currentPassword, user.password))
      ) {
        throw new AuthError('Current password is incorrect');
      }

      const changed = await User.query()
        .where({ id: userId, password: user.password })
        .patch({ password: newPassword });
      if (!changed) throw new AuthError('Current password is incorrect');
      await this.revokeAllForUser(userId);
    },

    /** Rotates the token. Presenting an already-used token revokes its whole family. */
    async refresh(token: string, meta: RequestMeta = {}): Promise<AuthSession> {
      const hash = hashToken(token);
      const row = await RefreshToken.query().findOne({ token_hash: hash });
      if (!row) throw new AuthError('Invalid refresh token');
      if (row.expires_at <= new Date().toISOString()) throw new AuthError('Refresh token expired');

      if (row.revoked) {
        const leaseUntil = Date.parse(row.rotation_lease_until ?? '');
        if (Number.isFinite(leaseUntil) && leaseUntil >= Date.now()) {
          while (Date.now() <= leaseUntil) {
            const successor = await RefreshToken.query()
              .where({ user_id: row.user_id, family: row.family, revoked: false })
              .orderBy('id', 'desc')
              .first();
            if (successor) {
              const user = await User.query().findById(row.user_id).withGraphFetched('partner');
              if (!user || user.active === false || !user.partner || user.partner.active === false)
                throw new AuthError('Invalid refresh token');
              return issue(user, row.family, meta);
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
        await revokeFamily(row.family);
        throw new AuthError('Invalid refresh token');
      }

      if (!row.revoked) {
        // This conditional update is the atomic claim. Parallel callers that lose the race
        // observe the winner's timestamp and receive a valid branch during the grace window.
        const rotatedAt = new Date().toISOString();
        const claimed = await RefreshToken.query()
          .patch({
            revoked: true,
            rotated_at: rotatedAt,
            rotation_lease_until: new Date(Date.now() + REFRESH_REUSE_GRACE_MS).toISOString(),
          })
          .where({ id: row.id, revoked: false });
        if (claimed === 0) {
          let latest = await RefreshToken.query().findById(row.id);
          for (let attempt = 0; latest?.rotated_at == null && attempt < 4; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
            latest = await RefreshToken.query().findById(row.id);
          }
          if (!latest || Date.parse(latest.rotation_lease_until ?? '') < Date.now()) {
            await revokeFamily(row.family);
            throw new AuthError('Invalid refresh token');
          }
        }
      }

      const user = await User.query().findById(row.user_id).withGraphFetched('partner');
      if (!user || user.active === false || !user.partner || user.partner.active === false) {
        await revokeFamily(row.family);
        throw new AuthError('Invalid refresh token');
      }
      return issue(user, row.family, meta);
    },

    /** Idempotent: unknown tokens are ignored so callers cannot probe token validity. */
    async logout(token: string): Promise<void> {
      const row = await RefreshToken.query().findOne({ token_hash: hashToken(token) });
      if (row) await revokeFamily(row.family);
    },

    async revokeAllForUser(userId: number): Promise<void> {
      await RefreshToken.query()
        .patch({ revoked: true, rotated_at: null, rotation_lease_until: null })
        .where({ user_id: userId });
    },

    /** Revokes every outstanding refresh session after a signing-secret incident. */
    async revokeAllSessions(): Promise<number> {
      return RefreshToken.query()
        .patch({ revoked: true, rotated_at: null, rotation_lease_until: null })
        .where({ revoked: false });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
