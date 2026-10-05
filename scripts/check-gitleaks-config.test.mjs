import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGitleaksSetup } from './check-gitleaks-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [workflow, config] = await Promise.all([
  readFile(path.join(root, '.github/workflows/gitleaks.yml'), 'utf8'),
  readFile(path.join(root, '.gitleaks.toml'), 'utf8'),
]);

test('accepts least-privilege full-history scanning with exact reviewed fixtures', () => {
  assert.deepEqual(validateGitleaksSetup(workflow, config), []);
});

test('rejects workflow trust-boundary and allowlist regressions', () => {
  const invalidWorkflow = workflow.replace('pull_request:', 'pull_request_target:');
  const invalidConfig = config.replace('Youknowm@3', 'any-password');
  assert.ok(
    validateGitleaksSetup(invalidWorkflow, config).some((issue) => /privileged PR/u.test(issue))
  );
  assert.ok(
    validateGitleaksSetup(workflow, invalidConfig).some((issue) => /reviewed fixture/u.test(issue))
  );
});
