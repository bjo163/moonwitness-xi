import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { recordHttpRequest } from '../observability/metrics.js';

const observabilityPlugin: FastifyPluginAsync = async (fastify) => {
  const startedAt = new WeakMap<FastifyRequest, number>();
  fastify.addHook('onRequest', async (request) => {
    startedAt.set(request, performance.now());
  });
  fastify.addHook('onResponse', async (request, reply) => {
    const start = startedAt.get(request);
    if (start === undefined) return;
    const route = request.routeOptions.url ?? 'unmatched';
    recordHttpRequest(request.method, route, reply.statusCode, (performance.now() - start) / 1000);
  });
};

export default fp(observabilityPlugin, { name: 'moonwitness-observability' });
