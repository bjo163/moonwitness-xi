import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../src/runtime.js';
import { isPublicWebhookAddress, validateWebhookUrl } from '../src/webhook-security.js';

describe('webhook target validation', () => {
  it.each([
    '0.1.2.3',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:192.168.1.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2001:0000:0000:0000::1',
    '2001:0002::1',
    '2001:db8:ffff::1',
    '2002::1',
    '3fff::1',
    '3fff:0000::1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicWebhookAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public address %s',
    (address) => {
      expect(isPublicWebhookAddress(address)).toBe(true);
    }
  );

  it.each([
    'http://example.com/hook',
    'https://user:pass@example.com/hook',
    'https://example.com:8443/hook',
    'https://localhost/hook',
    'https://service.internal/hook',
    'https://127.0.0.1/hook',
    'https://example.com/hook#fragment',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => validateWebhookUrl(url)).toThrow('WEBHOOK_URL_INVALID');
  });

  it('accepts an HTTPS hostname without credentials or unusual ports', () => {
    expect(validateWebhookUrl('https://hooks.example.com/events').hostname).toBe(
      'hooks.example.com'
    );
  });

  it('verifies signatures against the stable event identity and exact body', () => {
    const body = '{"id":12,"type":"base.partner.updated"}';
    const signature = `sha256=${createHmac('sha256', 'a'.repeat(32))
      .update(`12.base.partner.updated.${body}`, 'utf8')
      .digest('hex')}`;

    expect(
      verifyWebhookSignature('a'.repeat(32), 12, 'base.partner.updated', body, signature)
    ).toBe(true);
    expect(
      verifyWebhookSignature('a'.repeat(32), 13, 'base.partner.updated', body, signature)
    ).toBe(false);
    expect(
      verifyWebhookSignature('a'.repeat(32), 12, 'base.partner.updated', `${body} `, signature)
    ).toBe(false);
    expect(
      verifyWebhookSignature('a'.repeat(32), 12, 'base.partner.updated', body, 'sha256=short')
    ).toBe(false);
  });
});
