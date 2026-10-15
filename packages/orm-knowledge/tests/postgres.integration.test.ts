import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest } from '@moonwitness/orm-base';
import {
  manifest,
  WitnessCorrection,
  WitnessInterpretation,
  WitnessTestimony,
} from '../src/index.js';

const connectionString = process.env.POSTGRES_TEST_URL;
const postgresDescribe = connectionString ? describe : describe.skip;

postgresDescribe('knowledge addon PostgreSQL integration', () => {
  const schema = `mw_knowledge_${randomUUID().replaceAll('-', '')}`;
  let adminDb: Knex;
  let db: Knex;

  beforeAll(async () => {
    if (!connectionString) throw new Error('POSTGRES_TEST_URL is required');
    adminDb = knex({ client: 'pg', connection: connectionString, pool: { min: 0, max: 2 } });
    await adminDb.raw('select 1');
    await adminDb.raw('create schema ??', [schema]);
    db = knex({
      client: 'pg',
      connection: connectionString,
      searchPath: [schema],
      pool: { min: 0, max: 2 },
    });
  }, 30000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (adminDb) {
      await adminDb.raw('drop schema if exists ?? cascade', [schema]);
      await adminDb.destroy();
    }
  });

  it('installs restricted records and blocks ORM and SQL mutation in an isolated schema', async () => {
    await installAddons(db, [manifest, baseManifest]);
    const testimony = await WitnessTestimony.query().findOne({
      external_key: 'synthetic-witness-001',
    });
    expect(testimony).toMatchObject({
      visibility: 'RESTRICTED',
      received_time_text: 'spring',
      original_text: 'Synthetic example: the meeting began sometime in spring.',
    });
    expect(await WitnessCorrection.query().where('testimony_id', testimony?.id)).toHaveLength(1);
    expect(await WitnessInterpretation.query().where('testimony_id', testimony?.id)).toHaveLength(
      1
    );
    const correction = await WitnessCorrection.query().findOne({ sequence: 1 });
    const interpretation = await WitnessInterpretation.query().first();
    await expect(WitnessTestimony.query().patch({ original_text: 'replacement' })).rejects.toThrow(
      'cannot be updated or deleted'
    );

    const rows = [
      { table: 'knowledge_witness_testimonies', id: testimony?.id, column: 'original_text' },
      { table: 'knowledge_witness_corrections', id: correction?.id, column: 'correction_text' },
      {
        table: 'knowledge_witness_interpretations',
        id: interpretation?.id,
        column: 'interpretation_text',
      },
    ] as const;
    for (const row of rows) {
      await expect(
        db(row.table)
          .where({ id: row.id })
          .update({ [row.column]: 'raw SQL replacement' })
      ).rejects.toThrow('Knowledge witness records are append-only');
      await expect(db(row.table).where({ id: row.id }).delete()).rejects.toThrow(
        'Knowledge witness records are append-only'
      );
    }

    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        db('knowledge_witness_corrections').insert({
          testimony_id: testimony?.id,
          sequence: 2,
          correction_text: 'Concurrent synthetic correction.',
          reason: 'Synthetic concurrent sequence test.',
          source_label: 'Synthetic test',
          source_locator: 'fixture://concurrent-correction',
          source_digest: 'c'.repeat(64),
          asserted_time_text: 'unknown',
          asserted_time_precision: 'unknown',
          recorded_by_id: correction?.recorded_by_id,
        })
      )
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(
      await WitnessCorrection.query().where({ testimony_id: testimony?.id, sequence: 2 })
    ).toHaveLength(1);
  }, 30000);
});
