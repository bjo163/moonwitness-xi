import Fastify from 'fastify';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWhatsappWorker } from './worker.js';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(repositoryRoot, '.env') });
const developmentMode = process.env.NODE_ENV !== 'production';
const apiUrl = (process.env.WHATSAPP_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/u, '');
const internalToken =
  process.env.WHATSAPP_INTERNAL_TOKEN ||
  (developmentMode ? 'moonwitness-local-whatsapp-internal-token-v1-unsafe' : '');
const sessionKey =
  process.env.WHATSAPP_SESSION_KEY ||
  (developmentMode ? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' : '');
const encryptionKey = Buffer.from(sessionKey, 'base64');
const port = Number(process.env.WHATSAPP_PORT ?? 3100);
if (internalToken.length < 32)
  throw new Error('WHATSAPP_INTERNAL_TOKEN must contain at least 32 characters');
if (encryptionKey.length !== 32)
  throw new Error('WHATSAPP_SESSION_KEY must be a base64-encoded 32-byte key');
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('WHATSAPP_PORT must be a valid TCP port');

const worker = createWhatsappWorker({ apiUrl, internalToken, encryptionKey });
const server = Fastify({ logger: true });
server.get('/health', async (_req, reply) => {
  const health = worker.health();
  return reply.code(health.ok ? 200 : 503).send(health);
});
await server.listen({ host: '0.0.0.0', port });
let stopping = false;
async function stop() {
  stopping = true;
  await worker.stop();
  await server.close();
}
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
let waitingForApi = true;
let waitingMessageShown = false;
while (!stopping) {
  try {
    if (waitingForApi) {
      const ready = await fetch(`${apiUrl}/readyz`, { signal: AbortSignal.timeout(3000) });
      if (!ready.ok) throw new Error('API is starting');
      waitingForApi = false;
      waitingMessageShown = false;
    }
    await worker.tick();
  } catch (error) {
    waitingForApi = true;
    if (!waitingMessageShown) {
      console.warn(
        'WhatsApp is waiting for the API; pending work will resume automatically.',
        error instanceof Error ? error.message : 'Request failed'
      );
      waitingMessageShown = true;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
