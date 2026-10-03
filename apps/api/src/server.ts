import { buildApp } from './app.js';
import { config } from './config/env.js';
import { Registry } from '@moonwitness/orm';
import { databaseErrorContext } from './database/errors.js';
import { verifyDefaultBaseAccounts, verifyRequiredModels } from './startup-checks.js';

function startupErrorContext(error: unknown): Record<string, string> {
  const name =
    typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
      ? error.name
      : 'Error';
  const code = databaseErrorContext(error);
  if (Object.keys(code).length > 0) return { name, ...code };
  const message = error instanceof Error ? error.message.slice(0, 300) : 'Unknown startup error';
  return { name, message };
}

async function main() {
  try {
    const app = await buildApp();

    const registeredModels = Registry.getNames();
    verifyRequiredModels(registeredModels);
    await verifyDefaultBaseAccounts(app.db, true);
    if (!(await app.testConnection())) {
      throw new Error(
        'Database readiness check failed; verify DATABASE_URL and PostgreSQL health.'
      );
    }

    const address = await app.listen({ port: config.port, host: config.host });

    app.log.info(
      { address, docs: `${address}/docs`, models: Registry.getNames() },
      'API server listening'
    );

    if (process.env.PRINT_ROUTES !== 'false') {
      const lines = [...app.routeList]
        .sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method))
        .map((r) => `  ${r.method.padEnd(7)} ${r.url}`);
      app.log.info(`Available routes (${lines.length}):\n${lines.join('\n')}`);
    }

    app.log.info('Startup checks passed: database, base addon and default accounts.');

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        app.log.info({ signal }, 'Shutting down gracefully');
        await app.close();
        process.exit(0);
      });
    }
  } catch (err) {
    console.error('API startup failed:', startupErrorContext(err));
    process.exit(1);
  }
}

main();
