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
