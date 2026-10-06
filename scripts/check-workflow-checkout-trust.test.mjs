import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTrustedCheckoutPolicies } from './check-workflow-checkout-trust.mjs';

const expressionStart = '$' + '{';
const pages = `
      - uses: actions/checkout@0123456789012345678901234567890123456789 # v4
        with:
          ref: ${expressionStart}{ github.sha }}
          persist-credentials: false
      - run: pnpm install
    if [[ "$DISPATCH_REF" != "refs/heads/dev" ]]; then exit 1; fi
    if [[ "$DISPATCH_REF" != "refs/heads/main" ]]; then exit 1; fi
    [[ "$SOURCE_REF" =~ ^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$ ]]
    select(.publishedAt != null and .isDraft == false and .isPrerelease == false)
    name: Verify and select a published stable release tag
    git merge-base --is-ancestor "$release_sha" refs/remotes/origin/main
    git checkout --detach "$RELEASE_TAG"
    test "$(git rev-parse HEAD)" = "$release_sha"
    name: Verify and select an immutable main source SHA
    git merge-base --is-ancestor "$SOURCE_SHA" refs/remotes/origin/main
    git cat-file -e "$SOURCE_SHA^{commit}"
    git checkout --detach "$SOURCE_SHA"
`;
const visualReview = `
      - uses: actions/checkout@0123456789012345678901234567890123456789 # v4
        with:
          ref: ${expressionStart}{ github.sha }}
          persist-credentials: false
    if [[ "$DISPATCH_REF" != "refs/heads/dev" ]]; then exit 1; fi
      - name: Scan reports before publishing screenshots
        id: scan_reports
      - name: Publish screenshots for human review
        if: always() && steps.scan_reports.outcome == 'success'
`;
const release = `
    if: github.event_name == 'workflow_dispatch' && inputs.publish && github.ref_type == 'tag'
    needs: verify
    test "$remote_tag_sha" = "$EXPECTED_SOURCE_SHA"
`;
const releasePrepare = `
    if: github.ref == 'refs/heads/dev'
    test "$EXPECTED_SOURCE_SHA" = "$ACTUAL_SOURCE_SHA"
    node scripts/push-expected-ref.mjs origin HEAD refs/heads/dev "$EXPECTED_SOURCE_SHA"
`;
const dependencyCandidate = `
    if: github.ref == 'refs/heads/dev'
    node scripts/push-expected-ref.mjs origin "$EXPECTED_CANDIDATE_SHA" refs/heads/dev "$EXPECTED_SOURCE_SHA"
    gh workflow run promote.yml --repo "$GITHUB_REPOSITORY" --ref dev
    gh workflow run ci.yml --repo "$GH_REPO" --ref dev
`;
const releasePlan = `
    if: github.ref == 'refs/heads/dev'
permissions:
  contents: read
      - run: pnpm release:dry-run -- --output report.json
      - uses: actions/upload-artifact@0123456789012345678901234567890123456789
`;
const promote = `
      - name: Skip stale promotion events
          current_sha="$(git ls-remote origin refs/heads/dev | cut -f1)"
          if [[ "$current_sha" != "$EXPECTED_SHA" ]]; then exit 0; fi
          git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main refs/heads/dev:refs/remotes/origin/dev
      - name: Create or find the promotion pull request
          number="$(gh pr list --base main --head dev --state open --json number --jq '.[0].number // empty')"
          if [ -z "$number" ]; then
            gh pr create --base main --head dev
      - name: Disable auto-merge and mark sensitive promotion
        if: steps.risk.outputs.approval_required == 'true'
          gh pr edit "$PR_NUMBER" --repo "$GH_REPO" --add-label approval-required
          gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --disable-auto
      - name: Enable merge for compatible, low-risk promotion
        if: steps.risk.outputs.approval_required != 'true'
          gh pr view "$PR_NUMBER" --repo "$GH_REPO" --json labels --jq '[.labels[].name]'
          if jq -e 'index("approval-required") != null' <<< "$labels" >/dev/null; then
          gh pr edit "$PR_NUMBER" --repo "$GH_REPO" --remove-label approval-required
          gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --auto --merge --match-head-commit "$EXPECTED_SHA"
`;
const versionedPages = `${pages}
  - name: Upload stable documentation archive
  store-versioned-docs:
    file="versioned-docs/docs-site-$TAG.tar.gz"
    test "$(jq -r '.digest // empty' <<< "$asset")" = "$expected"
    test "$(jq -r '.size' <<< "$asset")" = "$expected_size"
  compose-site:
    if: needs.compose-site.result == 'success'
    run: node scripts/docs/versioned-site.mjs compose
    run: node scripts/docs/versioned-site.mjs plan --releases release-inventory.json --limit 5
`;
function policies(overrides = {}) {
  return inspectTrustedCheckoutPolicies({
    pages: versionedPages,
    visualReview,
    release,
    releasePrepare,
    dependencyCandidate,
    releasePlan,
    promote,
    ...overrides,
  });
}

test('accepts immutable event-SHA checkout and trusted dispatch restrictions', () => {
  assert.deepEqual(policies(), []);
});

test('requires immutable versioned docs assets and successful five-release composition', () => {
  const unsafePages = versionedPages
    .replace('jq -r \'.digest // empty\' <<< "$asset"', 'true')
    .replace(
      'versioned-site.mjs plan --releases release-inventory.json --limit 5',
      'versioned-site.mjs plan'
    );
  const findings = policies({ pages: unsafePages });
  assert.ok(findings.some((finding) => finding.includes('digest and size')));
  assert.ok(findings.some((finding) => finding.includes('five-stable-release snapshot retention')));
});

test('rejects arbitrary workflow-dispatch checkout refs and persisted credentials', () => {
  const untrustedPages = pages
    .split('ref: ${{ github.sha }}')
    .join('ref: ${{ inputs.source_ref }}');
  const untrustedVisual = visualReview
    .split('persist-credentials: false')
    .join('persist-credentials: true');
  const findings = policies({ pages: untrustedPages, visualReview: untrustedVisual });
  assert.ok(findings.some((finding) => finding.includes('immutable event SHA')));
  assert.ok(findings.some((finding) => finding.includes('persist the workflow token')));
});

test('rejects screenshot upload when report secret scanning is missing or unsuccessful', () => {
  const unsafeVisual = visualReview
    .replace('        id: scan_reports\n', '')
    .replace(
      "        if: always() && steps.scan_reports.outcome == 'success'\n",
      '        if: always()\n'
    );
  assert.ok(
    policies({ visualReview: unsafeVisual }).some((finding) =>
      finding.includes('scan reports successfully before uploading screenshots')
    )
  );
});

test('rejects release-tag checkout before ancestry validation and missing dev guard', () => {
  const ancestryCheck = 'git merge-base --is-ancestor "$release_sha" refs/remotes/origin/main';
  const checkout = 'git checkout --detach "$RELEASE_TAG"';
  const unsafePages = pages
    .split(ancestryCheck)
    .join('')
    .split(checkout)
    .join(`${checkout}\n${ancestryCheck}`);
  const unsafeVisual = visualReview.replace(
    'if [[ "$DISPATCH_REF" != "refs/heads/dev" ]]; then exit 1; fi',
    ''
  );
  const findings = policies({ pages: unsafePages, visualReview: unsafeVisual });
  assert.ok(findings.some((finding) => finding.includes('validate a release tag before')));
  assert.ok(findings.some((finding) => finding.includes('protected dev branch')));
});

test('rejects prerelease Pages publication and immutable-SHA recovery without main ancestry', () => {
  const unsafePages = pages
    .replace('isPrerelease == false', 'isPrerelease != true')
    .replace('git merge-base --is-ancestor "$SOURCE_SHA" refs/remotes/origin/main', 'true');
  const findings = policies({ pages: unsafePages });
  assert.ok(findings.some((finding) => finding.includes('reject prerelease releases')));
  assert.ok(findings.some((finding) => finding.includes('reachable from main')));
});

test('rejects untrusted release dispatch, stale preparation SHA, and missing follow-up dispatch', () => {
  const findings = policies({
    release: release.replace("github.ref_type == 'tag'", "github.ref_type == 'branch'"),
    releasePrepare: releasePrepare.replace(
      'test "$EXPECTED_SOURCE_SHA" = "$ACTUAL_SOURCE_SHA"',
      'true'
    ),
    dependencyCandidate: dependencyCandidate.replace(
      'gh workflow run ci.yml --repo "$GH_REPO" --ref dev',
      ''
    ),
  });
  assert.ok(findings.some((finding) => finding.includes('explicit dispatch on a version tag')));
  assert.ok(findings.some((finding) => finding.includes('input SHA different from the event SHA')));
  assert.ok(findings.some((finding) => finding.includes('explicitly dispatch full CI')));
});

test('rejects write-capable or non-reviewable release dry-run workflows', () => {
  const findings = policies({
    releasePlan: releasePlan
      .replace("if: github.ref == 'refs/heads/dev'", "if: github.ref == 'refs/heads/feature'")
      .replace('contents: read', 'packages: write')
      .replace(
        'actions/upload-artifact@0123456789012345678901234567890123456789',
        'run: docker push image'
      ),
  });
  assert.ok(findings.some((finding) => finding.includes('only run from dev')));
  assert.ok(findings.some((finding) => finding.includes('remain read-only')));
  assert.ok(findings.some((finding) => finding.includes('reviewable plan artifact')));
  assert.ok(findings.some((finding) => finding.includes('must not publish')));
});

test('promotion disables auto-merge for sensitive changes and binds low-risk merge to exact head', () => {
  const unsafe = promote
    .replace('gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --disable-auto', 'true')
    .replace('--match-head-commit "$EXPECTED_SHA"', '');
  const findings = policies({ promote: unsafe });
  assert.ok(findings.some((finding) => finding.includes('disable auto-merge')));
  assert.ok(findings.some((finding) => finding.includes('exact classified dev SHA')));
});

test('promotion ignores a stale push after dev moves beyond its event SHA', () => {
  const unsafe = promote.replace(
    'if [[ "$current_sha" != "$EXPECTED_SHA" ]]; then exit 0; fi',
    'true'
  );
  assert.ok(policies({ promote: unsafe }).some((finding) => finding.includes('current dev head')));
});

test('promotion rejects a stale event before fetching its comparison refs', () => {
  const unsafe = promote.replace(
    'if [[ "$current_sha" != "$EXPECTED_SHA" ]]; then exit 0; fi\n          git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main refs/heads/dev:refs/remotes/origin/dev',
    'git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main refs/heads/dev:refs/remotes/origin/dev\n          if [[ "$current_sha" != "$EXPECTED_SHA" ]]; then exit 0; fi'
  );
  assert.ok(
    policies({ promote: unsafe }).some((finding) =>
      finding.includes('before fetching promotion refs')
    )
  );
});

test('promotion checks fail when sensitive and low-risk commands are moved between steps', () => {
  const unsafe = promote
    .replace('gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --disable-auto', 'true')
    .replace(
      'gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --auto --merge --match-head-commit "$EXPECTED_SHA"',
      'gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --disable-auto'
    );
  assert.ok(
    policies({ promote: unsafe }).some((finding) => finding.includes('disable auto-merge'))
  );
});

test('promotion finds the existing PR before creating and only creates when absent', () => {
  const unsafe = promote.replace('if [ -z "$number" ]; then', 'if true; then');
  assert.ok(
    policies({ promote: unsafe }).some((finding) => finding.includes('create one only when absent'))
  );
});

test('low-risk promotion clears a stale approval label before requesting auto-merge', () => {
  const unsafe = promote.replace(
    'gh pr edit "$PR_NUMBER" --repo "$GH_REPO" --remove-label approval-required',
    'true'
  );
  assert.ok(
    policies({ promote: unsafe }).some((finding) =>
      finding.includes('clear a stale approval-required label')
    )
  );
});

test('low-risk promotion only removes the approval label when it is present', () => {
  const unsafe = promote.replace(
    'if jq -e \'index("approval-required") != null\' <<< "$labels" >/dev/null; then',
    'if true; then'
  );
  assert.ok(
    policies({ promote: unsafe }).some((finding) =>
      finding.includes('clear a stale approval-required label')
    )
  );
});
