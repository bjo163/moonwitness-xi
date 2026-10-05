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
const releasePlanner = await readFile(
  new globalThis.URL('./release-plan.mjs', import.meta.url),
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
    /sha256sum release-images\.tar release-image-manifest\.json release-api\.spdx\.json release-board\.spdx\.json > release-artifacts\.sha256/u
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
  assert.match(publish, /needs: \[verify, attest-artifact\]/u);
  assert.match(
    publish,
    /github\.event_name == 'workflow_dispatch' && inputs\.publish && github\.ref_type == 'tag'/u
  );
  assert.doesNotMatch(publish, /deploy-pages|kubectl|docker compose up/u);
});

test('tag releases publish SPDX SBOMs and attest artifact/image subjects before Release completion', () => {
  assert.equal((verify.match(/uses: anchore\/sbom-action@/gu) ?? []).length, 2);
  assert.match(verify, /output-file: release-api\.spdx\.json/u);
  assert.match(verify, /output-file: release-board\.spdx\.json/u);
  assert.match(verify, /format: spdx-json/u);
  assert.match(verify, /upload-artifact: false/u);
  assert.match(publish, /needs: \[verify, attest-artifact\]/u);
  assert.equal((publish.match(/uses: actions\/attest@/gu) ?? []).length, 4);
  assert.equal((publish.match(/push-to-registry: true/gu) ?? []).length, 4);
  assert.equal((publish.match(/create-storage-record: false/gu) ?? []).length, 4);
  const attestationJob = workflow.slice(workflow.indexOf('  attest-artifact:'), publishStart);
  assert.match(attestationJob, /attestations: write/u);
  assert.match(attestationJob, /id-token: write/u);
  assert.match(attestationJob, /release-images\.tar/u);
  assert.match(attestationJob, /release-api\.spdx\.json/u);
  assert.ok(attestationJob.indexOf('uses: actions/attest@') >= 0);
  assert.ok(
    publish.indexOf('Attest API image SPDX SBOM') <
      publish.indexOf('Ensure a draft GitHub release exists')
  );
  assert.ok(
    publish.indexOf('Attest Board image build provenance') <
      publish.indexOf('Ensure a draft GitHub release exists')
  );
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
    publish.indexOf('Ensure a draft GitHub release exists') <
      publish.indexOf('Reconcile immutable release assets')
  );
  assert.ok(
    publish.indexOf('Reconcile immutable release assets') <
      publish.indexOf('Verify release assets before completing release')
  );
  assert.ok(
    publish.indexOf('Verify release assets before completing release') <
      publish.indexOf('Advance stable API latest')
  );
  assert.match(publish, /--prerelease --latest=false/u);
  assert.match(publish, /--latest=false/u);
  assert.match(publish, /gh release edit "\$TAG" --draft=false --latest/u);
  assert.match(publish, /--draft --prerelease/u);
  assert.match(publish, /--draft=false/u);
  assert.match(publish, /gh release verify-asset/u);
  assert.doesNotMatch(publish, /gh release upload .*--clobber/u);
  assert.match(publish, /\.digest \/\/ empty/u);
  assert.match(publish, /IS_DRAFT: \$\{\{ steps\.draft_release\.outputs\.is_draft \}\}/u);
  assert.match(publish, /test "\$IS_DRAFT" = 'true'/u);
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

test('release fault recovery preserves no-op plans and explicitly models hostile failures', () => {
  assert.match(releasePlanner, /classification\.changeKind === 'none'/u);
  assert.match(releasePlanner, /result\.status = 'no-release'/u);
  assert.match(imagePublisher, /manifest unknown/iu);
  assert.match(imagePublisher, /if \(!missingImageManifest\(error\)\) throw error/u);
  assert.match(publish, /remote_tag_sha/u);
  assert.match(publish, /gh release view "\$TAG"/u);
  assert.match(publish, /sha256sum --check release-artifacts\.sha256/u);
});
