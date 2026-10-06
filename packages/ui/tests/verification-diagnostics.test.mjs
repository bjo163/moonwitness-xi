import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPackageVerificationAnnotation } from '../scripts/verification-diagnostics.mjs';

test('emits a safe annotation for a known verification phase', () => {
  assert.equal(
    renderPackageVerificationAnnotation('run consumer import smoke test', 'ERR_MODULE_NOT_FOUND'),
    '::error title=UI package verification failed::run consumer import smoke test (code: ERR_MODULE_NOT_FOUND)\n'
  );
});

test('does not include unsafe error text or allow annotation injection', () => {
  assert.equal(
    renderPackageVerificationAnnotation(
      'install isolated consumer dependencies',
      'password=secret\n::notice::bad'
    ),
    '::error title=UI package verification failed::install isolated consumer dependencies\n'
  );
  assert.throws(() => renderPackageVerificationAnnotation('untrusted phase', 1), /Unknown/u);
});
