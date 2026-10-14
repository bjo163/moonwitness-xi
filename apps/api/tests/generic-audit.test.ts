import { describe, expect, it } from 'vitest';
import { defineModel, fields } from '@moonwitness/orm';
import { auditSnapshot, isAuditSensitiveField } from '../src/routes/generic-audit.js';

const CredentialProbe = defineModel('test.audit_credential_probe', {
  table: 'test_audit_credential_probe',
  fields: {
    name: fields.string(),
    api_key: fields.string(),
    private_key: fields.string(),
    signing_key: fields.string(),
    authorization: fields.string(),
    session_cookie: fields.string(),
    password_hash: fields.string(),
    keyboard_layout: fields.string(),
  },
});

describe('generic audit snapshots', () => {
  it('excludes credential-like declared fields from audit and outbox snapshots', () => {
    const snapshot = auditSnapshot(CredentialProbe, {
      id: 41,
      name: 'Example integration',
      api_key: 'api-key-sentinel',
      private_key: 'private-key-sentinel',
      signing_key: 'signing-key-sentinel',
      authorization: 'authorization-sentinel',
      session_cookie: 'cookie-sentinel',
      password_hash: 'hash-sentinel',
      keyboard_layout: 'dvorak',
      undeclared_secret: 'undeclared-sentinel',
    });

    expect(snapshot).toEqual({
      id: 41,
      name: 'Example integration',
      keyboard_layout: 'dvorak',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/sentinel/u);
  });

  it('recognizes sensitive word boundaries without matching ordinary names', () => {
    for (const name of [
      'password_hash',
      'api_key',
      'apiKey',
      'privateKey',
      'signing_key',
      'authorization',
      'session_cookie',
      'passphrase',
      'refresh_token',
    ]) {
      expect(isAuditSensitiveField(name), name).toBe(true);
    }
    expect(isAuditSensitiveField('keyboard_layout')).toBe(false);
    expect(isAuditSensitiveField('monkey_name')).toBe(false);
  });
});
