import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as base, initializeSuperadminPassword } from '@moonwitness/orm-base';
import { AuthError, RefreshToken, createAuthService, manifest } from '../src/index.js';

const PASSWORD = 'correct-horse-battery';

describe('auth service', () => {
  let db: Knex;
  const auth = createAuthService({
    refreshTtlSeconds: 60,
    refreshTokenSecret: 'test-refresh-token-secret-which-is-long-enough',
  });

  beforeEach(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await installAddons(db, [base, manifest]);
    await initializeSuperadminPassword(PASSWORD);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it('stores keyed refresh-token fingerprints and rejects a different server key', async () => {
    const session = await auth.login('superadmin', PASSWORD, { userAgent: 'vitest' });
    expect(session).toMatchObject({ login: 'superadmin', role: 'superadmin' });
    const rows = await RefreshToken.query();
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(session.refreshToken);
    expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].user_agent).toBe('vitest');
    await expect(
      createAuthService({
        refreshTokenSecret: 'different-refresh-token-secret-long-enough',
      }).refresh(session.refreshToken)
    ).rejects.toBeInstanceOf(AuthError);
  }, 20000);

  it('models JWT key rotation by rejecting old refresh sessions and allowing a new login', async () => {
    const previousSession = await auth.login('superadmin', PASSWORD, {
      userAgent: 'pre-rotation',
    });
    const rotatedAuth = createAuthService({
      refreshTtlSeconds: 60,
      refreshTokenSecret: 'rotated-refresh-token-secret-which-is-long-enough',
    });

    await expect(rotatedAuth.refresh(previousSession.refreshToken)).rejects.toBeInstanceOf(
      AuthError
    );

    const recoveredSession = await rotatedAuth.login('superadmin', PASSWORD, {
      userAgent: 'post-rotation',
    });
    expect(recoveredSession.userId).toBe(previousSession.userId);
    expect(recoveredSession.refreshToken).not.toBe(previousSession.refreshToken);
    await expect(rotatedAuth.refresh(recoveredSession.refreshToken)).resolves.toMatchObject({
      userId: previousSession.userId,
    });
  }, 20000);

  it('registers a new user with partner and prevents duplicate logins', async () => {
    const session = await auth.register({
      login: 'bob',
      password: 'bob-password-123',
      name: 'Bob Builder',
      email: 'bob@example.com',
    });
    expect(session).toMatchObject({ login: 'bob', role: 'user' });
    expect(session.userId).toBeGreaterThan(0);
    expect(session.partnerId).toBeGreaterThan(0);

    // Duplicate registration should fail
    await expect(
      auth.register({
        login: 'bob',
        password: 'different-password',
      })
    ).rejects.toThrow('User already exists');

    // Should be able to login with the registered credentials
    const loginSession = await auth.login('bob', 'bob-password-123');
    expect(loginSession.userId).toBe(session.userId);
  }, 20000);

  it('rejects a duplicate email without leaving an orphan partner', async () => {
    await auth.register({ login: 'carol', password: 'carol-password', email: 'x@example.com' });
    const partnersBefore = (await db('partners').count({ n: '*' }))[0].n;
    await expect(
      auth.register({ login: 'dave', password: 'dave-password', email: 'x@example.com' })
    ).rejects.toThrow('already registered');
    expect((await db('partners').count({ n: '*' }))[0].n).toBe(partnersBefore);
    expect(await db('users').where({ login: 'dave' }).first()).toBeUndefined();
  }, 20000);

  it('rejects wrong passwords, unknown logins and users without a password', async () => {
    for (const [login, password] of [
      ['superadmin', 'nope'],
      ['ghost', PASSWORD],
      ['system', PASSWORD],
    ] as const) {
      await expect(auth.login(login, password)).rejects.toBeInstanceOf(AuthError);
    }
    expect(await RefreshToken.query()).toHaveLength(0);
  }, 20000);

  it('rejects archived users', async () => {
    await db('users').where({ login: 'superadmin' }).update({ active: false });
    await expect(auth.login('superadmin', PASSWORD)).rejects.toBeInstanceOf(AuthError);
  }, 20000);

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const first = await auth.login('superadmin', PASSWORD);
    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.userId).toBe(first.userId);

    // Replaying the rotated token is treated as theft: the newest token dies too.
    await new Promise((resolve) => setTimeout(resolve, 5100));
    await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(auth.refresh(second.refreshToken)).rejects.toBeInstanceOf(AuthError);
  }, 20000);

  it('rejects unknown and expired refresh tokens', async () => {
    await expect(auth.refresh('not-a-token')).rejects.toBeInstanceOf(AuthError);
    const session = await auth.login('superadmin', PASSWORD);
    await db('auth_refresh_tokens').update({ expires_at: new Date(0).toISOString() });
    await expect(auth.refresh(session.refreshToken)).rejects.toThrow('expired');
  }, 20000);

  it('logs out idempotently and blocks refresh afterwards', async () => {
    const session = await auth.login('superadmin', PASSWORD);
    await auth.logout(session.refreshToken);
    await auth.logout(session.refreshToken);
    await auth.logout('unknown');
    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(AuthError);
  }, 20000);

  it('revokes every session of a user', async () => {
    const a = await auth.login('superadmin', PASSWORD);
    const b = await auth.login('superadmin', PASSWORD);
    await auth.revokeAllForUser(a.userId);
    await expect(auth.refresh(a.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(auth.refresh(b.refreshToken)).rejects.toBeInstanceOf(AuthError);
  }, 20000);

  it('revokes outstanding refresh sessions across all users', async () => {
    const admin = await auth.login('superadmin', PASSWORD);
    const user = await auth.register({
      login: 'session-revocation-user',
      password: 'session-revocation-password',
      name: 'Session Revocation User',
      email: 'session-revocation@example.com',
    });
    const revokedCount = await auth.revokeAllSessions();

    expect(revokedCount).toBe(2);
    await expect(auth.refresh(admin.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(auth.refresh(user.refreshToken)).rejects.toBeInstanceOf(AuthError);
  }, 20000);
}, 20000);
