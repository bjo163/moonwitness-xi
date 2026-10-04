import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { classifyCommits } from './release-classification.mjs';

const arguments_ = process.argv.slice(2);
const summaryOnly = arguments_.includes('--summary');
const [base, head = 'HEAD'] = arguments_.filter((argument) => argument !== '--summary');
if (!base) {
  process.stderr.write('Usage: pnpm release:classify <base-ref> [head-ref] [--summary]\n');
  process.exit(2);
}

let output;
try {
  const resolveCommit = (reference) =>
    execFileSync(
      'git',
      ['rev-parse', '--verify', '--quiet', '--end-of-options', `${reference}^{commit}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  const baseCommit = resolveCommit(base);
  const headCommit = resolveCommit(head);
  output = execFileSync(
    'git',
    ['log', '--format=%H%x00%P%x00%s%x00%b%x1e', `${baseCommit}..${headCommit}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (error) {
  process.stderr.write(
    `Unable to read commit range: ${error.stderr?.toString().trim() ?? error.message}\n`
  );
  process.exit(2);
}

const commits = output
  .split('\x1e')
  .map((record) => record.trim())
  .filter(Boolean)
  .map((record) => {
    const [sha, parentList, subject, ...bodyParts] = record.split('\x00');
    return {
      sha,
      parents: parentList ? parentList.trim().split(/\s+/) : [],
      subject,
      body: bodyParts.join('\x00').trim(),
    };
  });

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
