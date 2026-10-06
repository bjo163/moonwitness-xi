# Integration addon

`@moonwitness/orm-integration` adds company-scoped webhook subscriptions on top of the `jobs` outbox. The API and the outbox worker both install its manifest; producers enqueue an event through `enqueueWebhookEvent` inside the same Knex transaction as the business write. The worker selects enabled endpoints for the outbox event's company, applies each endpoint's event-type filter, and stores one delivery per `(endpoint, outbox event)`.

## Configure a receiver

Create an endpoint with an HTTPS URL, a JSON array of event types, a company, and a company-specific environment-variable reference such as `MW_WEBHOOK_SECRET_C1_ACME` for company ID 1. Set `enabled` only after the receiver and secret are configured. The `url`, filter and reference are visible only to the superadmin group through the addon access policy. The database stores the variable name, never its value.

Set the referenced variable in the **outbox worker's** environment. References are restricted to names matching `MW_WEBHOOK_SECRET_C<company-id>_<NAME>` and the worker checks that the company ID in the reference matches the endpoint's company; values must contain 32–4096 characters. The resolver fails closed when a reference is cross-company or missing. Do not put secret values in endpoint records, event payloads, URLs or logs. Rotate a signing secret by updating the environment value; the next attempt uses the new value.

The request is a JSON `POST` with `X-MW-Event-ID`, `X-MW-Event-Type`, `X-MW-Signature: sha256=<hex>`, and `Idempotency-Key: moonwitness:<event-id>`. The signature is HMAC-SHA256 over `<event-id>.<event-type>.<exact-request-body>`. Receivers should compare signatures in constant time, verify the exact raw body, and persist the event ID for deduplication. Outbox delivery is at least once, so receiver-side idempotency is required.

## Network and retry policy

Only HTTPS on port 443 is allowed; URL credentials, fragments, IP literals, localhost and local/internal suffixes are rejected. DNS must return only public addresses, and the connection is pinned to one validated answer while TLS still verifies the hostname. Redirects are not followed. The request is bounded to 10 seconds, event payloads to 256 KiB, and response bodies to 64 KiB. Non-2xx responses retry except ordinary 4xx (permanent), while 408 and 429 remain retryable. The shared outbox applies capped exponential delay and its configured maximum attempts.

The demo endpoint uses `example.invalid`, has no real secret and is disabled. It never sends a request. This package currently provides no general-purpose credential vault or endpoint-specific authorization API; only superadmin model access is seeded. Hosted security analysis and a real receiver round-trip are tracked separately in roadmap evidence and remain required before closing M9.04.
