# WhatsApp service

The Board's WhatsApp inbox uses the Baileys Web client in `apps/whatsapp`. It is a separate
process from the API and communicates with the API using a private token. Outbound messages are
stored with a PostgreSQL-backed job before the worker sends them. Session credentials are
AES-GCM encrypted with `WHATSAPP_SESSION_KEY`; uploaded media uses the API attachment store.

## Local setup

Run `docker compose up -d` for PostgreSQL, then `pnpm dev`. API (:3000), Board (:5173), and
WhatsApp (:3100) start together. `pnpm dev:whatsapp` starts only the WhatsApp worker.

Local development supplies shared defaults for `WHATSAPP_INTERNAL_TOKEN` and
`WHATSAPP_SESSION_KEY` when they are empty. To keep a session private and portable between
machines, add two independent persistent secrets to `.env`:

```powershell
node -e "const c=require('node:crypto'); console.log('WHATSAPP_INTERNAL_TOKEN='+c.randomBytes(48).toString('base64url')); console.log('WHATSAPP_SESSION_KEY='+c.randomBytes(32).toString('base64'))"
```

The Board is available at `http://localhost:5173/board/whatsapp`. Choose **Connect WhatsApp** and
scan the QR code from Linked devices on the phone. Use **New chat** with an international phone
number or select an existing private/group conversation. Attachments are limited to 8 MB.
Failed messages can be retried with **Retry message** after reconnecting.

`pnpm build` followed by `pnpm start` also starts all three services. The standalone Board uses
port 5173 by default; `BOARD_PORT` (or `PORT`) and `BOARD_HOST` override its listener. API uses
`API_PORT` and WhatsApp uses `WHATSAPP_PORT`; keep all ports distinct. Board's API proxy target
is captured at build time through `BOARD_API_TARGET`. `WHATSAPP_API_URL` configures the worker.
Do not run dev and start simultaneously on the same default ports.

For the optional full Docker development stack, run
`docker compose --profile whatsapp -f docker-compose.yml -f docker-compose.development.yml up --build` instead
of the host `pnpm dev` processes.
The base Compose WhatsApp service is optional under profile `whatsapp`, so plain
`docker compose up -d` starts only PostgreSQL and cannot compete with the host worker.

Keep the session key backed up. A wrong encryption key preserves the encrypted session and
shows an error; restore the correct key before reconnecting. WhatsApp logout clears invalid
credentials and requires scanning another QR. **Disconnect** pauses the local connection and
preserves the session; reconnect resumes it without deliberately logging out the phone.

## Production

Set `WHATSAPP_INTERNAL_TOKEN` and `WHATSAPP_SESSION_KEY` in the production environment before
starting `docker-compose.production.yml`. The API and WhatsApp service must receive the same
internal token. The named `whatsapp_attachments` volume stores message media. PostgreSQL stores
account state, encrypted Baileys credentials, conversations, messages, and queued sends.
Production has no default secrets. Run one WhatsApp worker per database: multiple replicas
must not open competing Baileys sockets for the same company account.

The inbox supports one linked WhatsApp account per company, private and group chats, text, and
image, video, audio, and document attachments up to 8 MB.

## Delivery and recovery

Outbound messages and jobs are committed in one transaction. Jobs use row locks with
`SKIP LOCKED`, attempt fencing, a heartbeat and a 60-second lease. An expired claim is retried
with the same WhatsApp message ID. Automatic retries back off and stop at eight attempts;
manual retry preserves that message ID too. WhatsApp remains an external system, so this is
at-least-once delivery with stable deduplication IDs, not a guarantee of exactly-once delivery.

Incoming callbacks first persist a unique event in `whatsapp_events`, then the worker asks the
API to materialize it into messages and conversations. Storage/database failures roll back,
back off and eventually mark the event dead. Accepted events survive restarts. Events waiting
for an unreachable API are retried in worker memory; killing the worker before API acceptance
can lose them unless WhatsApp replays them. Monitor `pendingIncoming` and `pendingSessions` in
the health response. Do not shut down the worker during an API outage if those counts are nonzero.

Private and group messages, wrapped messages and history batches share the same ingestion
path. History keeps its timestamp and does not increase unread counts. Media that cannot be
downloaded or exceeds the limit leaves an explicit attachment notice. The UI polls account,
conversation and message state through authenticated, company-scoped API routes. Generic model
API mutation is disabled for WhatsApp models, including for administrators.

Health returns 503 before API connectivity is established or after 30 seconds without a
successful API poll. A healthy worker with zero accounts means no company has requested a connection.

## Verification

- `pnpm test:whatsapp`: mocked Baileys worker and API/queue tests on SQLite.
- PostgreSQL: set `WHATSAPP_TEST_POSTGRES=true`, then run
  `pnpm --filter @moonwitness/api exec vitest run tests/whatsapp.routes.test.ts`. Tests use
  `WHATSAPP_TEST_DATABASE_URL` or repository `.env`'s `DATABASE_URL`, create a unique schema, and
  remove only that schema after completion.
- Board: `pnpm --filter @moonwitness/board exec playwright test e2e/whatsapp.spec.ts --project=chromium`.
  Set `POSTGRES_TEST_URL` to a dedicated E2E database. The test runner starts isolated API/Board
  processes and sends WhatsApp operations to mocks; it never sends to actual contacts.

See [verification evidence](../testing/whatsapp-verification.md) for the completed checks and
the boundary between live and mocked delivery tests.
