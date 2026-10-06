import { request as httpsRequest } from 'node:https';
import type { WebhookDeliveryRequest } from './runtime.js';

const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

interface WebhookTransportOptions {
  /** Internal test seam; production always uses HTTPS port 443 and system trust roots. */
  readonly port?: number;
  readonly ca?: Buffer;
  readonly timeoutMs?: number;
}

export function sendSignedRequest(
  delivery: WebhookDeliveryRequest,
  options: WebhookTransportOptions = {}
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: 'https:',
        hostname: delivery.url.hostname,
        port: options.port ?? 443,
        path: `${delivery.url.pathname}${delivery.url.search}`,
        method: 'POST',
        timeout: REQUEST_TIMEOUT_MS,
        ...(options.ca ? { ca: options.ca } : {}),
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(delivery.body),
          'x-mw-event-id': String(delivery.eventId),
          'x-mw-event-type': delivery.eventType,
          'x-mw-signature': `sha256=${delivery.signature}`,
          'idempotency-key': delivery.idempotencyKey,
        },
        // Pin the TCP connection to the validated DNS result while retaining
        // the original hostname for TLS certificate verification and SNI.
        lookup: (_hostname, lookupOptions, callback) => {
          const address = {
            address: delivery.targetAddress,
            family: delivery.targetAddress.includes(':') ? 6 : 4,
          };
          if (lookupOptions.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (response) => {
        let responseBytes = 0;
        response.on('data', (chunk: Buffer) => {
          responseBytes += chunk.length;
          if (responseBytes > MAX_RESPONSE_BYTES)
            request.destroy(new Error('WEBHOOK_RESPONSE_TOO_LARGE'));
        });
        response.on('end', () => {
          clearTimeout(deadline);
          resolve(response.statusCode ?? 0);
        });
        response.on('error', (error) => {
          clearTimeout(deadline);
          reject(error);
        });
      }
    );
    const deadline = setTimeout(() => request.destroy(new Error('WEBHOOK_TIMEOUT')), timeoutMs);
    deadline.unref?.();
    const abort = () => request.destroy(new Error('WEBHOOK_ABORTED'));
    delivery.signal.addEventListener('abort', abort, { once: true });
    if (delivery.signal.aborted) abort();
    request.on('close', () => {
      delivery.signal.removeEventListener('abort', abort);
      clearTimeout(deadline);
    });
    request.on('timeout', () => request.destroy(new Error('WEBHOOK_TIMEOUT')));
    request.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    request.end(delivery.body);
  });
}
