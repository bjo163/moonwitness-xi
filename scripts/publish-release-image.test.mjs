import test from 'node:test';
import assert from 'node:assert/strict';
import { publishReleaseImage } from './publish-release-image.mjs';

const sha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const imageId = `sha256:${'c'.repeat(64)}`;
const image = 'ghcr.io/owner/service';
const input = {
  sourceImage: 'service:verified',
  image,
  tag: 'v1.2.3',
  sourceSha: sha,
  version: 'v1.2.3',
};

function imageRecord({ id = imageId, sourceSha = sha, version = 'v1.2.3', repoDigests = [] } = {}) {
  return {
    Id: id,
    Config: {
      Labels: {
        'org.opencontainers.image.revision': sourceSha,
        'org.opencontainers.image.version': version,
      },
    },
    RepoDigests: repoDigests,
  };
}

function fakeDocker({
  candidate = imageRecord(),
  remote,
  pullError,
  pushOutput = `pushed digest: ${digest}`,
} = {}) {
  const calls = [];
  return {
    calls,
    async inspect(reference) {
      calls.push(['inspect', reference]);
      return reference === input.sourceImage ? candidate : remote;
    },
    async pull(reference) {
      calls.push(['pull', reference]);
      if (pullError) throw new Error(pullError);
    },
    async tag(source, target) {
      calls.push(['tag', source, target]);
    },
    async push(reference) {
      calls.push(['push', reference]);
      return pushOutput;
    },
  };
}

test('new tag is pushed once and its digest is returned', async () => {
  const docker = fakeDocker({ pullError: 'Error response: manifest unknown' });
  const result = await publishReleaseImage(input, docker);
  assert.deepEqual(result, { action: 'pushed', image: `${image}:v1.2.3`, digest });
  assert.deepEqual(
    docker.calls.map(([operation]) => operation),
    ['inspect', 'pull', 'tag', 'push']
  );
});

test('retry reuses a matching existing tag without pushing or rewriting it', async () => {
  const docker = fakeDocker({
    remote: imageRecord({ repoDigests: [`${image}@${digest}`] }),
  });
  const result = await publishReleaseImage(input, docker);
  assert.deepEqual(result, { action: 'reused', image: `${image}:v1.2.3`, digest });
  assert.equal(
    docker.calls.some(([operation]) => operation === 'push' || operation === 'tag'),
    false
  );
});

test('conflicting existing image content fails closed without overwrite', async () => {
  const docker = fakeDocker({
    remote: imageRecord({ id: `sha256:${'d'.repeat(64)}`, repoDigests: [`${image}@${digest}`] }),
  });
  await assert.rejects(
    publishReleaseImage(input, docker),
    /conflicts with the verified candidate/u
  );
  assert.equal(
    docker.calls.some(([operation]) => operation === 'push' || operation === 'tag'),
    false
  );
});

test('matching bytes with wrong source/version labels also fail closed', async () => {
  const docker = fakeDocker({
    remote: imageRecord({ sourceSha: 'f'.repeat(40), repoDigests: [`${image}@${digest}`] }),
  });
  await assert.rejects(
    publishReleaseImage(input, docker),
    /conflicts with the verified candidate/u
  );
  const wrongVersion = fakeDocker({
    remote: imageRecord({ version: 'v1.2.4', repoDigests: [`${image}@${digest}`] }),
  });
  await assert.rejects(
    publishReleaseImage(input, wrongVersion),
    /conflicts with the verified candidate/u
  );
  const missingDigest = fakeDocker({ remote: imageRecord() });
  await assert.rejects(
    publishReleaseImage(input, missingDigest),
    /conflicts with the verified candidate/u
  );
});

test('registry and transport failures are not mistaken for a missing tag', async () => {
  const docker = fakeDocker({ pullError: 'unauthorized: authentication required' });
  await assert.rejects(publishReleaseImage(input, docker), /unauthorized/u);
  assert.equal(
    docker.calls.some(([operation]) => operation === 'push' || operation === 'tag'),
    false
  );
  const wrappedMissing = fakeDocker({ pullError: 'Command failed: docker pull' });
  const wrappedError = new Error('Command failed: docker pull');
  wrappedError.stderr = 'manifest unknown';
  wrappedMissing.pull = async () => {
    wrappedMissing.calls.push(['pull', `${image}:v1.2.3`]);
    throw wrappedError;
  };
  assert.equal((await publishReleaseImage(input, wrappedMissing)).action, 'pushed');
});

test('invalid candidate provenance, mismatched versions, and ambiguous digests fail closed', async () => {
  const docker = fakeDocker({
    pullError: 'manifest unknown',
    pushOutput: `digest: ${digest}\ndigest: sha256:${'e'.repeat(64)}`,
  });
  await assert.rejects(
    publishReleaseImage({ ...input, sourceSha: 'f'.repeat(40) }, docker),
    /source metadata/u
  );
  await assert.rejects(
    publishReleaseImage({ ...input, version: 'v1.2.4' }, docker),
    /exactly match/u
  );
  const validCandidate = fakeDocker({
    pullError: 'manifest unknown',
    pushOutput: `digest: ${digest}\ndigest: sha256:${'e'.repeat(64)}`,
  });
  await assert.rejects(publishReleaseImage(input, validCandidate), /unambiguous registry digest/u);
});
