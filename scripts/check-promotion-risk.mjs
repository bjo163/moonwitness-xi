import process from 'node:process';
import { readChangedFiles, readCommitRange, resolveCommit } from './git-range.mjs';
import { classifyPromotionRisk } from './promotion-risk.mjs';

const [base, head, ...options] = process.argv.slice(2);
if (!base || !head) {
  process.stderr.write(
    'Usage: node scripts/check-promotion-risk.mjs <base-ref> <head-ref> [--summary]\n'
  );
  process.exit(2);
}

try {
  const baseCommit = resolveCommit(base);
  const headCommit = resolveCommit(head);
  const result = classifyPromotionRisk({
    commits: readCommitRange(baseCommit, headCommit),
    changes: readChangedFiles(baseCommit, headCommit),
  });
  result.headSha = headCommit;

  if (options.includes('--summary')) {
    process.stdout.write(
      `approval_required=${result.requiresApproval}\nreasons=${JSON.stringify(result.reasons)}\nchange_kind=${result.changeKind}\nhead_sha=${result.headSha}\n`
    );
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  if (result.changeKind === 'invalid') process.exit(1);
} catch (error) {
  process.stderr.write(
    `Unable to classify promotion risk: ${error.stderr?.toString().trim() ?? error.message}\n`
  );
  process.exit(2);
}
