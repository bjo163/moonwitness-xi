import type { FastifyPluginAsync } from 'fastify';
import { Notification, NotificationPreference } from '@moonwitness/orm-notification';

interface InboxQuery {
  state?: string;
  limit?: string;
}

interface IdParams {
  id: string;
}

interface ChannelParams {
  channel: string;
}

function bodyObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function countValue(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('count' in value)) return 0;
  const count = value.count;
  return typeof count === 'number' || typeof count === 'string' ? Number(count) : 0;
}

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: InboxQuery }>('/notifications/inbox', async (req, reply) => {
    if (!req.auth)
      return reply.code(401).send({ success: false, error: 'Authentication required' });
    if (!req.auth.companyId)
      return reply.code(403).send({ success: false, error: 'Active company is required' });
    const limit = Number(req.query.limit ?? 30);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      return reply.code(400).send({ success: false, error: 'limit must be between 1 and 100' });
    if (req.query.state && !['unread', 'read', 'archived'].includes(req.query.state))
      return reply.code(400).send({ success: false, error: 'Invalid notification state' });

    let query = Notification.query()
      .where({
        recipient_id: req.auth.userId,
        company_id: req.auth.companyId,
        channel: 'in_app',
        delivery_status: 'delivered',
      })
      .orderBy('create_date', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .select(
        'id',
        'title',
        'body',
        'state',
        'create_date',
        'resource_model',
        'resource_id',
        'delivered_at',
        'read_at'
      );
    if (req.query.state) query = query.where({ state: req.query.state });
    const [notifications, unread] = await Promise.all([
      query,
      Notification.query()
        .where({
          recipient_id: req.auth.userId,
          company_id: req.auth.companyId,
          channel: 'in_app',
          delivery_status: 'delivered',
          state: 'unread',
        })
        .count({ count: '*' })
        .first(),
    ]);
    const unreadCount = countValue(unread);
    return { success: true, data: { notifications, unreadCount } };
  });

  fastify.patch<{ Params: IdParams }>('/notifications/:id/read', async (req, reply) => {
    if (!req.auth)
      return reply.code(401).send({ success: false, error: 'Authentication required' });
    if (!req.auth.companyId)
      return reply.code(403).send({ success: false, error: 'Active company is required' });
    const id = parseId(req.params.id);
    if (id === null)
      return reply.code(400).send({ success: false, error: 'Invalid notification ID' });
    const scope = {
      id,
      recipient_id: req.auth.userId,
      company_id: req.auth.companyId,
      channel: 'in_app' as const,
      delivery_status: 'delivered' as const,
    };
    const current = await Notification.query().findOne(scope);
    if (!current) return reply.code(404).send({ success: false, error: 'Notification not found' });
    if (current.state !== 'read') {
      const now = new Date().toISOString();
      await Notification.query().where(scope).patch({
        state: 'read',
        read_at: now,
        write_uid: req.auth.userId,
        write_date: now,
      });
    }
    return { success: true, data: { id, state: 'read' } };
  });

  fastify.get('/notifications/preferences', async (req, reply) => {
    if (!req.auth)
      return reply.code(401).send({ success: false, error: 'Authentication required' });
    if (!req.auth.companyId)
      return reply.code(403).send({ success: false, error: 'Active company is required' });
    const preferences = await NotificationPreference.query()
      .where({ user_id: req.auth.userId, company_id: req.auth.companyId })
      .select('channel', 'enabled')
      .orderBy('channel', 'asc');
    return { success: true, data: preferences };
  });

  fastify.put<{ Params: ChannelParams; Body: unknown }>(
    '/notifications/preferences/:channel',
    async (req, reply) => {
      if (!req.auth)
        return reply.code(401).send({ success: false, error: 'Authentication required' });
      if (!req.auth.companyId)
        return reply.code(403).send({ success: false, error: 'Active company is required' });
      if (req.params.channel !== 'in_app' && req.params.channel !== 'email')
        return reply.code(400).send({ success: false, error: 'Invalid notification channel' });
      const body = bodyObject(req.body);
      if (!body || Object.keys(body).length !== 1 || typeof body.enabled !== 'boolean')
        return reply
          .code(400)
          .send({ success: false, error: 'Body must contain only enabled:boolean' });
      await NotificationPreference.query()
        .insert({
          user_id: req.auth.userId,
          company_id: req.auth.companyId,
          channel: req.params.channel,
          enabled: body.enabled,
          write_uid: req.auth.userId,
          write_date: new Date().toISOString(),
        })
        .onConflict(['user_id', 'company_id', 'channel'])
        .merge({
          enabled: body.enabled,
          write_uid: req.auth.userId,
          write_date: new Date().toISOString(),
        });
      return { success: true, data: { channel: req.params.channel, enabled: body.enabled } };
    }
  );
};
