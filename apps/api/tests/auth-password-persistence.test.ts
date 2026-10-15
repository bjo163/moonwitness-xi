import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import knex, { type Knex } from 'knex';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const configuredPassword = 'configured-superadmin-password';
const changedPassword = 'durable-superadmin-password';
const jwtSecret = 'auth-password-persistence-test-secret-123';

describe('superadmin password persistence through API restart', () => {
  let app: FastifyInstance | undefined;
  let db: Knex | undefined;
  let databaseDirectory: string | undefined;

  async function startApplication(): Promise<void> {
    if (!databaseDirectory) throw new Error('The isolated database directory is missing.');
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: join(databaseDirectory, 'api.sqlite') },
      useNullAsDefault: true,
    });
    app = await buildApp({ db, superadminPassword: configuredPassword, jwtSecret });
    await app.ready();
  }

  afterEach(async () => {
    if (app) await app.close();
    else if (db) await db.destroy();
    app = undefined;
    db = undefined;
    if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
    databaseDirectory = undefined;
  });

  it('keeps an API-changed password after restart despite the old configured seed value', async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), 'moonwitness-auth-persistence-'));
    await startApplication();
    if (!app) throw new Error('The first API instance was not started.');

    const initialLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'superadmin', password: configuredPassword },
    });
    expect(initialLogin.statusCode).toBe(200);
    const accessToken = initialLogin.json<{ data: { access_token: string } }>().data.access_token;

    const changed = await app.inject({
      method: 'POST',
      url: '/auth/me/password',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        current_password: configuredPassword,
        new_password: changedPassword,
      },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ data: { refresh_sessions_revoked: true } });

    await app.close();
    app = undefined;
    db = undefined;
    await startApplication();
    if (!app) throw new Error('The restarted API instance was not started.');

    const oldPasswordLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'superadmin', password: configuredPassword },
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: 'superadmin', password: changedPassword },
    });
    expect(newPasswordLogin.statusCode).toBe(200);
  }, 30000);
});
