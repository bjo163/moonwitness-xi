# WhatsApp gateway

The Board uses the existing GoWA REST service from `docker-compose.yml`. The API proxies all
provider calls and keeps GoWA credentials server-side; the browser never receives Basic Auth.

## Local development

Start the GoWA and PostgreSQL containers with `docker compose up -d`, then run `pnpm dev`.
GoWA is available to host processes at `http://127.0.0.1:3001`; the Compose development stack
uses `http://whatsapp:3000` on its private network. Set `WHATSAPP_GATEWAY_URL`,
`WHATSAPP_GATEWAY_USERNAME`, and `WHATSAPP_GATEWAY_PASSWORD` in `.env` when the gateway's
address or Basic Auth differs from the local Compose defaults.

Open `http://localhost:5173/board/whatsapp` and choose **Connect WhatsApp**. The API creates a
stable GoWA device slot for the active company, requests its QR, and proxies the QR image to the
Board. Scan it from WhatsApp → Linked devices. Board polls account status, conversations, and
messages from the API; messages are sent through GoWA's REST endpoints, including group chats
and media.

GoWA owns WhatsApp credentials and chat history in its persistent `gowa_storages` volume. The
Moonwitness database stores the company-to-device mapping and a company-scoped inbox cache. API
media downloads are cached in `whatsapp_attachments`. Do not delete either volume while a device
is paired or cached attachments are still needed.

The current development gateway uses GoWA v9.6.0, which supports multiple device slots and
device-scoped chat and send endpoints. One slot is created per Moonwitness company. Keep the
gateway at v8 or newer; older single-device releases do not support this isolation model.

## Production

The production API connects to an independently managed GoWA service. Set
`WHATSAPP_GATEWAY_URL`, `WHATSAPP_GATEWAY_USERNAME`, and `WHATSAPP_GATEWAY_PASSWORD` in the
production environment. Use a private network and HTTPS where traffic crosses hosts. The
production Compose file does not start another WhatsApp runtime; GoWA remains the owner of
paired sessions and its own persistent storage.

The API makes outbound REST calls to GoWA. The Board inbox polls GoWA's chat REST API, so no
inbound webhook or shared internal token is required.

## Verification

- `pnpm test:whatsapp` runs API route tests with a mocked GoWA service.
- `pnpm --filter @moonwitness/api build` and `pnpm --filter @moonwitness/board typecheck`
  check the API connector and Board UI.
- `docker compose ps whatsapp` and `curl http://127.0.0.1:3001/app/info` check the local
  provider. The app-info response reports its deployed GoWA version.

The provider is a linked-device WhatsApp integration, not the official Meta WhatsApp Business
Platform. Keep normal WhatsApp messaging policies and rate limits in mind.
