import assert from 'node:assert/strict';
import test from 'node:test';
import { codeownerLogins, hasFreshApproval } from './promotion-approval.mjs';

const headSha = 'a'.repeat(40);
const review = (login, commitId, state, submittedAt) => ({
  user: { login },
  commit_id: commitId,
  state,
  submitted_at: submittedAt,
});

test('accepts a CODEOWNER approval for the exact current SHA', () => {
  assert.equal(
    hasFreshApproval({
      reviews: [review('bjo163', headSha, 'APPROVED', '2026-10-04T00:00:00Z')],
      headSha,
      owners: new Set(['bjo163']),
    }),
    true
  );
});

test('rejects stale approval after the promotion head changes', () => {
  assert.equal(
    hasFreshApproval({
      reviews: [review('bjo163', 'b'.repeat(40), 'APPROVED', '2026-10-04T00:00:00Z')],
      headSha,
      owners: new Set(['bjo163']),
    }),
    false
  );
});

test('rejects approval from a reviewer who is not a CODEOWNER', () => {
  assert.equal(
    hasFreshApproval({
      reviews: [review('other-user', headSha, 'APPROVED', '2026-10-04T00:00:00Z')],
      headSha,
      owners: new Set(['bjo163']),
    }),
    false
  );
});

test('a later non-approval review on the same SHA revokes that owner approval', () => {
  assert.equal(
    hasFreshApproval({
      reviews: [
        review('bjo163', headSha, 'APPROVED', '2026-10-04T00:00:00Z'),
        review('bjo163', headSha, 'CHANGES_REQUESTED', '2026-10-04T00:01:00Z'),
      ],
      headSha,
      owners: new Set(['bjo163']),
    }),
    false
  );
});

test('extracts user owners from CODEOWNERS but ignores team entries and comments', () => {
  const owners = codeownerLogins('/.github/ @bjo163 @org/team\n# @not-an-owner\n/apps/ @reviewer');
  assert.deepEqual([...owners].sort(), ['bjo163', 'reviewer']);
});
