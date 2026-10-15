import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPromotionRisk } from './promotion-risk.mjs';

const commit = (sha, subject) => ({ sha, parents: ['parent'], subject });

test('compatible changes in ordinary app code remain eligible for automatic promotion', () => {
  const result = classifyPromotionRisk({
    commits: [commit('a1', 'fix(board): handle empty search results')],
    changes: [{ status: 'M', path: 'apps/board/src/components/search.tsx' }],
  });

  assert.equal(result.requiresApproval, false);
  assert.equal(result.changeKind, 'patch');
  assert.deepEqual(result.reasons, []);
});

test('a patch-labeled auth change requires approval based on the changed path', () => {
  const result = classifyPromotionRisk({
    commits: [commit('b2', 'fix: tighten login checks')],
    changes: [{ status: 'M', path: 'packages/auth/src/token.ts' }],
    labels: ['patch'],
  });

  assert.equal(result.changeKind, 'patch');
  assert.equal(result.requiresApproval, true);
  assert.deepEqual(result.reasons, ['sensitive-path:packages/auth/src/token.ts']);
});

test('schema, workflow, and dependency changes require approval regardless of compatible labels', () => {
  for (const filePath of [
    'packages/orm-base/src/models/user.ts',
    '.github/workflows/promote.yml',
    'pnpm-lock.yaml',
  ]) {
    const result = classifyPromotionRisk({
      commits: [commit('c3', 'fix: keep current behavior')],
      changes: [{ status: 'M', path: filePath }],
    });
    assert.equal(result.requiresApproval, true, filePath);
  }
});

test('API routes, add-on manifests, and operational scripts require a CODEOWNER', () => {
  for (const change of [
    { status: 'M', path: 'apps/api/src/routes/partner.routes.ts' },
    { status: 'A', path: 'packages/base-addon/addons/base/manifest.ts' },
    { status: 'M', path: 'scripts/restore-postgres.sh' },
  ]) {
    assert.equal(
      classifyPromotionRisk({ commits: [commit('fix(core)')], changes: [change] }).requiresApproval,
      true
    );
  }
});

test('breaking, security, and destructive changes require approval', () => {
  const result = classifyPromotionRisk({
    commits: [
      commit('d4', 'feat(api)!: remove legacy response shape'),
      commit('e5', 'security(auth): rotate session tokens'),
    ],
    changes: [{ status: 'D', path: 'apps/board/src/legacy-view.tsx' }],
  });

  assert.equal(result.requiresApproval, true);
  assert.equal(result.changeKind, 'major');
  assert.ok(result.reasons.includes('breaking-change'));
  assert.ok(result.reasons.includes('file-deletion:apps/board/src/legacy-view.tsx'));
});

test('renames consider both removed and added paths', () => {
  const result = classifyPromotionRisk({
    commits: [commit('f6', 'refactor: rename login module')],
    changes: [
      {
        status: 'R',
        previousPath: 'apps/board/src/login.ts',
        path: 'packages/auth/src/login.ts',
      },
    ],
  });

  assert.equal(result.requiresApproval, true);
  assert.ok(result.reasons.includes('sensitive-path:packages/auth/src/login.ts'));
});

test('invalid source commit messages fail closed', () => {
  const result = classifyPromotionRisk({
    commits: [{ sha: 'g7', parents: ['parent'], subject: 'change auth rules' }],
    changes: [],
  });

  assert.equal(result.requiresApproval, true);
  assert.equal(result.changeKind, 'invalid');
  assert.deepEqual(result.reasons, ['invalid-commit-message']);
});
