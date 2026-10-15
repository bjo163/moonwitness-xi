import { defineModel, fields, type BaseModel } from '@moonwitness/orm';
import { User } from '@moonwitness/orm-base';
import type { StaticHookArguments } from 'objection';

function testimonyModel(): typeof BaseModel {
  return WitnessTestimony;
}

/** The originally received account, kept distinct from every later correction. */
export const WitnessTestimony = defineModel('knowledge.witness_testimony', {
  table: 'knowledge_witness_testimonies',
  order: 'id asc',
  fields: {
    external_key: fields.string({ required: true, unique: true }),
    original_text: fields.text({ required: true }),
    source_label: fields.string({ required: true }),
    source_locator: fields.string({ required: true }),
    source_digest: fields.string({ required: true, pattern: '^[a-f0-9]{64}$' }),
    received_time_text: fields.string({ required: true }),
    received_time_precision: fields.enum(['instant', 'day', 'month', 'year', 'unknown'], {
      required: true,
      default: 'unknown',
    }),
    uncertainty_note: fields.text(),
    visibility: fields.enum(['RESTRICTED', 'INTERNAL', 'PUBLIC'], {
      required: true,
      default: 'RESTRICTED',
    }),
    created_by: fields.belongsTo(User, { required: true }),
  },
});

/** Corrections are separate append-only assertions; they never replace original_text. */
export const WitnessCorrection = defineModel('knowledge.witness_correction', {
  table: 'knowledge_witness_corrections',
  order: 'testimony_id asc, sequence asc',
  unique: [['testimony', 'sequence']],
  fields: {
    testimony: fields.belongsTo(testimonyModel, { required: true }),
    sequence: fields.integer({ required: true }),
    correction_text: fields.text({ required: true }),
    reason: fields.text({ required: true }),
    source_label: fields.string({ required: true }),
    source_locator: fields.string({ required: true }),
    source_digest: fields.string({ required: true, pattern: '^[a-f0-9]{64}$' }),
    asserted_time_text: fields.string({ required: true }),
    asserted_time_precision: fields.enum(['instant', 'day', 'month', 'year', 'unknown'], {
      required: true,
      default: 'unknown',
    }),
    uncertainty_note: fields.text(),
    recorded_by: fields.belongsTo(User, { required: true }),
  },
});

/** Interpretations cite source records explicitly and never replace testimony text. */
export const WitnessInterpretation = defineModel('knowledge.witness_interpretation', {
  table: 'knowledge_witness_interpretations',
  order: 'testimony_id asc, id asc',
  fields: {
    testimony: fields.belongsTo(testimonyModel, { required: true }),
    assertion_ref: fields.string({ required: true }),
    evidence_ref: fields.string({ required: true }),
    interpretation_text: fields.text({ required: true }),
    method_label: fields.string({ required: true }),
    method_version: fields.string({ required: true }),
    epistemic_status: fields.enum(['hypothesis', 'supported', 'contested', 'rejected'], {
      required: true,
      default: 'hypothesis',
    }),
    visibility: fields.enum(['RESTRICTED', 'INTERNAL', 'PUBLIC'], {
      required: true,
      default: 'RESTRICTED',
    }),
    recorded_by: fields.belongsTo(User, { required: true }),
  },
});

const rejectImmutableMutation = (): never => {
  throw new Error('Witness source records and corrections cannot be updated or deleted');
};

for (const model of [WitnessTestimony, WitnessCorrection, WitnessInterpretation]) {
  model.beforeUpdate = (_args: StaticHookArguments<InstanceType<typeof model>>): never =>
    rejectImmutableMutation();
  model.beforeDelete = (_args: StaticHookArguments<InstanceType<typeof model>>): never =>
    rejectImmutableMutation();
  model.prototype.$beforeUpdate = rejectImmutableMutation;
  model.prototype.$beforeDelete = rejectImmutableMutation;
}

WitnessTestimony.relationMappings = {
  ...WitnessTestimony.relationMappings,
  corrections: {
    relation: WitnessTestimony.HasManyRelation,
    modelClass: WitnessCorrection,
    join: {
      from: 'knowledge_witness_testimonies.id',
      to: 'knowledge_witness_corrections.testimony_id',
    },
  },
};

WitnessCorrection.relationMappings = {
  ...WitnessCorrection.relationMappings,
  testimony_record: {
    relation: WitnessCorrection.BelongsToOneRelation,
    modelClass: WitnessTestimony,
    join: {
      from: 'knowledge_witness_corrections.testimony_id',
      to: 'knowledge_witness_testimonies.id',
    },
  },
};

WitnessInterpretation.relationMappings = {
  ...WitnessInterpretation.relationMappings,
  testimony_record: {
    relation: WitnessInterpretation.BelongsToOneRelation,
    modelClass: WitnessTestimony,
    join: {
      from: 'knowledge_witness_interpretations.testimony_id',
      to: 'knowledge_witness_testimonies.id',
    },
  },
};
