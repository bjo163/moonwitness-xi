import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTrustedCheckoutPolicies } from './check-workflow-checkout-trust.mjs';

const pages = `
      - uses: actions/checkout@0123456789012345678901234567890123456789 # v4
        with:
          ref: \${{ github.sha }}
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
          ref: \${{ github.sha }}
          persist-credentials: false
    if [[ "$DISPATCH_REF" != "refs/heads/dev" ]]; then exit 1; fi
`;

test('accepts immutable event-SHA checkout and trusted dispatch restrictions', () => {
  assert.deepEqual(inspectTrustedCheckoutPolicies({ pages, visualReview }), []);
});

test('rejects arbitrary workflow-dispatch checkout refs and persisted credentials', () => {
  const untrustedPages = pages.replace('ref: ${{ github.sha }}', 'ref: ${{ inputs.source_ref }}');
  const untrustedVisual = visualReview.replace(
    'persist-credentials: false',
    'persist-credentials: true'
  );
  const findings = inspectTrustedCheckoutPolicies({
    pages: untrustedPages,
    visualReview: untrustedVisual,
  });
  assert.ok(findings.some((finding) => finding.includes('immutable event SHA')));
  assert.ok(findings.some((finding) => finding.includes('persist the workflow token')));
});

test('rejects release-tag checkout before ancestry validation and missing dev guard', () => {
  const unsafePages = pages
    .replace('git checkout --detach "$RELEASE_TAG"', 'git checkout --detach "$RELEASE_TAG"')
    .replace('git merge-base --is-ancestor "$release_sha" refs/remotes/origin/main\n', '');
  const unsafeVisual = visualReview.replace(
    'if [[ "$DISPATCH_REF" != "refs/heads/dev" ]]; then exit 1; fi',
    ''
  );
  const findings = inspectTrustedCheckoutPolicies({
    pages: unsafePages,
    visualReview: unsafeVisual,
  });
  assert.ok(findings.some((finding) => finding.includes('reachable from main')));
  assert.ok(findings.some((finding) => finding.includes('protected dev branch')));
});
