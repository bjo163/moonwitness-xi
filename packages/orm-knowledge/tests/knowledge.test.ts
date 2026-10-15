import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import { manifest as baseManifest, ModelAccess, User } from '@moonwitness/orm-base';
import {
  isNextCorrectionSequence,
  isValidCorrectionProvenance,
  manifest,
  WitnessCorrection,
  WitnessInterpretation,
  WitnessTestimony,
} from '../src/index.js';

const digest = 'c'.repeat(64);

describe('knowledge witness records addon', () => {
  let db: Knex;

  beforeEach(() => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      pool: {
        afterCreate(
          connection: { pragma(sql: string): unknown },
          done: (error: Error | null, connection: unknown) => void
        ) {
          connection.pragma('foreign_keys = ON');
          done(null, connection);
        },
      },
    });
  });

  afterEach(async () => db.destroy());

  it('installs synthetic examples with restricted visibility by default', async () => {
    await installAddons(db, [manifest, baseManifest]);
    const testimony = await WitnessTestimony.query().findOne({
      external_key: 'synthetic-witness-001',
    });
    expect(testimony).toMatchObject({ visibility: 'RESTRICTED', received_time_text: 'spring' });
    expect(await WitnessCorrection.query().where('testimony_id', testimony?.id)).toHaveLength(1);
    const interpretation = await WitnessInterpretation.query().findOne({
      assertion_ref: 'assertion://synthetic/meeting-after-noon',
    });
    expect(interpretation).toMatchObject({
      visibility: 'RESTRICTED',
      epistemic_status: 'hypothesis',
      evidence_ref: 'evidence://synthetic/witness-001/correction-001',
    });
    expect(manifest.data?.length).toBeGreaterThan(0);
    expect(manifest.menus?.every((menu) => menu.developmentOnly)).toBe(true);
    for (const model of [WitnessTestimony, WitnessCorrection, WitnessInterpretation]) {
      await expect(
        ModelAccess.query().findOne({ model_name: model.modelName, read: false })
      ).resolves.toBeDefined();
    }
  });

  it('rejects ordinary model updates and deletes to source and correction records', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const testimony = await WitnessTestimony.query().findOne({
      external_key: 'synthetic-witness-001',
    });
    const correction = await WitnessCorrection.query().findOne({ sequence: 1 });
    await expect(WitnessTestimony.query().patch({ original_text: 'replacement' })).rejects.toThrow(
      'cannot be updated or deleted'
    );
    await expect(WitnessTestimony.query().deleteById(testimony?.id)).rejects.toThrow(
      'cannot be updated or deleted'
    );
    await expect(
      WitnessCorrection.query().patch({ correction_text: 'replacement' })
    ).rejects.toThrow('cannot be updated or deleted');
    await expect(WitnessCorrection.query().deleteById(correction?.id)).rejects.toThrow(
      'cannot be updated or deleted'
    );
    const interpretation = await WitnessInterpretation.query().first();
    await expect(
      WitnessInterpretation.query().patch({ interpretation_text: 'replacement' })
    ).rejects.toThrow('cannot be updated or deleted');
    await expect(WitnessInterpretation.query().deleteById(interpretation?.id)).rejects.toThrow(
      'cannot be updated or deleted'
    );
    expect(await WitnessTestimony.query().findById(testimony?.id)).toMatchObject({
      original_text: 'Synthetic example: the meeting began sometime in spring.',
    });
  });

  it('rejects raw SQL updates and deletes for every witness record type', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const testimony = await WitnessTestimony.query().findOne({
      external_key: 'synthetic-witness-001',
    });
    const correction = await WitnessCorrection.query().findOne({ sequence: 1 });
    const interpretation = await WitnessInterpretation.query().first();
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

    expect(await WitnessTestimony.query().findById(testimony?.id)).toMatchObject({
      original_text: 'Synthetic example: the meeting began sometime in spring.',
    });
    expect(await WitnessCorrection.query().findById(correction?.id)).toMatchObject({
      correction_text: 'Synthetic correction: the meeting began after noon.',
    });
    expect(await WitnessInterpretation.query().findById(interpretation?.id)).toMatchObject({
      interpretation_text: 'Synthetic hypothesis: the meeting likely began after noon.',
    });
  });

  it('validates correction chain sequence and complete source provenance', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const testimony = await WitnessTestimony.query().findOne({
      external_key: 'synthetic-witness-001',
    });
    const system = await User.query().findOne({ login: 'system' });
    expect(await isNextCorrectionSequence(testimony?.id ?? 0, 2)).toBe(true);
    expect(await isNextCorrectionSequence(testimony?.id ?? 0, 3)).toBe(false);
    expect(
      isValidCorrectionProvenance({
        sequence: 2,
        source_label: 'Archive source',
        source_locator: 'archive://collection/item',
        source_digest: digest,
        asserted_time_text: 'circa 1940',
        asserted_time_precision: 'unknown',
        recorded_by_id: system?.id ?? 0,
      })
    ).toBe(true);
    expect(
      isValidCorrectionProvenance({
        sequence: 2,
        source_label: ' ',
        source_locator: 'archive://collection/item',
        source_digest: 'bad',
        asserted_time_text: 'circa 1940',
        asserted_time_precision: 'unknown',
        recorded_by_id: system?.id ?? 0,
      })
    ).toBe(false);
  });

  it('serializes concurrent correction inserts with the database unique constraint', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const original = await WitnessCorrection.query().findOne({ sequence: 1 });
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        db('knowledge_witness_corrections').insert({
          testimony_id: original?.testimony_id,
          sequence: 2,
          correction_text: 'Concurrent synthetic correction.',
          reason: 'Synthetic concurrent sequence test.',
          source_label: 'Synthetic test',
          source_locator: 'fixture://concurrent-correction',
          source_digest: digest,
          asserted_time_text: 'unknown',
          recorded_by_id: original?.recorded_by_id,
        })
      )
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(
      await WitnessCorrection.query().where({ testimony_id: original?.testimony_id, sequence: 2 })
    ).toHaveLength(1);
  });
});
