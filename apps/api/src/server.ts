import { buildApp } from './app.js';
import { config } from './config/env.js';
import { Registry } from '@moonwitness/orm';
import { formatStartupFailure, startupErrorContext } from './startup-diagnostics.js';
import { verifyDefaultBaseAccounts, verifyRequiredModels } from './startup-checks.js';
import { gracefulShutdown } from './lifecycle/graceful-shutdown.js';

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

    // Stop accepting traffic and let Fastify drain requests before closing the pool.
    let shutdownInProgress = false;
    const shutdown = async (signal: NodeJS.Signals) => {
      if (shutdownInProgress) return;
      shutdownInProgress = true;
      try {
        await gracefulShutdown(
          {
            close: () => app.close(),
            closeConnections: () => app.server.closeAllConnections(),
            log: (level, message) => {
              if (level === 'info') app.log.info({ signal }, message);
              else app.log.error({ signal }, message);
            },
          },
          signal
        );
      } catch (error) {
        app.log.error({ err: startupErrorContext(error) }, 'API shutdown failed');
        process.exitCode = 1;
      }
    };

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.once(signal, () => void shutdown(signal));
    }
  } catch (err) {
    console.error(formatStartupFailure(err));
    process.exit(1);
  }
}

main();
