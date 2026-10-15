import { defineAddon, ref, seed, type Addon } from '@moonwitness/orm';
import { ModelAccess } from '@moonwitness/orm-base';
import { WitnessCorrection, WitnessInterpretation, WitnessTestimony } from './models.js';
import { views } from './views.js';

const syntheticDigest = 'a'.repeat(64);

const installAppendOnlyGuards: NonNullable<Addon['setup']> = async (trx) => {
  const tables = [
    'knowledge_witness_testimonies',
    'knowledge_witness_corrections',
    'knowledge_witness_interpretations',
  ] as const;
  const client = String(trx.client.config.client);

  if (client === 'pg') {
    await trx.raw(`
      CREATE OR REPLACE FUNCTION moonwitness_reject_knowledge_witness_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Knowledge witness records are append-only';
      END;
      $$ LANGUAGE plpgsql
    `);
    for (const table of tables) {
      const trigger = `${table}_append_only`;
      await trx.raw('DROP TRIGGER IF EXISTS ?? ON ??', [trigger, table]);
      await trx.raw(
        'CREATE TRIGGER ?? BEFORE UPDATE OR DELETE ON ?? FOR EACH ROW EXECUTE FUNCTION moonwitness_reject_knowledge_witness_mutation()',
        [trigger, table]
      );
    }
    return;
  }

  if (client === 'better-sqlite3' || client === 'sqlite3') {
    for (const table of tables) {
      await trx.raw(
        `CREATE TRIGGER IF NOT EXISTS ${table}_reject_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'Knowledge witness records are append-only'); END`
      );
      await trx.raw(
        `CREATE TRIGGER IF NOT EXISTS ${table}_reject_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'Knowledge witness records are append-only'); END`
      );
    }
  }
};

export const manifest = defineAddon({
  name: 'knowledge',
  version: '1.0.0',
  depends: ['base'],
  models: [WitnessTestimony, WitnessCorrection, WitnessInterpretation],
  setup: installAppendOnlyGuards,
  data: [
    seed(WitnessTestimony, 'knowledge.synthetic_witness_001', {
      external_key: 'synthetic-witness-001',
      original_text: 'Synthetic example: the meeting began sometime in spring.',
      source_label: 'Synthetic training fixture',
      source_locator: 'fixture://witness/001',
      source_digest: syntheticDigest,
      received_time_text: 'spring',
      received_time_precision: 'unknown',
      uncertainty_note: 'The source says spring but gives no year or exact date.',
      created_by: ref('base.user_system'),
    }),
    seed(WitnessCorrection, 'knowledge.synthetic_witness_001_correction_001', {
      testimony: ref('knowledge.synthetic_witness_001'),
      sequence: 1,
      correction_text: 'Synthetic correction: the meeting began after noon.',
      reason: 'A second synthetic fixture clarifies the time of day.',
      source_label: 'Synthetic correction fixture',
      source_locator: 'fixture://witness/001/correction/001',
      source_digest: 'b'.repeat(64),
      asserted_time_text: '2026-01-01T12:00:00Z',
      asserted_time_precision: 'instant',
      recorded_by: ref('base.user_system'),
    }),
    seed(WitnessInterpretation, 'knowledge.synthetic_witness_001_interpretation_001', {
      testimony: ref('knowledge.synthetic_witness_001'),
      assertion_ref: 'assertion://synthetic/meeting-after-noon',
      evidence_ref: 'evidence://synthetic/witness-001/correction-001',
      interpretation_text: 'Synthetic hypothesis: the meeting likely began after noon.',
      method_label: 'Synthetic source comparison',
      method_version: '1',
      epistemic_status: 'hypothesis',
      recorded_by: ref('base.user_system'),
    }),
    seed(ModelAccess, 'knowledge.access_user_testimony_read', {
      group: ref('base.group_user'),
      model_name: WitnessTestimony.modelName,
      read: false,
      create: false,
      write: false,
      unlink: false,
    }),
    seed(ModelAccess, 'knowledge.access_user_correction_read', {
      group: ref('base.group_user'),
      model_name: WitnessCorrection.modelName,
      read: false,
      create: false,
      write: false,
      unlink: false,
    }),
    seed(ModelAccess, 'knowledge.access_user_interpretation_read', {
      group: ref('base.group_user'),
      model_name: WitnessInterpretation.modelName,
      read: false,
      create: false,
      write: false,
      unlink: false,
    }),
  ],
  views,
  menus: [
    {
      model: WitnessTestimony.modelName,
      label: 'Witness Testimony',
      group: 'Knowledge',
      sequence: 80,
      developmentOnly: true,
    },
    {
      model: WitnessCorrection.modelName,
      label: 'Witness Corrections',
      group: 'Knowledge',
      sequence: 81,
      developmentOnly: true,
    },
    {
      model: WitnessInterpretation.modelName,
      label: 'Witness Interpretations',
      group: 'Knowledge',
      sequence: 82,
      developmentOnly: true,
    },
  ],
});
