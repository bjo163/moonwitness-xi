import process from 'node:process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const IMAGE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SOURCE_SHA_PATTERN = /^[a-f0-9]{40,64}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function releaseLabels(image) {
  return image?.Config?.Labels ?? {};
}

function digestForImage(image, repository) {
  const prefix = `${repository.toLowerCase()}@`;
  const matches = (image?.RepoDigests ?? [])
    .filter((item) => item.toLowerCase().startsWith(prefix))
    .map((item) => item.slice(prefix.length))
    .filter((item) => DIGEST_PATTERN.test(item));
  return matches.length === 1 ? matches[0] : null;
}

function missingImageManifest(error) {
  if (!(error instanceof Error)) return false;
  return /manifest unknown|manifest_unknown/iu.test(`${error.message}\n${error.stderr ?? ''}`);
}

function validateInput({ sourceImage, image, tag, sourceSha, version }) {
  if (typeof sourceImage !== 'string' || !/^[A-Za-z0-9./:_-]+$/u.test(sourceImage))
    throw new Error('Invalid local release image reference');
  if (typeof image !== 'string' || !/^[A-Za-z0-9./_-]+$/u.test(image))
    throw new Error('Invalid release image repository');
  if (
    typeof tag !== 'string' ||
    tag.length > 128 ||
    !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(
      tag
    )
  ) {
    throw new Error('Invalid release image tag');
  }
  if (typeof sourceSha !== 'string' || !SOURCE_SHA_PATTERN.test(sourceSha))
    throw new Error('Invalid release source SHA');
  if (version !== tag) throw new Error('Release image version must exactly match its tag');
  return { sourceImage, image: image.toLowerCase(), tag, sourceSha, version };
}

export async function publishReleaseImage(input, docker) {
  const validated = validateInput(input);
  const target = `${validated.image}:${validated.tag}`;
  const candidate = await docker.inspect(validated.sourceImage);
  if (!candidate || !IMAGE_ID_PATTERN.test(candidate.Id ?? ''))
    throw new Error('Candidate image has no valid image ID');
  const candidateLabels = releaseLabels(candidate);
  if (
    candidateLabels['org.opencontainers.image.revision'] !== validated.sourceSha ||
    candidateLabels['org.opencontainers.image.version'] !== validated.version
  ) {
    throw new Error('Candidate image source metadata does not match the verified release');
  }

  try {
    await docker.pull(target);
  } catch (error) {
    if (!missingImageManifest(error)) throw error;
    await docker.tag(validated.sourceImage, target);
    const output = await docker.push(target);
    const digestMatches = [...String(output).matchAll(/digest: (sha256:[a-f0-9]{64})/gu)];
    const digests = [...new Set(digestMatches.map((match) => match[1]))];
    if (digests.length !== 1)
      throw new Error('Image push did not return one unambiguous registry digest', {
        cause: error,
      });
    return { action: 'pushed', image: target, digest: digests[0] };
  }

  const existing = await docker.inspect(target);
  const existingLabels = releaseLabels(existing);
  const existingDigest = digestForImage(existing, validated.image);
  if (
    existing?.Id !== candidate.Id ||
    existingLabels['org.opencontainers.image.revision'] !== validated.sourceSha ||
    existingLabels['org.opencontainers.image.version'] !== validated.version ||
    !existingDigest
  ) {
    throw new Error(
      `Existing release image tag ${target} conflicts with the verified candidate; refusing to overwrite it`
    );
  }
  return { action: 'reused', image: target, digest: existingDigest };
}

function dockerAdapter() {
  return {
    async inspect(reference) {
      const { stdout } = await execFile('docker', ['image', 'inspect', reference], {
        maxBuffer: 10 * 1024 * 1024,
      });
      const images = JSON.parse(stdout);
      if (!Array.isArray(images) || images.length !== 1)
        throw new Error('Docker inspect returned an invalid image record');
      return images[0];
    },
    async pull(reference) {
      return execFile('docker', ['pull', reference], { maxBuffer: 10 * 1024 * 1024 });
    },
    async tag(source, target) {
      return execFile('docker', ['tag', source, target]);
    },
    async push(reference) {
      const { stdout, stderr } = await execFile('docker', ['push', reference], {
        maxBuffer: 10 * 1024 * 1024,
      });
      return `${stdout}\n${stderr}`;
    },
  };
}

async function main() {
  const result = await publishReleaseImage(
    {
      sourceImage: process.env.SOURCE_IMAGE,
      image: process.env.IMAGE_REPOSITORY,
      tag: process.env.RELEASE_TAG,
      sourceSha: process.env.SOURCE_SHA,
      version: process.env.RELEASE_VERSION,
    },
    dockerAdapter()
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    globalThis.console.error(
      error instanceof Error ? error.message : 'Release image publication failed'
    );
    process.exitCode = 1;
  });
}
