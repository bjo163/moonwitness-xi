import { createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import type { Knex } from 'knex';
import { OutboxEvent, PermanentJobError, registerOutboxConsumer } from '@moonwitness/jobs';
import { WebhookDelivery, WebhookEndpoint } from './models.js';
import { isPublicWebhookAddress, validateWebhookUrl } from './webhook-security.js';

const EVENT_TYPE = 'integration.webhook.dispatch';
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

export interface WebhookEventRequest {
  readonly companyId: number;
  readonly eventType: string;
  readonly aggregateModel: string;
  readonly aggregateId: number;
  readonly payload: unknown;
  readonly actorId?: number;
}

export type WebhookSecretResolver = (
  secretRef: string,
  companyId: number
) => Promise<string | null>;

interface DispatchPayload {
  companyId: number;
  eventType: string;
  aggregateModel: string;
  aggregateId: number;
  payload: unknown;
}

interface EndpointRecord {
  id: number;
  company_id: number;
  name: string;
  url: string;
  event_types: string;
  secret_ref: string;
  enabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parseDispatchPayload(value: unknown): DispatchPayload {
  if (
    !isRecord(value) ||
    !isPositiveId(value.companyId) ||
    typeof value.eventType !== 'string' ||
    !/^[a-z][a-z0-9_.-]{2,127}$/u.test(value.eventType) ||
    typeof value.aggregateModel !== 'string' ||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(value.aggregateModel) ||
    !isPositiveId(value.aggregateId) ||
    !('payload' in value)
  ) {
    throw new PermanentJobError('Webhook event is invalid', 'INVALID_WEBHOOK_EVENT');
  }
  return {
    companyId: value.companyId,
    eventType: value.eventType,
    aggregateModel: value.aggregateModel,
    aggregateId: value.aggregateId,
    payload: value.payload,
  };
}

function parseEventTypes(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PermanentJobError('Webhook endpoint event filter is invalid', 'INVALID_EVENT_FILTER');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > 100 ||
    parsed.some((item) => typeof item !== 'string' || !/^[a-z][a-z0-9_.-]{2,127}$/u.test(item))
  ) {
    throw new PermanentJobError('Webhook endpoint event filter is invalid', 'INVALID_EVENT_FILTER');
  }
  return parsed;
}

export async function enqueueWebhookEvent(
  request: WebhookEventRequest,
  transaction: Knex.Transaction
): Promise<number> {
  if (
    !isPositiveId(request.companyId) ||
    !isPositiveId(request.aggregateId) ||
    !/^[a-z][a-z0-9_.-]{2,127}$/u.test(request.eventType) ||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(request.aggregateModel)
  ) {
    throw new Error('Webhook event request is invalid');
  }
  const payload = {
    companyId: request.companyId,
    eventType: request.eventType,
    aggregateModel: request.aggregateModel,
    aggregateId: request.aggregateId,
    payload: request.payload,
  } satisfies DispatchPayload;
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new Error('Webhook event payload exceeds the 256 KiB limit');
  }
  const event = await OutboxEvent.query(transaction).insert({
    event_type: EVENT_TYPE,
    aggregate_model: request.aggregateModel,
    aggregate_id: request.aggregateId,
    company_id: request.companyId,
    actor_id: request.actorId,
    payload: serialized,
    available_at: new Date().toISOString(),
  });
  return event.id;
}

async function resolvePublicTarget(url: URL): Promise<string> {
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('WEBHOOK_DNS_FAILED');
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicWebhookAddress(address))) {
    throw new PermanentJobError(
      'Webhook target resolves to a non-public address',
      'WEBHOOK_SSRF_BLOCKED'
    );
  }
  return addresses[0].address;
}

function sendSignedRequest(
  url: URL,
  targetAddress: string,
  body: string,
  eventId: number,
  eventType: string,
  secret: string,
  signal: AbortSignal
): Promise<number> {
  const signature = createHmac('sha256', secret)
    .update(`${eventId}.${eventType}.${body}`, 'utf8')
    .digest('hex');
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-mw-event-id': String(eventId),
          'x-mw-event-type': eventType,
          'x-mw-signature': `sha256=${signature}`,
          'idempotency-key': `moonwitness:${eventId}`,
        },
        // Pin the TCP connection to the validated DNS result while retaining
        // the original hostname for TLS certificate verification and SNI.
        lookup: (_hostname, _options, callback) =>
          callback(null, targetAddress, targetAddress.includes(':') ? 6 : 4),
      },
      (response) => {
        let responseBytes = 0;
        response.on('data', (chunk: Buffer) => {
          responseBytes += chunk.length;
          if (responseBytes > MAX_RESPONSE_BYTES)
            request.destroy(new Error('WEBHOOK_RESPONSE_TOO_LARGE'));
        });
        response.on('end', () => resolve(response.statusCode ?? 0));
        response.on('error', reject);
      }
    );
    const abort = () => request.destroy(new Error('WEBHOOK_ABORTED'));
    signal.addEventListener('abort', abort, { once: true });
    request.on('close', () => signal.removeEventListener('abort', abort));
    request.on('timeout', () => request.destroy(new Error('WEBHOOK_TIMEOUT')));
    request.on('error', reject);
    request.end(body);
  });
}

async function deliverEndpoint(
  endpoint: EndpointRecord,
  event: DispatchPayload,
  eventId: number,
  resolveSecret: WebhookSecretResolver,
  signal: AbortSignal
): Promise<void> {
  const prior = await WebhookDelivery.query().findOne({
    endpoint_id: endpoint.id,
    outbox_event_id: eventId,
  });
  if (prior?.status === 'delivered' || prior?.status === 'dead') return;
  const attempt = (prior?.attempts ?? 0) + 1;
  const deliveryValues = {
    endpoint_id: endpoint.id,
    company_id: event.companyId,
    outbox_event_id: eventId,
    event_type: event.eventType,
    status: 'retrying' as const,
    attempts: attempt,
  };
  if (prior) await WebhookDelivery.query().findById(prior.id).patch(deliveryValues);
  else await WebhookDelivery.query().insert(deliveryValues);

  try {
    const url = validateWebhookUrl(endpoint.url);
    const [target, secret] = await Promise.all([
      resolvePublicTarget(url),
      resolveSecret(endpoint.secret_ref, event.companyId),
    ]);
    if (!secret || secret.length < 32 || secret.length > 4096) {
      throw new PermanentJobError(
        'Webhook signing secret is unavailable or invalid',
        'WEBHOOK_SECRET_UNAVAILABLE'
      );
    }
    const body = JSON.stringify({
      id: eventId,
      type: event.eventType,
      companyId: event.companyId,
      aggregate: { model: event.aggregateModel, id: event.aggregateId },
      data: event.payload,
    });
    if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new PermanentJobError(
        'Webhook payload exceeds the size limit',
        'WEBHOOK_PAYLOAD_TOO_LARGE'
      );
    }
    const status = await sendSignedRequest(
      url,
      target,
      body,
      eventId,
      event.eventType,
      secret,
      signal
    );
    if (status >= 200 && status < 300) {
      await WebhookDelivery.query()
        .findOne({ endpoint_id: endpoint.id, outbox_event_id: eventId })
        .patch({
          status: 'delivered',
          response_status: status,
          delivered_at: new Date().toISOString(),
        });
      return;
    }
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      throw new PermanentJobError(`Webhook receiver returned HTTP ${status}`, 'WEBHOOK_REJECTED');
    }
    if (status >= 300 && status < 400) {
      throw new PermanentJobError(
        'Webhook redirects are not followed',
        'WEBHOOK_REDIRECT_REJECTED'
      );
    }
    throw new Error(`WEBHOOK_HTTP_${status}`);
  } catch (error) {
    const code =
      error instanceof PermanentJobError
        ? error.code
        : error instanceof Error && /^[A-Z0-9_]{1,80}$/u.test(error.message)
          ? error.message
          : 'WEBHOOK_DELIVERY_FAILED';
    await WebhookDelivery.query()
      .findOne({ endpoint_id: endpoint.id, outbox_event_id: eventId })
      .patch({
        status: error instanceof PermanentJobError ? 'dead' : 'retrying',
        last_error_code: code,
      });
    throw error;
  }
}

async function deliver(
  payloadValue: unknown,
  eventId: number,
  companyId: number | undefined,
  resolveSecret: WebhookSecretResolver,
  signal: AbortSignal
): Promise<void> {
  const event = parseDispatchPayload(payloadValue);
  if (companyId !== event.companyId || !isPositiveId(companyId)) {
    throw new PermanentJobError(
      'Webhook event company scope does not match',
      'COMPANY_SCOPE_MISMATCH'
    );
  }
  const endpoints = (await WebhookEndpoint.query()
    .where({ company_id: companyId, enabled: true })
    .orderBy('id', 'asc')) as (InstanceType<typeof WebhookEndpoint> & EndpointRecord)[];
  for (const endpoint of endpoints) {
    try {
      if (!parseEventTypes(endpoint.event_types).includes(event.eventType)) continue;
      await deliverEndpoint(endpoint, event, eventId, resolveSecret, signal);
    } catch (error) {
      if (error instanceof PermanentJobError) {
        if (error.code === 'INVALID_EVENT_FILTER') {
          const existing = await WebhookDelivery.query().findOne({
            endpoint_id: endpoint.id,
            outbox_event_id: eventId,
          });
          const values = {
            endpoint_id: endpoint.id,
            company_id: companyId,
            outbox_event_id: eventId,
            event_type: event.eventType,
            status: 'dead' as const,
            attempts: existing?.attempts ?? 1,
            last_error_code: error.code,
          };
          if (existing) await WebhookDelivery.query().findById(existing.id).patch(values);
          else await WebhookDelivery.query().insert(values);
        }
        continue;
      }
      throw error;
    }
  }
}

export function registerWebhookOutboxConsumer(resolveSecret: WebhookSecretResolver): () => void {
  return registerOutboxConsumer(EVENT_TYPE, async (payload, eventId, context) => {
    await deliver(payload, eventId, context.companyId, resolveSecret, context.signal);
  });
}

export function verifyWebhookSignature(
  secret: string,
  eventId: number,
  eventType: string,
  body: string,
  signature: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(`${eventId}.${eventType}.${body}`, 'utf8')
    .digest();
  const suppliedHex = signature.startsWith('sha256=') ? signature.slice(7) : '';
  if (!/^[a-f0-9]{64}$/iu.test(suppliedHex)) return false;
  const supplied = Buffer.from(suppliedHex, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
