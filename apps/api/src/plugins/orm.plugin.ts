import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Knex } from 'knex';
import { Environment, Registry, type BaseModel } from '@moonwitness/orm';
import { testConnection } from '../database/knex.js';

declare module 'fastify' {
  interface FastifyInstance {
    knex: Knex;
    env: Environment;
    models: typeof Registry;
    db: Knex;
    testConnection: () => Promise<boolean>;
  }

  interface FastifyRequest {
    env: Environment;
    getModel<T extends typeof BaseModel = typeof BaseModel>(name: string): T;
  }
}

const ormPlugin: FastifyPluginAsync<{ db: Knex }> = async (fastify, options) => {
  // Global decorations
  const globalEnv = new Environment();
  fastify.decorate('knex', options.db);
  fastify.decorate('db', options.db);
  fastify.decorate('env', globalEnv);
  fastify.decorate('models', Registry);

  // Request-scoped decorations
  fastify.decorateRequest('env', null as unknown as Environment);
  fastify.decorateRequest('getModel', function (this: FastifyRequest, name: string) {
    return this.env.get(name);
  });

  fastify.addHook('onRequest', async (request) => {
    const userIdHeader = request.headers['x-user-id'];
    const rawUserId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
    const parsedUserId = rawUserId ? Number(rawUserId) : undefined;
    const userId =
      parsedUserId !== undefined && Number.isInteger(parsedUserId) ? parsedUserId : undefined;
    const lang = (request.headers['accept-language'] || 'en').split(',')[0].trim();
    const activeTest = request.headers['x-active-test'] !== 'false';

    request.env = new Environment({
      userId,
      lang,
      activeTest,
    });
  });

  fastify.decorate('testConnection', () => testConnection(options.db));
};

export default fp(ormPlugin, {
  name: 'fastify-enterprise-orm',
});
