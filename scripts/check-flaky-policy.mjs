import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { validateFlakyPolicy } from './flaky-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyFile = path.join(root, 'docs', 'testing', 'flaky-tests.json');
const policy = JSON.parse(await readFile(policyFile, 'utf8'));
const errors = validateFlakyPolicy(policy);

if (errors.length > 0) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Flaky-test policy valid: maxRetries=${policy.maxRetries}, quarantined=${policy.quarantine.length}.\n`
  );
}
