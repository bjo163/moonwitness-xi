import { BaseModel } from '@moonwitness/orm';
import { isJsonValue, isRecord, type JsonObject } from '@moonwitness/types';

const AUDIT_SENSITIVE_FIELD =
  /(?:^|[_-])(?:password|passwd|passphrase|token|secret|credential|hash|salt|authorization|cookie|key)(?:$|[_-])/;

/** Normalize camelCase first so API keys and private keys match the same policy as snake_case fields. */
export function isAuditSensitiveField(name: string): boolean {
  const normalized = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return AUDIT_SENSITIVE_FIELD.test(normalized);
}

/** Snapshot safe, declared model fields for the transactional audit log and outbox. */
export function auditSnapshot(model: typeof BaseModel, record: unknown): JsonObject {
  const source = record instanceof BaseModel ? record.toJSON() : record;
  if (!isRecord(source)) return {};
  const fields = model.fields;
  const keys = new Set([
    'id',
    'active',
    'create_date',
    'write_date',
    'create_uid',
    'write_uid',
    ...(fields ? Object.keys(fields) : Object.keys(source)),
    ...Object.entries(fields ?? {})
      .filter(([, field]) => field.kind === 'belongsTo')
      .map(([key]) => `${key}_id`),
  ]);
  const modelHidden = new Set(model.hiddenFields ?? []);
  const snapshot: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (keys.has(key) && !modelHidden.has(key) && !isAuditSensitiveField(key) && isJsonValue(value))
      snapshot[key] = value;
  }
  return snapshot;
}
