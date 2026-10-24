type GowaEnvelope<T> = { code?: string; message?: string; results?: T; status?: number };

function baseUrl(): string {
  return (process.env.WHATSAPP_GATEWAY_URL || 'http://127.0.0.1:3001').replace(/\/$/u, '');
}

function authorization(): string {
  const username = process.env.WHATSAPP_GATEWAY_USERNAME || 'moonwitness';
  const password = process.env.WHATSAPP_GATEWAY_PASSWORD || 'moonwitness';
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

export class GowaError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly upstreamCode?: string
  ) {
    super(message);
  }
}

export async function gowaRequest<T>(
  path: string,
  options: {
    method?: string;
    deviceId?: string;
    body?: string | FormData;
    contentType?: string;
  } = {}
): Promise<T> {
  const headers = new Headers({ authorization: authorization() });
  if (options.deviceId) headers.set('X-Device-Id', options.deviceId);
  if (options.contentType) headers.set('content-type', options.contentType);
  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body,
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let envelope: GowaEnvelope<T> | null = null;
  try {
    envelope = raw ? (JSON.parse(raw) as GowaEnvelope<T>) : null;
  } catch {
    // Some GOWA endpoints return plain text for successful downloads.
  }
  if (!response.ok || (envelope?.code && envelope.code !== 'SUCCESS')) {
    throw new GowaError(
      envelope?.message || `WhatsApp gateway request failed (${response.status})`,
      response.status,
      envelope?.code
    );
  }
  return (envelope?.results ?? envelope) as T;
}

export async function gowaBinary(path: string, deviceId?: string): Promise<Response> {
  const headers = new Headers({ authorization: authorization() });
  if (deviceId) headers.set('X-Device-Id', deviceId);
  const response = await fetch(`${baseUrl()}${path}`, {
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new GowaError(`WhatsApp gateway request failed (${response.status})`, response.status);
  return response;
}

export function gowaOriginPath(value: string): string {
  const requested = new URL(value, baseUrl());
  if (
    !['http:', 'https:'].includes(requested.protocol) ||
    !requested.pathname.startsWith('/statics/')
  )
    throw new GowaError('WhatsApp gateway returned an invalid media URL', 502);
  return `${requested.pathname}${requested.search}`;
}
