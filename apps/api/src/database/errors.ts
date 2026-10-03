/** Driver errors may contain SQL bindings; expose only a safe code. */
export function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('nativeError' in error) return databaseErrorCode(error.nativeError) ?? 'DATABASE_ERROR';
  if (
    'code' in error &&
    typeof error.code === 'string' &&
    (error.code.startsWith('SQLITE_') || /^[0-9A-Z]{5}$/.test(error.code))
  )
    return error.code;
  return undefined;
}

const ERROR_CATEGORIES: Readonly<Record<string, string>> = {
  '22P02': 'invalid_text_representation',
  '23502': 'not_null_violation',
  '23503': 'foreign_key_violation',
  '23505': 'unique_violation',
  '23514': 'check_violation',
  '42601': 'syntax_error',
  '42703': 'undefined_column',
  '42803': 'grouping_error',
  '42P01': 'undefined_table',
  SQLITE_BUSY: 'database_busy',
  SQLITE_BUSY_SNAPSHOT: 'database_busy',
  SQLITE_CONSTRAINT_UNIQUE: 'unique_violation',
};

function errorObject(error: unknown): Record<string, unknown> | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as Record<string, unknown>;
  const native = record.nativeError;
  if (typeof native === 'object' && native !== null) return errorObject(native) ?? record;
  return record;
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9_.$-]{1,128}$/.test(value) ? value : undefined;
}

/** Allowlisted SQL diagnostics only; never return SQL, bindings, detail, hint, or message. */
export function databaseErrorContext(error: unknown): Record<string, string> {
  const code = databaseErrorCode(error);
  const record = errorObject(error);
  const constraint = safeIdentifier(record?.constraint);
  const table = safeIdentifier(record?.table);
  const column = safeIdentifier(record?.column);
  const schema = safeIdentifier(record?.schema);
  return {
    ...(code ? { code } : {}),
    ...(code && ERROR_CATEGORIES[code] ? { category: ERROR_CATEGORIES[code] } : {}),
    ...(constraint ? { constraint } : {}),
    ...(table ? { table } : {}),
    ...(column ? { column } : {}),
    ...(schema ? { schema } : {}),
  };
}
