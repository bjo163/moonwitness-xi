import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repositoryRoot, '.github/workflows/ubuntu-runner-candidate.yml');
const workflowSource = await readFile(workflowPath, 'utf8');

export function validateUbuntuRunnerCandidate(source) {
  const findings = [];
  const runnerLines = [...source.matchAll(/^\s+runner:\s*\[([^\]]+)\]\s*$/gmu)];
  if (runnerLines.length !== 2) {
    findings.push('Candidate workflow must have separate quality and PostgreSQL runner matrices.');
  }
  for (const match of runnerLines) {
    const runners = match[1].split(',').map((runner) => runner.trim());
    if (runners.length !== 2 || runners[0] !== 'ubuntu-24.04' || runners[1] !== 'ubuntu-26.04') {
      findings.push('Each candidate matrix must compare ubuntu-24.04 with ubuntu-26.04.');
    }
  }
  for (const [label, required] of [
    ['frozen workspace install', 'pnpm install --frozen-lockfile --no-runtime'],
    ['quality checks', 'pnpm typecheck'],
    ['unit tests', 'pnpm test:unit'],
    ['PostgreSQL integration tests', 'pnpm test:integration'],
    ['PostgreSQL service', 'image: postgres:16-alpine'],
    ['Node 22 toolchain', "node-version: '22'"],
    ['pinned pnpm toolchain', "pnpm-version: '11.17.0'"],
  ]) {
    if (!source.includes(required)) findings.push(`Candidate workflow is missing ${label}.`);
  }
  if (!source.includes('branches: [dev]'))
    findings.push('Automatic candidate runs must be limited to changes on dev.');
  if (!source.includes('workflow_dispatch:'))
    findings.push('Candidate workflow must support manual reruns.');
  if (!source.includes('permissions:\n  contents: read'))
    findings.push('Candidate workflow must retain read-only repository permissions.');
  if (source.includes('runs-on: ubuntu-latest'))
    findings.push('Candidate workflow must use explicit versioned runner labels.');
  return findings;
}

const findings = validateUbuntuRunnerCandidate(workflowSource);
if (findings.length > 0) {
  for (const finding of findings) process.stderr.write(`${finding}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Ubuntu runner candidate matrices and required safety checks are valid.\n');
}
