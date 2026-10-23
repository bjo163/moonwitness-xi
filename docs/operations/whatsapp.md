# WhatsApp service

The Board's WhatsApp inbox uses the Baileys Web client in `apps/whatsapp`. It is a separate
process from the API and communicates with the API using a private token. Outbound messages are
stored with a PostgreSQL-backed job before the worker sends them. Session credentials are
AES-GCM encrypted with `WHATSAPP_SESSION_KEY`; uploaded media uses the API attachment store.

## Local setup

Add two independent secrets to `.env` before starting the service:

```powershell
node -e "const c=require('node:crypto'); console.log('WHATSAPP_INTERNAL_TOKEN='+c.randomBytes(48).toString('base64url')); console.log('WHATSAPP_SESSION_KEY='+c.randomBytes(32).toString('base64'))"
```

Start PostgreSQL and the API, then run `pnpm dev:whatsapp` in a separate terminal. The Board is
available at `http://localhost:5173/board/whatsapp`. Choose **Connect WhatsApp**, scan the QR code
from Linked devices on the phone, then use the inbox to reply. Keep the session key backed up;
changing it makes existing encrypted sessions unreadable and requires pairing again.

## Production

Set `WHATSAPP_INTERNAL_TOKEN` and `WHATSAPP_SESSION_KEY` in the production environment before
starting `docker-compose.production.yml`. The API and WhatsApp service must receive the same
internal token. The named `whatsapp_attachments` volume stores message media. PostgreSQL stores
account state, encrypted Baileys credentials, conversations, messages, and queued sends.

The inbox supports one linked WhatsApp account per company, private and group chats, text, and
image, video, audio, and document attachments up to 8 MB.
