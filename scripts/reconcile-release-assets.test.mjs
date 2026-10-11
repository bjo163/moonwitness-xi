import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileReleaseAssets } from './reconcile-release-assets.mjs';

const digestA = `sha256:${'a'.repeat(64)}`;
const digestB = `sha256:${'b'.repeat(64)}`;
const files = [
  { path: 'release-api.spdx.json', name: 'release-api.spdx.json', digest: digestA, size: 100 },
  { path: 'release-board.spdx.json', name: 'release-board.spdx.json', digest: digestB, size: 200 },
];

function fakeAdapter(initial = []) {
  const assets = new Map(initial.map((asset) => [asset.name, { ...asset }]));
  const uploads = [];
  let failAfterAccept = new Set();
  let failBeforeAccept = new Set();
  return {
    assets,
    uploads,
    failAfterAccept,
    failBeforeAccept,
    async listAssets() {
      return [...assets.values()];
    },
    async uploadAsset(_tag, path) {
      const expected = files.find((file) => file.path === path);
      assert.ok(expected, `unexpected upload path ${path}`);
      uploads.push(expected.name);
      if (failBeforeAccept.has(expected.name)) throw new Error('simulated pre-accept timeout');
      assets.set(expected.name, {
        name: expected.name,
        digest: expected.digest,
        size: expected.size,
      });
      if (failAfterAccept.has(expected.name)) throw new Error('simulated lost upload response');
    },
  };
}

const reconcile = (adapter, overrides = {}) =>
  reconcileReleaseAssets({
    tag: 'v1.2.3',
    releaseId: 42,
    isDraft: true,
    files,
    adapter,
    ...overrides,
  });

test('uploads missing assets and verifies each remote digest and size', async () => {
  const adapter = fakeAdapter();
  const result = await reconcile(adapter);
  assert.deepEqual(
    result.map(({ action }) => action),
    ['uploaded', 'uploaded']
  );
  assert.deepEqual(
    adapter.uploads,
    files.map(({ name }) => name)
  );
});

test('reuses an exact existing asset without uploading it again', async () => {
  const adapter = fakeAdapter([files[0]]);
  const result = await reconcile(adapter);
  assert.deepEqual(
    result.map(({ action }) => action),
    ['reused', 'uploaded']
  );
  assert.deepEqual(adapter.uploads, [files[1].name]);
});

test('preflights every immutable name conflict before uploading any missing asset', async () => {
  const adapter = fakeAdapter([{ ...files[1], digest: digestA }]);
  await assert.rejects(reconcile(adapter), /conflicts with the verified file/u);
  assert.deepEqual(adapter.uploads, []);
});

test('refuses to add an asset after a release is already published', async () => {
  const adapter = fakeAdapter([files[0]]);
  await assert.rejects(reconcile(adapter, { isDraft: false }), /published release/u);
  assert.deepEqual(adapter.uploads, []);
});

test('recovers an upload accepted remotely when the CLI response is lost', async () => {
  const adapter = fakeAdapter();
  adapter.failAfterAccept.add(files[0].name);
  const result = await reconcile(adapter);
  assert.equal(result[0]?.action, 'recovered');
  assert.equal(adapter.uploads.filter((name) => name === files[0].name).length, 1);
  assert.deepEqual(
    adapter.uploads,
    files.map(({ name }) => name)
  );
});

test('fails without retry when a failed upload is not present remotely', async () => {
  const adapter = fakeAdapter();
  adapter.failBeforeAccept.add(files[0].name);
  await assert.rejects(reconcile(adapter), /Upload command failed/u);
  assert.deepEqual(adapter.uploads, [files[0].name]);
});

test('rejects a wrong digest or byte size observed after upload', async () => {
  const adapter = fakeAdapter();
  adapter.uploadAsset = async (_tag, path) => {
    const expected = files.find((file) => file.path === path);
    if (!expected) throw new Error('unexpected file');
    adapter.uploads.push(expected.name);
    adapter.assets.set(expected.name, {
      name: expected.name,
      digest: expected.digest,
      size: expected.size + 1,
    });
  };
  await assert.rejects(reconcile(adapter), /conflicts with the verified file/u);
});

test('rejects duplicate names and malformed remote inventory', async () => {
  const adapter = fakeAdapter();
  await assert.rejects(
    reconcile(adapter, { files: [files[0], { ...files[0] }] }),
    /Duplicate expected/u
  );
  adapter.listAssets = async () => [{ ...files[0] }, { ...files[0] }];
  await assert.rejects(reconcile(adapter), /duplicate asset/u);
});
