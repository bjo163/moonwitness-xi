import knex, { type Knex } from 'knex';
import { Model } from 'objection';
import knexConfig from '../config/knexfile.js';
import { config } from '../config/env.js';

export function createDatabase(): Knex {
  const environment =
    config.env === 'test' || config.env === 'production' ? config.env : 'development';
  const db = knex(knexConfig[environment] ?? knexConfig.development);
  Model.knex(db);
  return db;
}

export async function testConnection(db: Knex): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
