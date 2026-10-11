import process from 'node:process';
import { classifyCommits } from './release-classification.mjs';
import { readCommitRange, resolveCommit } from './git-range.mjs';

const arguments_ = process.argv.slice(2);
const summaryOnly = arguments_.includes('--summary');
const [base, head = 'HEAD'] = arguments_.filter((argument) => argument !== '--summary');
if (!base) {
  process.stderr.write('Usage: pnpm release:classify <base-ref> [head-ref] [--summary]\n');
  process.exit(2);
}

let commits;
try {
  const baseCommit = resolveCommit(base);
  const headCommit = resolveCommit(head);
  commits = readCommitRange(baseCommit, headCommit);
} catch (error) {
  process.stderr.write(
    `Unable to read commit range: ${error.stderr?.toString().trim() ?? error.message}\n`
  );
  process.exit(2);
}

const result = classifyCommits(commits);
if (summaryOnly) {
  process.stdout.write(
    `${JSON.stringify({
      changeKind: result.changeKind,
      commitCount: result.commits.length,
      skippedMergeCount: result.skippedMergeCommits.length,
      invalidCommits: result.invalidCommits,
    })}\n`
  );
} else {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
if (result.changeKind === 'invalid') process.exit(1);
