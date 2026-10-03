export function requireProductionDatabaseUrl(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV === 'production' && !environment.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when NODE_ENV=production');
  }
}
