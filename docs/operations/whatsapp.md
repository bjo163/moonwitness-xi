# WhatsApp service

The WhatsApp service runs as a separate Go process at `apps/whatsapp` using
[whatsmeow](https://github.com/tulir/whatsmeow). The Board continues to use the authenticated API;
the Go service uses the internal token and PostgreSQL outbox/event endpoints. The API remains the
owner of company scope, inbox data, message history, attachment storage, and retry policy.

## Local development

Install Go 1.26 or newer (the whatsmeow module may select its pinned toolchain automatically),
Node.js 22, pnpm, and the repository PostgreSQL database. Then run `pnpm dev`; it starts API, Board,
and WhatsApp together. `pnpm --filter @moonwitness/whatsapp test` runs Go unit tests,
`pnpm --filter @moonwitness/whatsapp typecheck` runs `go vet`, and `pnpm build` builds the service
alongside the workspace.

The worker reads `.env` from the repository root when it is started by pnpm. `WHATSAPP_DATABASE_URL`
defaults to `DATABASE_URL`; `WHATSAPP_DATABASE_SCHEMA` defaults to `whatsapp_session`. In development,
the worker explicitly defaults `sslmode=disable` only for known local PostgreSQL hosts when the URL
does not specify an SSL mode; explicit SSL settings and all production URLs are preserved.
`WHATSAPP_INTERNAL_TOKEN` and `WHATSAPP_SESSION_KEY` have development-only fallbacks. Production
requires both configured secrets; the session key must be a dedicated high-entropy value of at least
32 bytes.

## Pairing and session storage

Connect the company account from Board and scan the new QR. Baileys authentication data cannot be
imported into whatsmeow, so this migration requires pairing whatsmeow as a linked device. The old
encrypted Baileys `auth_state` remains until the new device connects successfully, then the service
clears that legacy credential. The connected whatsmeow device is saved in PostgreSQL and should
reconnect after a service restart without another scan.

whatsmeow's PostgreSQL SQL store persists device keys in the `whatsapp_session` schema. The worker
encrypts session and cryptographic key bytea fields with AES-256-GCM before they reach PostgreSQL;
the nonce is random per value and authentication failures stop startup/read operations. The key is
derived from `WHATSAPP_SESSION_KEY`, kept outside the database, and must be retained to restore a
backup. Existing plaintext whatsmeow key fields are encrypted during startup before the worker
resumes the device. Lookup identifiers needed for SQL equality/primary keys remain unencrypted.

This application encryption protects whatsmeow device/session material inside database dumps; it
does not encrypt the rest of the application database. Production must still use PostgreSQL storage
encryption and encrypted backups, and set `WHATSAPP_DATABASE_ENCRYPTED_AT_REST=true` only after
confirming both controls with the provider/operator. The app can validate the acknowledgment but
cannot independently verify provider or backup encryption. Protect `WHATSAPP_SESSION_KEY` separately
from database backups; losing it makes encrypted WhatsApp session material unrecoverable. Local
development uses an intentionally unsafe fallback unless a local key is provided.

The worker upgrades the SQLStore schema before adjusting fixed-length checks to allow the authenticated
ciphertext envelope. If an upgrade fails, it refuses to start. Keep `WHATSAPP_SESSION_KEY` stable;
key rotation requires an explicit re-encryption migration and is not automatic.

Never run two WhatsApp workers against the same session store. A PostgreSQL advisory lock prevents
two processes from owning one company account at the same time. Use a direct PostgreSQL connection
for the worker; transaction-pooling proxies do not reliably preserve session advisory locks.

## Runtime behavior

- One linked device per company; account, inbox, and messages remain company scoped by the API.
- HTTP internal routes carry connection state, QR, incoming events, receipts, and media. PostgreSQL
  outbox jobs carry sends with lease heartbeat, attempt fencing, and retries.
- Private and group text/media messages use the existing API attachment limit and message statuses.
- `pnpm start` runs the service through Go; `pnpm start:built` runs the built executable.
- Docker Compose and the production WhatsApp image build a non-root Go runtime. The worker shares the
  configured PostgreSQL service/database and uses the dedicated session schema.

## WhatsApp Status/Story

Status/Story is not included in the Board inbox migration. whatsmeow lists status sending as
experimental; a successful `SendMessage` call alone is not proof that a status was published.
Receiving statuses and viewer receipts also need separate validation. The migration plan tracks a
mock-first capability check; publishing a live status needs explicit approval because WhatsApp may
share it with the linked account's configured audience.

## Checks

- `pnpm test:whatsapp` runs the Go worker tests and API route tests.
- `go test ./...` and `go vet ./...` run in `apps/whatsapp`.
- The workspace unit runner includes Go tests; the PostgreSQL integration suite verifies session
  schema and mapping using an isolated schema.
- The browser suite keeps coverage for QR, inbox, retry, text, and attachment interactions.
