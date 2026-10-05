import process from 'node:process';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = VERSION_PATTERN.exec(value);
  if (!match) return null;
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some((part) => /^\d+$/u.test(part) && part.length > 1 && part.startsWith('0')))
    return null;
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    const aNumeric = /^\d+$/u.test(a);
    const bNumeric = /^\d+$/u.test(b);
    if (aNumeric && bNumeric) return BigInt(a) < BigInt(b) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return Math.sign(left.length - right.length);
}

export function compareReleaseVersions(leftTag, rightTag) {
  const left = parseVersion(leftTag);
  const right = parseVersion(rightTag);
  if (!left || !right) throw new Error('Release tags must use valid semantic versions');
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function planLatestPromotion(candidateTag, publishedTags) {
  if (!Array.isArray(publishedTags)) throw new Error('Published release tags must be an array');
  const candidate = parseVersion(candidateTag);
  if (!candidate) throw new Error('Candidate tag must use semantic version format');
  if (candidate.prerelease.length > 0)
    return { advance: false, reason: 'prerelease', latest: null };

  const stable = publishedTags.filter((tag) => {
    const parsed = parseVersion(tag);
    return parsed && parsed.prerelease.length === 0;
  });
  for (const tag of publishedTags) {
    if (typeof tag === 'string' && tag.startsWith('v') && !parseVersion(tag))
      throw new Error(`Published release tag is not semantic version: ${tag}`);
  }
  const latest = stable.reduce(
    (current, tag) => (!current || compareReleaseVersions(tag, current) > 0 ? tag : current),
    null
  );
  if (!latest) return { advance: true, reason: 'first-stable-release', latest: null };
  if (compareReleaseVersions(candidateTag, latest) > 0)
    return { advance: true, reason: 'newer-stable-release', latest };
  return {
    advance: false,
    reason:
      compareReleaseVersions(candidateTag, latest) === 0 ? 'already-current' : 'older-release',
    latest,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const candidateTag = process.argv[2];
  if (!candidateTag) throw new Error('Usage: node release-latest-policy.mjs <candidate-tag>');
  const publishedTags = (await readStdin()).split(/\r?\n/u).filter(Boolean);
  process.stdout.write(`${JSON.stringify(planLatestPromotion(candidateTag, publishedTags))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    globalThis.console.error(
      error instanceof Error ? error.message : 'Latest release planning failed'
    );
    process.exitCode = 1;
  });
}
