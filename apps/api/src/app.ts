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
import type { Knex } from 'knex';

function errorProperty(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

export async function buildApp(options: { db?: Knex } = {}) {
  const db = options.db ?? createDatabase();
  const app = Fastify({
    logger: {
      level: config.env === 'test' ? 'silent' : 'info',
    },
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

  // Routes
  await app.register(healthRoutes);
  await app.register(genericRoutes);

  // Error handling
  app.setErrorHandler((error, request, reply) => {
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

    // Knex / Database errors
    if (errorProperty(error, 'code') === '23505') {
      // Postgres unique violation
      return reply.status(409).send({
        success: false,
        error: 'Unique constraint violation',
        detail: errorProperty(error, 'detail'),
      });
    }

    const statusCode = errorProperty(error, 'statusCode');
    return reply.status(typeof statusCode === 'number' ? statusCode : 500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  });

  return app;
}
