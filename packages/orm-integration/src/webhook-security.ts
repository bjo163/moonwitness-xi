import { isIP } from 'node:net';

const MAX_URL_LENGTH = 2048;

function ipv4Number(address: string): number | undefined {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) return undefined;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return undefined;
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
}

function inV4(address: number, network: string, prefix: number): boolean {
  const base = ipv4Number(network);
  if (base === undefined) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

const NON_PUBLIC_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function isPublicWebhookAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const numeric = ipv4Number(address);
    return (
      numeric !== undefined &&
      !NON_PUBLIC_V4.some(([network, prefix]) => inV4(numeric, network, prefix))
    );
  }
  if (family !== 6) return false;
  const normalized = address.toLowerCase().split('%')[0];
  // Only globally routed IPv6 unicast (2000::/3); this excludes mapped IPv4,
  // ULA, link-local, loopback, multicast, and unspecified addresses.
  if (!normalized.startsWith('2') && !normalized.startsWith('3')) return false;
  return !(
    normalized.startsWith('2001:db8:') ||
    normalized.startsWith('2001:0000:') ||
    normalized.startsWith('2002:') ||
    normalized.startsWith('2001:0010:')
  );
}

export function validateWebhookUrl(value: string): URL {
  if (value.length > MAX_URL_LENGTH) throw new Error('WEBHOOK_URL_INVALID');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('WEBHOOK_URL_INVALID');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port !== '' && url.port !== '443') ||
    isIP(url.hostname.replace(/^\[|\]$/gu, '')) !== 0 ||
    url.hostname === 'localhost' ||
    /\.(?:localhost|local|internal)$/iu.test(url.hostname)
  ) {
    throw new Error('WEBHOOK_URL_INVALID');
  }
  return url;
}
