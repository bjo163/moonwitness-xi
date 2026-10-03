import type { FastifyPluginAsync } from 'fastify';
import { Registry } from '@moonwitness/orm';
import type { HealthResponse, RootInfoResponse } from '@moonwitness/types';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>('/health', async (req, reply) => {
    const dbOk = await fastify.testConnection();

    const status = dbOk ? 200 : 503;
    const responseBody: HealthResponse = {
      status: dbOk ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbOk ? 'connected' : 'disconnected',
      registeredModels: Registry.getNames(),
    };
    return reply.status(status).send(responseBody);
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
