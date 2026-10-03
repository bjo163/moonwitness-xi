import { defineModel, fields } from '@moonwitness/orm';

/** Format a sequence number with dynamic date tokens %(year)s, %(y)s, %(month)s, %(day)s */
export function formatSequence(
  prefix: string,
  number: number,
  padding: number,
  date: Date = new Date()
): string {
  const year = String(date.getFullYear());
  const y = year.slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const resolvedPrefix = prefix
    .replaceAll('%(year)s', year)
    .replaceAll('%(y)s', y)
    .replaceAll('%(month)s', month)
    .replaceAll('%(day)s', day);

  return `${resolvedPrefix}${String(number).padStart(padding, '0')}`;
}

/** Configurable counter; callers should use nextSequence instead of updating it directly. */
export const Sequence = defineModel('base.sequence', {
  table: 'sequences',
  order: 'code asc',
  fields: {
    code: fields.string({ required: true, unique: true, label: 'Sequence Code' }),
    name: fields.string({ label: 'Sequence Name' }),
    prefix: fields.string({
      required: true,
      default: '',
      label: 'Prefix Format (supports %(year)s, %(month)s, %(day)s)',
    }),
    padding: fields.integer({ required: true, default: 4, label: 'Number Padding' }),
    next_number: fields.integer({ required: true, default: 1, label: 'Next Counter Number' }),
  },
});

/** Allocate the next formatted value under a transaction and row lock. */
export async function nextSequence(code: string, date: Date = new Date()): Promise<string> {
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
    return formatSequence(sequence.prefix, allocated, sequence.padding, date);
  });
}
