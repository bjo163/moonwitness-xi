import type { Knex } from 'knex';
import { CompanyMembership, User } from '@moonwitness/orm-base';
import { OutboxEvent, PermanentJobError, registerOutboxConsumer } from '@moonwitness/jobs';
import { Notification, NotificationPreference, NotificationTemplate } from './models.js';

const EVENT_TYPE = 'notification.deliver';

export interface NotificationRequest {
  readonly recipientId: number;
  readonly companyId: number;
  readonly templateCode: string;
  readonly actorId?: number;
  readonly resource?: { readonly model: string; readonly id: number };
}

interface NotificationPayload {
  recipientId: number;
  templateCode: string;
  resource?: { model: string; id: number };
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parsePayload(value: unknown): NotificationPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PermanentJobError('Notification payload must be an object', 'INVALID_NOTIFICATION');
  }
  const payload = value as Record<string, unknown>;
  if (
    !isPositiveId(payload.recipientId) ||
    typeof payload.templateCode !== 'string' ||
    !/^[a-z][a-z0-9_.-]{2,127}$/.test(payload.templateCode)
  ) {
    throw new PermanentJobError('Notification payload is invalid', 'INVALID_NOTIFICATION');
  }
  let resource: NotificationPayload['resource'];
  if (payload.resource !== undefined) {
    if (typeof payload.resource !== 'object' || payload.resource === null) {
      throw new PermanentJobError('Notification resource is invalid', 'INVALID_NOTIFICATION');
    }
    const candidate = payload.resource as Record<string, unknown>;
    if (
      typeof candidate.model !== 'string' ||
      !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(candidate.model) ||
      !isPositiveId(candidate.id)
    ) {
      throw new PermanentJobError('Notification resource is invalid', 'INVALID_NOTIFICATION');
    }
    resource = { model: candidate.model, id: candidate.id };
  }
  return {
    recipientId: payload.recipientId,
    templateCode: payload.templateCode,
    ...(resource ? { resource } : {}),
  };
}

export async function enqueueNotification(
  request: NotificationRequest,
  transaction: Knex.Transaction
): Promise<number> {
  if (
    !isPositiveId(request.recipientId) ||
    !isPositiveId(request.companyId) ||
    !/^[a-z][a-z0-9_.-]{2,127}$/.test(request.templateCode)
  ) {
    throw new Error('Notification request is invalid');
  }
  const payload = {
    recipientId: request.recipientId,
    templateCode: request.templateCode,
    ...(request.resource ? { resource: request.resource } : {}),
  } satisfies NotificationPayload;
  const event = await OutboxEvent.query(transaction).insert({
    event_type: EVENT_TYPE,
    aggregate_model: Notification.modelName,
    aggregate_id: request.recipientId,
    company_id: request.companyId,
    actor_id: request.actorId,
    payload: JSON.stringify(payload),
    available_at: new Date().toISOString(),
  });
  return event.id;
}

async function deliver(payloadValue: unknown, eventId: number, companyId: number | undefined) {
  const payload = parsePayload(payloadValue);
  if (!isPositiveId(companyId)) {
    throw new PermanentJobError('Notification event has no company scope', 'COMPANY_REQUIRED');
  }
  const [recipient, membership, template] = await Promise.all([
    User.query().where({ id: payload.recipientId, active: true }).first(),
    CompanyMembership.query()
      .where({
        user_id: payload.recipientId,
        company_id: companyId,
        active: true,
      })
      .first(),
    NotificationTemplate.query().where({ code: payload.templateCode }).first(),
  ]);
  if (!recipient || !membership) {
    throw new PermanentJobError(
      'Notification recipient is inactive or outside the event company',
      'RECIPIENT_UNAVAILABLE'
    );
  }
  if (!template) {
    throw new PermanentJobError('Notification template was not found', 'TEMPLATE_NOT_FOUND');
  }

  const preference = await NotificationPreference.query().findOne({
    user_id: payload.recipientId,
    company_id: companyId,
    channel: template.channel,
  });
  const enabled = preference?.enabled ?? template.channel === 'in_app';
  // V1 deliberately has no network-capable email implementation.
  const delivered = template.channel === 'in_app' && enabled;
  const now = new Date().toISOString();
  const idempotencyKey = `outbox:${eventId}:recipient:${payload.recipientId}:${template.channel}`;
  await Notification.query()
    .insert({
      recipient_id: payload.recipientId,
      company_id: companyId,
      template_id: template.id,
      channel: template.channel,
      title: template.title,
      body: template.body,
      delivery_status: delivered ? 'delivered' : 'suppressed',
      state: delivered ? 'unread' : 'archived',
      idempotency_key: idempotencyKey,
      resource_model: payload.resource?.model,
      resource_id: payload.resource?.id,
      delivered_at: delivered ? now : undefined,
    })
    .onConflict('idempotency_key')
    .ignore();
}

export function registerNotificationOutboxConsumer(): () => void {
  return registerOutboxConsumer(EVENT_TYPE, async (payload, eventId, context) => {
    await deliver(payload, eventId, context.companyId);
  });
}
