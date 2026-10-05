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
    git merge-base --is-ancestor "$release_sha" refs/remotes/origin/main
    git checkout --detach "$RELEASE_TAG"
`;
const visualReview = `
      - uses: actions/checkout@0123456789012345678901234567890123456789 # v4
        with:
          ref: ${expressionStart}{ github.sha }}
          persist-credentials: false
    if [[ "$DISPATCH_REF" != "refs/heads/dev" ]]; then exit 1; fi
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
function policies(overrides = {}) {
  return inspectTrustedCheckoutPolicies({
    pages,
    visualReview,
    release,
    releasePrepare,
    dependencyCandidate,
    ...overrides,
  });
}

test('accepts immutable event-SHA checkout and trusted dispatch restrictions', () => {
  assert.deepEqual(policies(), []);
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
