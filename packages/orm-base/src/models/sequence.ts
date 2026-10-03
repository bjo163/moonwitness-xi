import { defineModel, fields } from '@moonwitness/orm';

/** Configurable counter; callers should use nextSequence instead of updating it directly. */
export const Sequence = defineModel('base.sequence', {
  table: 'sequences',
  order: 'code asc',
  fields: {
    code: fields.string({ required: true, unique: true }),
    prefix: fields.string({ required: true, default: '' }),
    padding: fields.integer({ required: true, default: 4 }),
    next_number: fields.integer({ required: true, default: 1 }),
  },
});

/** Allocate the next formatted value under a transaction and row lock. */
export async function nextSequence(code: string): Promise<string> {
  return Sequence.knex().transaction(async (transaction) => {
    const sequence = await Sequence.query(transaction).findOne({ code }).forUpdate();
    if (!sequence) throw new Error(`Sequence '${code}' was not found`);
    if (
      !Number.isInteger(sequence.padding) ||
      sequence.padding < 0 ||
      sequence.padding > 20 ||
      !Number.isInteger(sequence.next_number) ||
      sequence.next_number < 1
    ) {
      throw new Error(`Sequence '${code}' has invalid counter settings`);
    }
    const allocated = sequence.next_number;
    await Sequence.query(transaction)
      .findById(sequence.id)
      .patch({ next_number: allocated + 1 });
    return `${sequence.prefix}${String(allocated).padStart(sequence.padding, '0')}`;
  });
}
