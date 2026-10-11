import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const digest = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');

export function buildVerificationPlan({ repository, workflow, tag, directory }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository))
    throw new Error('Repository must use owner/name format.');
  if (!workflow.startsWith(`${repository}/`))
    throw new Error('Signer workflow repository must match the requested repository.');
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[A-Za-z0-9_.-]+\.yml$/u.test(workflow)
  )
    throw new Error('Workflow must identify an exact repository workflow path.');
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(tag))
    throw new Error('Tag must be a version tag such as v1.2.3 or v1.2.3-rc.1.');
  const apiImage = `ghcr.io/${repository.toLowerCase()}`;
  const boardImage = `ghcr.io/${repository.toLowerCase()}-board`;
  const signerWorkflow = workflow;
  return [
    {
      file: path.join(directory, 'release-images.tar'),
      args: [
        'attestation',
        'verify',
        path.join(directory, 'release-images.tar'),
        '--repo',
        repository,
        '--signer-workflow',
        signerWorkflow,
      ],
    },
    {
      file: path.join(directory, 'release-image-manifest.json'),
      args: [
        'attestation',
        'verify',
        path.join(directory, 'release-image-manifest.json'),
        '--repo',
        repository,
        '--signer-workflow',
        signerWorkflow,
      ],
    },
    {
      file: path.join(directory, 'release-api.spdx.json'),
      args: [
        'attestation',
        'verify',
        path.join(directory, 'release-api.spdx.json'),
        '--repo',
        repository,
        '--signer-workflow',
        signerWorkflow,
        '--predicate-type',
        'https://spdx.dev/Document/v2.3',
      ],
    },
    {
      file: path.join(directory, 'release-board.spdx.json'),
      args: [
        'attestation',
        'verify',
        path.join(directory, 'release-board.spdx.json'),
        '--repo',
        repository,
        '--signer-workflow',
        signerWorkflow,
        '--predicate-type',
        'https://spdx.dev/Document/v2.3',
      ],
    },
    {
      image: `oci://${apiImage}@${tag}`,
      args: [
        'attestation',
        'verify',
        `oci://${apiImage}:${tag}`,
        '--repo',
        repository,
        '--signer-workflow',
        signerWorkflow,
      ],
    },
    {
      image: `oci://${boardImage}@${tag}`,
      args: [
        'attestation',
        'verify',
        `oci://${boardImage}:${tag}`,
        '--repo',
        repository,
        '--signer-workflow',
        signerWorkflow,
      ],
    },
  ];
}

export async function verifyReleaseBundle({ directory, expectedSourceSha, expectedVersion }) {
  const checksumFile = path.join(directory, 'release-artifacts.sha256');
  const checksums = (await readFile(checksumFile, 'utf8')).trim().split(/\r?\n/u);
  for (const line of checksums) {
    const match = /^([a-f0-9]{64})\s+(.+)$/u.exec(line);
    if (!match) throw new Error(`Invalid checksum entry: ${line}`);
    const [, expected, name] = match;
    if ((await digest(path.join(directory, name))) !== expected)
      throw new Error(`Checksum mismatch: ${name}`);
  }
  const assetChecksums = (await readFile(path.join(directory, 'release-assets.sha256'), 'utf8'))
    .trim()
    .split(/\r?\n/u);
  for (const line of assetChecksums) {
    const match = /^([a-f0-9]{64})\s+(.+)$/u.exec(line);
    if (!match) throw new Error(`Invalid release asset checksum entry: ${line}`);
    if ((await digest(path.join(directory, match[2]))) !== match[1])
      throw new Error(`Release asset checksum mismatch: ${match[2]}`);
  }
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'release-image-manifest.json'), 'utf8')
  );
  if (manifest.sourceSha !== expectedSourceSha)
    throw new Error('Release artifact source SHA does not match the expected source.');
  if (manifest.version !== expectedVersion)
    throw new Error('Release artifact version does not match the expected version.');
  return {
    filesVerified: checksums.length,
    releaseAssetsVerified: assetChecksums.length,
    sourceSha: manifest.sourceSha,
    version: manifest.version,
  };
}

async function main() {
  const [repository, workflow, tag, directory = 'release-images'] = process.argv.slice(2);
  if (!repository || !workflow || !tag)
    throw new Error(
      'Usage: node scripts/verify-release-attestations.mjs <owner/repo> <owner/repo/.github/workflows/release.yml> <tag> [artifact-directory]'
    );
  const plan = buildVerificationPlan({ repository, workflow, tag, directory });
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'release-image-manifest.json'), 'utf8')
  );
  const bundle = await verifyReleaseBundle({
    directory,
    expectedSourceSha: manifest.sourceSha,
    expectedVersion: tag,
  });
  for (const item of plan) execFileSync('gh', item.args, { stdio: 'inherit' });
  process.stdout.write(
    `${JSON.stringify({ ...bundle, attestationsVerified: plan.length }, null, 2)}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
