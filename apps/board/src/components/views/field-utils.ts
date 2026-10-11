import type { FieldMeta } from '@moonwitness/client';

export type Row = Record<string, unknown>;

/** Relation key Objection uses for a many2one column: `partner_id` → `partner`. */
export const relationKey = (field: FieldMeta) => field.name.replace(/_id$/, '');

/** Best human label for a related record. */
export function displayName(record: Row | null | undefined): string {
  if (!record) return '';
  if (
    record.name &&
    record.code &&
    typeof record.name === 'string' &&
    typeof record.code === 'string'
  ) {
    return `${record.name} [${record.code}]`;
  }
  for (const key of ['name', 'display_name', 'login', 'code', 'email']) {
    if (typeof record[key] === 'string' && record[key]) return record[key];
  }
  return `#${String(record.id)}`;
}
