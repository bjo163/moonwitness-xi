import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(
  new globalThis.URL('../.github/workflows/release.yml', import.meta.url),
  'utf8'
);
const smokeScript = await readFile(
  new globalThis.URL('./smoke-containers.sh', import.meta.url),
  'utf8'
);
const imagePublisher = await readFile(
  new globalThis.URL('./publish-release-image.mjs', import.meta.url),
  'utf8'
);
const jobsStart = workflow.indexOf('jobs:');
const verifyStart = workflow.indexOf('  verify:', jobsStart);
const publishStart = workflow.indexOf('  publish:', jobsStart);
const verify = workflow.slice(verifyStart, publishStart);
const publish = workflow.slice(publishStart);

test('release tags require exact main ancestry and successful ci-gate for the same SHA', () => {
  assert.match(verify, /if \[\[ "\$version" != v\*/u);
  assert.match(verify, /echo "version=\$version" >> "\$GITHUB_OUTPUT"/u);
  assert.match(verify, /git merge-base --is-ancestor "\$SOURCE_SHA" refs\/remotes\/origin\/main/u);
  assert.match(verify, /head_sha=\$SOURCE_SHA&event=push/u);
  assert.match(verify, /\.head_sha == \$sha and \.head_branch == "main" and \.event == "push"/u);
  assert.match(verify, /\.name == "ci-gate" and \.conclusion == "success"/u);
});

test('the verified and scanned API and Board images are smoke-tested and handed off unchanged', () => {
  for (const image of ['moonwitness-api:production', 'moonwitness-board:production']) {
    assert.ok(verify.includes(`--tag ${image}`) || verify.includes(`--tag ${image} .`));
    assert.ok(verify.includes(`image-ref: ${image}`));
    assert.ok(publish.includes(`SOURCE_IMAGE: ${image}`));
  }
  assert.match(verify, /org\.opencontainers\.image\.revision=\$GITHUB_SHA/u);
  assert.match(verify, /org\.opencontainers\.image\.version=\$RELEASE_VERSION/u);
  assert.match(verify, /SMOKE_USE_PREBUILT_IMAGES: 'true'/u);
  assert.match(smokeScript, /SMOKE_USE_PREBUILT_IMAGES:-false/u);
  assert.match(smokeScript, /up --detach --no-build --wait --wait-timeout 180 api board/u);
  assert.match(verify, /docker save --output release-images\.tar/u);
  assert.match(verify, /docker image inspect moonwitness-api:production --format '\{\{\.Id\}\}'/u);
  assert.match(
    verify,
    /docker image inspect moonwitness-board:production --format '\{\{\.Id\}\}'/u
  );
  assert.match(
    verify,
    /sha256sum release-images\.tar release-image-manifest\.json > release-artifacts\.sha256/u
  );
  assert.match(publish, /actions\/download-artifact@/u);
  assert.match(verify, /name: release-images-\$\{\{ github\.sha \}\}/u);
  assert.match(publish, /name: release-images-\$\{\{ github\.sha \}\}/u);
  assert.match(verify, /steps\.upload_images\.outputs\.artifact-digest/u);
  assert.match(publish, /sha256sum --check release-artifacts\.sha256/u);
  assert.match(publish, /\.apiImageId' release-image-manifest\.json/u);
  assert.match(publish, /\.boardImageId' release-image-manifest\.json/u);
  assert.match(publish, /docker load --input release-images\.tar/u);
  assert.equal((publish.match(/node scripts\/publish-release-image\.mjs/gu) ?? []).length, 2);
  assert.match(publish, /test "\$revision" = "\$GITHUB_SHA"/u);
  assert.match(publish, /test "\$version" = "\$RELEASE_VERSION"/u);
  assert.equal((publish.match(/node scripts\/publish-release-image\.mjs/gu) ?? []).length, 2);
  assert.equal(
    (
      publish.match(
        /VERSION_DIGEST: \$\{\{ steps\.publish_(?:api|board)\.outputs\.digest \}\}/gu
      ) ?? []
    ).length,
    2
  );
  assert.equal((publish.match(/test "\$latest_digest" = "\$VERSION_DIGEST"/gu) ?? []).length, 2);
  assert.doesNotMatch(publish, /docker (?:build|buildx build)/u);
  assert.match(publish, /needs: verify/u);
  assert.match(
    publish,
    /github\.event_name == 'workflow_dispatch' && inputs\.publish && github\.ref_type == 'tag'/u
  );
  assert.doesNotMatch(publish, /deploy-pages|kubectl|docker compose up/u);
});

test('critical candidates fail verification and latest only advances for a newer stable release', () => {
  assert.equal((verify.match(/severity: CRITICAL/gu) ?? []).length, 2);
  assert.equal((verify.match(/exit-code: '1'/gu) ?? []).length, 2);
  assert.match(publish, /Plan stable latest promotion against published GitHub releases/u);
  assert.match(publish, /gh api --paginate .*releases\?per_page=100/u);
  assert.match(publish, /node scripts\/release-latest-policy\.mjs "\$CANDIDATE_TAG"/u);
  assert.match(publish, /if: \$\{\{ !contains\(github\.ref_name, '-'\) \}\}/u);
  assert.match(
    publish,
    /UPDATE_LATEST: \$\{\{ steps\.latest_policy\.outputs\.advance \|\| 'false' \}\}/u
  );
  assert.equal(
    (publish.match(/if: steps\.latest_policy\.outputs\.advance == 'true'/gu) ?? []).length,
    2
  );
  assert.equal((publish.match(/docker push "\$image:latest"/gu) ?? []).length, 2);
  assert.equal((publish.match(/test "\$latest_digest" = "\$VERSION_DIGEST"/gu) ?? []).length, 2);
  assert.ok(
    publish.indexOf('Create GitHub release') < publish.indexOf('Advance stable API latest')
  );
  assert.match(publish, /--prerelease --latest=false/u);
  assert.match(publish, /--latest=false/u);
  assert.match(publish, /gh release edit "\$TAG" --latest/u);
});

test('publish revalidates the source tag after verification before any image write', () => {
  assert.match(
    publish,
    /git ls-remote origin "refs\/tags\/\$RELEASE_TAG" "refs\/tags\/\$RELEASE_TAG\^\{\}"/u
  );
  assert.match(publish, /test "\$remote_tag_sha" = "\$EXPECTED_SOURCE_SHA"/u);
  const tagGuard = publish.indexOf('Require the source tag to remain on the verified SHA');
  const firstRegistryWrite = publish.indexOf('node scripts/publish-release-image.mjs');
  assert.ok(tagGuard >= 0 && tagGuard < firstRegistryWrite);
  assert.match(imagePublisher, /refusing to overwrite it/u);
  assert.match(imagePublisher, /manifest unknown/iu);
});
