import { buildApp } from './app.js';
import { config } from './config/env.js';
import { Registry } from '@moonwitness/orm';

async function main() {
  const app = await buildApp();

  try {
    const address = await app.listen({ port: config.port, host: config.host });

    app.log.info(
      { address, docs: `${address}/docs`, models: Registry.getNames() },
      'API server listening'
    );

    // Test DB connection in background
    const isDbConnected = await app.testConnection();
    if (!isDbConnected) {
      app.log.warn(
        '⚠️  Database connection could not be established. Ensure PostgreSQL is running.'
      );
      app.log.warn('Check credentials in .env or run `docker compose up -d` (if using Docker).');
    } else {
      app.log.info('Database connection established successfully.');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info({ signal }, 'Shutting down gracefully');
      await app.close();
      process.exit(0);
    });
  }
}

main();
