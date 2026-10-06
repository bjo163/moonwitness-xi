import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAddons } from '@moonwitness/orm';
import { Company, manifest as baseManifest } from '@moonwitness/orm-base';
import { dispatchOneOutboxEvent, jobsManifest, OutboxEvent } from '@moonwitness/jobs';
import { manifest as integrationManifest } from '../src/manifest.js';
import {
  enqueueWebhookEvent,
  registerWebhookOutboxConsumer,
  verifyWebhookSignature,
  type WebhookDeliveryRequest,
  WebhookDelivery,
  WebhookEndpoint,
} from '../src/index.js';

describe('webhook outbox delivery', () => {
  let db: Knex;
  let companyId: number;

  beforeEach(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await installAddons(db, [baseManifest, jobsManifest, integrationManifest]);
    companyId = (await Company.query().findOne({ name: 'MoonWitness' }).throwIfNotFound()).id;
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function addEndpoint(
    targetCompanyId: number,
    name: string,
    url = 'https://receiver.example/hooks'
  ) {
    return WebhookEndpoint.query().insert({
      company_id: targetCompanyId,
      name,
      url,
      event_types: '["base.partner.updated"]',
      secret_ref: `MW_WEBHOOK_SECRET_C${targetCompanyId}_${name.replaceAll(/[^A-Z0-9]/giu, '_').toUpperCase()}`,
      enabled: true,
    });
  }

  async function enqueue(company: number): Promise<number> {
    return db.transaction((transaction) =>
      enqueueWebhookEvent(
        {
          companyId: company,
          eventType: 'base.partner.updated',
          aggregateModel: 'base.partner',
          aggregateId: 42,
          payload: { name: 'Example partner' },
        },
        transaction
      )
    );
  }

  it('filters endpoints by company and retries with stable identity and signature', async () => {
    const endpoint = await addEndpoint(companyId, 'COMPANY_A');
    const secondCompany = await Company.query().insert({ name: 'Other Company' });
    await addEndpoint(secondCompany.id, 'COMPANY_B');
    const eventId = await enqueue(companyId);
    const secret = 's'.repeat(48);
    const requests: WebhookDeliveryRequest[] = [];
    const references: { reference: string; company: number }[] = [];
    let sendAttempts = 0;
    const resolveSecret = async (reference: string, company: number) => {
      references.push({ reference, company });
      return secret;
    };
    const unregister = registerWebhookOutboxConsumer(resolveSecret, {
      resolveAddresses: async () => [{ address: '8.8.8.8', family: 4 }],
      send: async (request) => {
        requests.push(request);
        sendAttempts += 1;
        return sendAttempts === 1 ? 503 : 204;
      },
    });

    try {
      expect(await dispatchOneOutboxEvent('webhook-test-worker')).toBe(true);
      const outbox = await OutboxEvent.query().findById(eventId).throwIfNotFound();
      await OutboxEvent.query()
        .findById(eventId)
        .patch({
          available_at: new Date(Date.now() - 1_000).toISOString(),
        });
      expect(outbox.status).toBe('pending');
      expect(await dispatchOneOutboxEvent('webhook-test-worker')).toBe(true);

      const deliveries = await WebhookDelivery.query().where({ outbox_event_id: eventId });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({
        endpoint_id: endpoint.id,
        company_id: companyId,
        status: 'delivered',
        attempts: 2,
        response_status: 204,
      });
      expect(references).toEqual([
        { reference: endpoint.secret_ref, company: companyId },
        { reference: endpoint.secret_ref, company: companyId },
      ]);
      expect(requests).toHaveLength(2);
      const firstRequest = requests[0];
      const secondRequest = requests[1];
      expect(firstRequest.eventId).toBe(eventId);
      expect(secondRequest.eventId).toBe(eventId);
      expect(firstRequest.idempotencyKey).toBe(`moonwitness:${eventId}`);
      expect(secondRequest.idempotencyKey).toBe(firstRequest.idempotencyKey);
      expect(firstRequest.signature).toBe(secondRequest.signature);
      expect(
        verifyWebhookSignature(
          secret,
          eventId,
          'base.partner.updated',
          firstRequest.body,
          `sha256=${firstRequest.signature}`
        )
      ).toBe(true);
      expect(firstRequest.targetAddress).toBe('8.8.8.8');
    } finally {
      unregister();
    }
  });

  it('records and blocks a private DNS answer before calling the transport', async () => {
    await addEndpoint(companyId, 'BLOCK_PRIVATE');
    const eventId = await enqueue(companyId);
    let sends = 0;
    const unregister = registerWebhookOutboxConsumer(async () => 's'.repeat(48), {
      resolveAddresses: async () => [{ address: '127.0.0.1', family: 4 }],
      send: async () => {
        sends += 1;
        return 204;
      },
    });

    try {
      expect(await dispatchOneOutboxEvent('webhook-test-worker')).toBe(true);
      expect(sends).toBe(0);
      expect(await WebhookDelivery.query().findOne({ outbox_event_id: eventId })).toMatchObject({
        status: 'dead',
        attempts: 1,
        last_error_code: 'WEBHOOK_SSRF_BLOCKED',
      });
      expect(await OutboxEvent.query().findById(eventId)).toMatchObject({ status: 'published' });
    } finally {
      unregister();
    }
  });
});
