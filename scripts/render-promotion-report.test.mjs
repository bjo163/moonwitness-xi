import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { renderPromotionReport, replacePromotionReport } from './render-promotion-report.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const repository = 'owner/repo';

function input(overrides = {}) {
  return {
    repository,
    baseSha,
    headSha,
    commits: ['fix(roadmap): harden sync (M11.03)'],
    changedFiles: ['scripts/roadmap/sync-issues.mjs'],
    tasks: [
      {
        id: 'M11.03',
        title: 'Build issue | sync\nrenderer',
        detailFile: 'docs/roadmap/11-issues-delivery.md',
        status: 'open',
      },
    ],
    risk: { requiresApproval: true, reasons: ['sensitive-path:scripts/example.mjs'] },
    checks: [
      {
        name: 'ci-gate',
        status: 'completed',
        conclusion: 'success',
        detailsUrl: 'https://github.com/owner/repo/actions/runs/123',
      },
      {
        name: '<img src=x>|CodeQL',
        status: 'in_progress',
        conclusion: null,
        detailsUrl: 'https://evil.example/forged',
      },
    ],
    releasePlan: {
      status: 'planned',
      currentVersion: 'v1.0.0',
      nextVersion: 'v1.0.1-rc.1',
      changeKind: 'patch',
    },
    ...overrides,
  };
}

test('promotion report binds tasks, checks, version and risk to exact source SHA', () => {
  const report = renderPromotionReport(input());
  assert.match(report, new RegExp(`Source: \`${headSha.slice(0, 12)}\``));
  assert.match(
    report,
    /\[M11\.03\]\(https:\/\/github\.com\/owner\/repo\/blob\/[a-f0-9]{40}\/docs\/roadmap\/11-issues-delivery\.md\)/u
  );
  assert.match(report, /Build issue \\?\| sync renderer/u);
  assert.match(report, /ci-gate \| completed \/ success/u);
  assert.match(report, /CodeQL \| in_progress \/ pending/u);
  assert.match(report, /&lt;img src=x&gt;\\\|CodeQL/u);
  assert.doesNotMatch(report, /evil\.example|<img/u);
  assert.match(report, /v1\.0\.1-rc\.1/u);
  assert.match(report, /Approval required/u);
});

test('report marks unavailable release baseline and missing check runs without inventing success', () => {
  const report = renderPromotionReport(input({ checks: [], releasePlan: undefined }));
  assert.match(report, /no stable release baseline is configured/u);
  assert.match(report, /No checks reported \| pending \/ pending/u);
  assert.doesNotMatch(report, /passed|success/u);
});

test('managed report replacement preserves manual notes and is idempotent', () => {
  const report = renderPromotionReport(input());
  const original = 'Maintainer notes\n\nKeep this section.';
  const first = replacePromotionReport(original, report);
  const second = replacePromotionReport(first, report);
  assert.equal(second, first);
  assert.ok(second.endsWith(original));
  assert.equal(second.split('Automated promotion report').length - 1, 1);
});

test('managed report refuses malformed markers instead of overwriting PR content', () => {
  const report = renderPromotionReport(input());
  assert.throws(
    () => replacePromotionReport('Human text\n<!-- BEGIN MOONWITNESS PROMOTION REPORT -->', report),
    /malformed or duplicate report markers/u
  );
  assert.throws(
    () =>
      replacePromotionReport(
        '<!-- END MOONWITNESS PROMOTION REPORT -->\n<!-- BEGIN MOONWITNESS PROMOTION REPORT -->',
        report
      ),
    /reversed report markers/u
  );
});

test('promotion workflow refreshes one managed report from event SHA and preserves PR write boundaries', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/promote.yml', import.meta.url),
    'utf8'
  );
  assert.match(workflow, /checks: read/u);
  assert.match(workflow, /commits\/\$EXPECTED_SHA\/check-runs/u);
  assert.match(workflow, /node scripts\/render-promotion-report\.mjs/u);
  assert.match(
    workflow,
    /gh pr edit "\$PR_NUMBER" --repo "\$GH_REPO" --body-file "\$report_file"/u
  );
  assert.match(workflow, /git tag --list 'v\[0-9\]\*'/u);
  assert.match(
    workflow,
    /gh pr edit "\$PR_NUMBER" --repo "\$GH_REPO" --add-label approval-required/u
  );
});
