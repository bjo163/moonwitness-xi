import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import ormPlugin from './plugins/orm.plugin.js';
import { genericRoutes } from './routes/generic.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { config } from './config/env.js';
import { createDatabase } from './database/knex.js';
import { databaseErrorCode } from './database/errors.js';
import type { Knex } from 'knex';
import { manifest as baseAddon, initializeSuperadminPassword } from '@moonwitness/orm-base';
import { installAddons } from '@moonwitness/orm';

import { createLogger, type LogLevel } from '@moonwitness/logger';

function errorProperty(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

export async function buildApp(options: { db?: Knex } = {}) {
  const db = options.db ?? createDatabase();
  try {
    await installAddons(db, [baseAddon]);
    await initializeSuperadminPassword(config.superadminPassword);
  } catch (error) {
    if (!options.db) await db.destroy();
    throw error;
  }

  const appLogger = createLogger({
    name: 'api',
    level: (config.log?.level as LogLevel) ?? (config.env === 'test' ? 'silent' : 'info'),
    logDir: config.log?.dir,
    logFileName: config.log?.fileName,
    enableFile: config.log?.enableFile,
    prettyPrint: config.log?.prettyPrint,
  });

  const app = Fastify({
    loggerInstance: appLogger,
  });

  // Security & utility plugins
  await app.register(cors, { origin: true });
  await app.register(sensible);

  // Swagger Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Fastify Objection Knex - Enterprise ORM API',
        description:
          'High-performance Node.js REST and JSON-RPC API built with @moonwitness/orm and Fastify.',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
      tags: [
        { name: 'ORM', description: 'Generic CRUD and RPC endpoints' },
        { name: 'System', description: 'Health and status checks' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });

  // Enterprise ORM Plugin (registers Knex, Objection, Environment, and models)
  await app.register(ormPlugin, { db });
  app.addHook('onClose', async () => db.destroy());

  // Error handling
  app.setErrorHandler((error, request, reply) => {
    const code = databaseErrorCode(error);
    if (code) {
      // Driver errors can contain SQL bindings, including password hashes.
      const name = errorProperty(error, 'name');
      request.log.error({ name, code }, 'Database request failed');
      const conflict =
        name === 'UniqueViolationError' || code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE';
      return reply.status(conflict ? 409 : 500).send({
        success: false,
        error: conflict ? 'Unique constraint violation' : 'Database request failed',
      });
    }
    request.log.error(error);

    // Objection.js ValidationError
    if (errorProperty(error, 'name') === 'ValidationError') {
      const message = error instanceof Error ? error.message : 'Validation failed';
      return reply.status(400).send({
        success: false,
        error: message,
        type: 'ValidationError',
        data: errorProperty(error, 'data'),
      });
    }

    const statusCode = errorProperty(error, 'statusCode');
    return reply.status(typeof statusCode === 'number' ? statusCode : 500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  });

  // Install the handler before route plugins inherit their error handling scope.
  await app.register(healthRoutes);
  await app.register(genericRoutes);

  return app;
}
