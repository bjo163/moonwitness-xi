export interface DatabaseRuntimeLimits {
  poolMin: number;
  poolMax: number;
  acquireTimeoutMs: number;
  statementTimeoutMs: number;
}

function readInteger(
  values: Record<string, string | undefined>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = values[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function readDatabaseRuntimeLimits(
  values: Record<string, string | undefined>
): DatabaseRuntimeLimits {
  const poolMin = readInteger(values, 'DB_POOL_MIN', 0, 0, 99);
  const poolMax = readInteger(values, 'DB_POOL_MAX', 10, 1, 100);
  if (poolMin > poolMax) throw new Error('DB_POOL_MIN must not exceed DB_POOL_MAX');
  return {
    poolMin,
    poolMax,
    acquireTimeoutMs: readInteger(values, 'DB_ACQUIRE_TIMEOUT_MS', 30_000, 100, 120_000),
    statementTimeoutMs: readInteger(values, 'DB_STATEMENT_TIMEOUT_MS', 30_000, 100, 600_000),
  };
}
