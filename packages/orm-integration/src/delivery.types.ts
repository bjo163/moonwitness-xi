/** Request contract shared by the webhook dispatcher and HTTPS transport. */
export interface WebhookDeliveryRequest {
  readonly url: URL;
  readonly targetAddress: string;
  readonly body: string;
  readonly eventId: number;
  readonly eventType: string;
  readonly signature: string;
  readonly idempotencyKey: string;
  readonly signal: AbortSignal;
}
