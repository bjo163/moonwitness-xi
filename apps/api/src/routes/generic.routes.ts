import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { databaseErrorCode } from '../database/errors.js';
import { Registry, type BaseModel, type Domain } from '@moonwitness/orm';
import type { JsonValue } from '@moonwitness/types';
import type {
  ActionRequestBody,
  DeleteQueryParams,
  ModelActionParam,
  ModelIdParam,
  ModelListResponse,
  ModelParam,
  SearchQueryParams,
} from '@moonwitness/types';

type JsonObject = { [key: string]: JsonValue };
type RpcEnvelope = {
  jsonrpc?: unknown;
  method?: unknown;
  params?: unknown;
  id?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asJsonObject(value: unknown): JsonObject | null {
  return isObject(value) && Object.values(value).every(isJsonValue) ? (value as JsonObject) : null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isObject(value) && Object.values(value).every(isJsonValue);
}

function errorMessage(error: unknown, fallback: string): string {
  if (databaseErrorCode(error)) return fallback;
  return error instanceof Error ? error.message : fallback;
}

function parseInteger(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === '') return fallback;
  if (!/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function resolveModel(name: string) {
  return Registry.has(name) ? Registry.get(name) : null;
}

function requireId(value: string, reply: FastifyReply): number | null {
  const id = parseInteger(value);
  if (id === undefined || id < 1) {
    reply.status(400).send({ success: false, error: 'Invalid ID parameter' });
    return null;
  }
  return id;
}

function modelNotFound(name: string) {
  return {
    success: false,
    error: `Model '${name}' not found. Available models: ${Registry.getNames().join(', ')}`,
  };
}

function recordNotFound(name: string, id: number) {
  return { success: false, error: `Record #${id} of model '${name}' not found` };
}

async function executeRpc(
  model: typeof BaseModel,
  method: string,
  args: JsonValue[],
  kwargs: Record<string, JsonValue>
): Promise<JsonValue> {
  const [first, second] = args;
  const domain = Array.isArray(first) ? (first as Domain) : [];
  switch (method) {
    case 'search_read':
      return (await model.search_read(
        domain,
        kwargs as Parameters<typeof model.search_read>[1]
      )) as JsonValue;
    case 'search':
      return (await model.search(domain, kwargs as Parameters<typeof model.search>[1])).map(
        (record) => record.id
      );
    case 'create': {
      const values = first;
      if (values === undefined || !(Array.isArray(values) || asJsonObject(values)))
        throw new Error('create expects an object or array of objects');
      const created = await model.create(values as JsonObject | JsonObject[]);
      return Array.isArray(created) ? created.map((record) => record.id) : created.id;
    }
    case 'write': {
      const ids =
        typeof first === 'number'
          ? first
          : Array.isArray(first)
            ? first.filter((id): id is number => typeof id === 'number')
            : [];
      const values = asJsonObject(second);
      if (values === null) throw new Error('write expects IDs and an object of values');
      return await model.write(ids, values);
    }
    case 'unlink': {
      const ids =
        typeof first === 'number'
          ? first
          : Array.isArray(first)
            ? first.filter((id): id is number => typeof id === 'number')
            : [];
      return await model.unlink(ids);
    }
    default:
      throw new Error(`Method '${method}' is not exposed`);
  }
}

export const genericRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: ModelListResponse }>('/api/models', async () => ({
    success: true,
    models: Registry.getNames().map((name) => ({
      model: name,
      table: Registry.get(name).tableName,
    })),
  }));

  fastify.get<{ Params: ModelParam; Querystring: SearchQueryParams }>(
    '/api/:model',
    async (req, reply) => {
      const Model = resolveModel(req.params.model);
      if (!Model) return reply.status(404).send(modelNotFound(req.params.model));

      let domain: Domain = [];
      if (req.query.domain) {
        try {
          const parsed: unknown = JSON.parse(req.query.domain);
          if (!Array.isArray(parsed)) throw new Error('Domain must be an array');
          domain = parsed as Domain;
        } catch {
          return reply
            .status(400)
            .send({ success: false, error: 'Invalid domain; expected a JSON domain array' });
        }
      }

      const limit = parseInteger(req.query.limit, 80);
      const offset = parseInteger(req.query.offset, 0);
      if (limit === undefined || limit < 0 || limit > 500 || offset === undefined || offset < 0) {
        return reply.status(400).send({
          success: false,
          error: 'limit must be 0–500 and offset must be non-negative integers',
        });
      }
      const fields = req.query.fields
        ?.split(',')
        .map((field) => field.trim())
        .filter(Boolean);
      const options = {
        fields,
        limit,
        offset,
        order: req.query.order,
        withGraphFetched: req.query.with,
      };
      const [records, total] = await Promise.all([
        Model.search_read(domain, options),
        req.query.count === 'true' ? Model.search_count(domain) : Promise.resolve(undefined),
      ]);
      return {
        success: true,
        model: req.params.model,
        count: records.length,
        total,
        data: records,
      };
    }
  );

  fastify.get<{ Params: ModelIdParam; Querystring: { with?: string } }>(
    '/api/:model/:id',
    async (req, reply) => {
      const Model = resolveModel(req.params.model);
      if (!Model) return reply.status(404).send(modelNotFound(req.params.model));
      const id = requireId(req.params.id, reply);
      if (id === null) return;
      const record = await Model.browse(id, { withGraphFetched: req.query.with });
      if (!record) return reply.status(404).send(recordNotFound(req.params.model, id));
      return { success: true, model: req.params.model, data: record };
    }
  );

  fastify.post<{ Params: ModelParam; Body: unknown }>('/api/:model', async (req, reply) => {
    const Model = resolveModel(req.params.model);
    if (!Model) return reply.status(404).send(modelNotFound(req.params.model));
    const body = req.body;
    const values = Array.isArray(body) ? body.map(asJsonObject) : [asJsonObject(body)];
    if (values.some((value) => value === null))
      return reply
        .status(400)
        .send({ success: false, error: 'Request body must be a JSON object or array of objects' });
    const created = await Model.create(
      Array.isArray(body) ? (values as JsonObject[]) : (values[0] as JsonObject)
    );
    return reply.status(201).send({ success: true, model: req.params.model, data: created });
  });

  const updateHandler = async (
    req: FastifyRequest<{ Params: ModelIdParam; Body: unknown }>,
    reply: FastifyReply
  ) => {
    const Model = resolveModel(req.params.model);
    if (!Model) return reply.status(404).send(modelNotFound(req.params.model));
    const id = requireId(req.params.id, reply);
    if (id === null) return;
    const record = (await Model.browse(id)) as BaseModel | null;
    if (!record) return reply.status(404).send(recordNotFound(req.params.model, id));
    const values = asJsonObject(req.body);
    if (values === null)
      return reply
        .status(400)
        .send({ success: false, error: 'Request body must be a JSON object' });
    const updated = await record.write(values);
    return { success: true, model: req.params.model, data: updated };
  };
  fastify.put<{ Params: ModelIdParam; Body: unknown }>('/api/:model/:id', updateHandler);
  fastify.patch<{ Params: ModelIdParam; Body: unknown }>('/api/:model/:id', updateHandler);

  fastify.delete<{ Params: ModelIdParam; Querystring: DeleteQueryParams }>(
    '/api/:model/:id',
    async (req, reply) => {
      const Model = resolveModel(req.params.model);
      if (!Model) return reply.status(404).send(modelNotFound(req.params.model));
      const id = requireId(req.params.id, reply);
      if (id === null) return;
      const record = (await Model.browse(id)) as BaseModel | null;
      if (!record) return reply.status(404).send(recordNotFound(req.params.model, id));
      const hardDelete = req.query.hard === 'true';
      await record.unlink(hardDelete);
      return {
        success: true,
        model: req.params.model,
        message: hardDelete
          ? `Record #${id} permanently deleted`
          : `Record #${id} archived (active: false)`,
      };
    }
  );

  fastify.post<{ Params: ModelActionParam; Body: ActionRequestBody }>(
    '/api/:model/:id/action/:method',
    async (req, reply) => {
      const Model = resolveModel(req.params.model);
      if (!Model) return reply.status(404).send(modelNotFound(req.params.model));
      const id = requireId(req.params.id, reply);
      if (id === null) return;
      const record = (await Model.browse(id)) as BaseModel | null;
      if (!record) return reply.status(404).send(recordNotFound(req.params.model, id));
      if (!Model.exposedActions.includes(req.params.method)) {
        return reply
          .status(400)
          .send({ success: false, error: `Action '${req.params.method}' is not exposed` });
      }
      const action = record[req.params.method as keyof BaseModel];
      if (typeof action !== 'function' || !req.params.method.startsWith('action_')) {
        return reply
          .status(400)
          .send({ success: false, error: `Action '${req.params.method}' is invalid` });
      }
      const result: unknown = await Reflect.apply(action, record, []);
      const jsonResult = isJsonValue(result) ? result : (record.toJSON() as JsonValue);
      return {
        success: true,
        model: req.params.model,
        id,
        method: req.params.method,
        result: jsonResult,
      };
    }
  );

  fastify.post<{ Body: unknown }>('/jsonrpc', async (req, reply) => {
    const body: unknown = req.body;
    const envelope: RpcEnvelope = isObject(body) ? body : {};
    const id =
      typeof envelope.id === 'string' || typeof envelope.id === 'number' || envelope.id === null
        ? envelope.id
        : null;
    const params = isObject(envelope.params) ? envelope.params : {};
    const rpcError = (code: number, message: string) => ({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    });
    if (
      envelope.method !== 'call' ||
      params.service !== 'object' ||
      params.method !== 'execute_kw' ||
      !Array.isArray(params.args)
    ) {
      return reply.status(400).send(rpcError(-32600, 'Invalid JSON-RPC Request'));
    }
    const [modelName, method, rawArgs, rawKwargs] = params.args;
    if (typeof modelName !== 'string' || typeof method !== 'string')
      return reply.status(400).send(rpcError(-32602, 'Invalid execute_kw arguments'));
    const Model = resolveModel(modelName);
    if (!Model) return reply.send(rpcError(-32000, `Model '${modelName}' not found`));
    const args = Array.isArray(rawArgs) && rawArgs.every(isJsonValue) ? rawArgs : [];
    const kwargs = asJsonObject(rawKwargs) ?? {};
    try {
      return { jsonrpc: '2.0', id, result: await executeRpc(Model, method, args, kwargs) };
    } catch (error) {
      return reply.send(rpcError(-32601, errorMessage(error, 'Execution error')));
    }
  });
};
