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

  it('rejects duplicate correction sequence in the database', async () => {
    await installAddons(db, [baseManifest, manifest]);
    const original = await WitnessCorrection.query().findOne({ sequence: 1 });
    await expect(
      WitnessCorrection.query().insert({
        testimony_id: original?.testimony_id,
        sequence: 1,
        correction_text: 'Duplicate',
        reason: 'Synthetic duplicate sequence test.',
        source_label: 'Synthetic test',
        source_locator: 'fixture://duplicate',
        source_digest: digest,
        asserted_time_text: 'unknown',
        recorded_by_id: original?.recorded_by_id,
      })
    ).rejects.toThrow();
  });
});
