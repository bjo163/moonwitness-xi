import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { Registry } from '@moonwitness/orm';
import type { HealthResponse, RootInfoResponse } from '@moonwitness/types';
import { renderMetrics } from '../observability/metrics.js';

interface HealthRoutesOptions {
  metricsToken?: string;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (fastify, options) => {
  fastify.get('/livez', async (_req, reply) =>
    reply.header('Cache-Control', 'no-store').send({ status: 'alive' })
  );

  const readiness = async (reply: FastifyReply) => {
    const dbOk = await fastify.testConnection();

    const status = dbOk ? 200 : 503;
    const responseBody: HealthResponse = {
      status: dbOk ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbOk ? 'connected' : 'disconnected',
      registeredModels: Registry.getNames(),
    };
    return reply.header('Cache-Control', 'no-store').status(status).send(responseBody);
  };

  fastify.get<{ Reply: HealthResponse }>('/readyz', async (_req, reply) => readiness(reply));
  fastify.get<{ Reply: HealthResponse }>('/health', async (_req, reply) => readiness(reply));

  fastify.get('/metrics', async (request, reply) => {
    const token = options.metricsToken;
    if (!token) return reply.code(404).send({ success: false, error: 'Not found' });
    const authorization = request.headers.authorization ?? '';
    const supplied = authorization.startsWith('Bearer ')
      ? Buffer.from(authorization.slice(7))
      : Buffer.alloc(0);
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return reply.code(401).header('WWW-Authenticate', 'Bearer').send({
        success: false,
        error: 'Authentication required',
      });
    }
    return reply
      .header('Cache-Control', 'no-store')
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(renderMetrics(process.uptime()));
  });

  fastify.get<{ Reply: RootInfoResponse }>('/', async (_req, _reply) => {
    const info: RootInfoResponse = {
      name: 'MoonWitness Enterprise ORM API',
      version: '1.0.0',
      docs: '/docs',
      modelsEndpoint: '/api/models',
      healthEndpoint: '/health',
      jsonrpcEndpoint: '/jsonrpc',
    };
    return info;
  });
};
