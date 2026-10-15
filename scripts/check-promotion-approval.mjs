import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { codeownerLogins, hasFreshApproval } from './promotion-approval.mjs';

const [headSha, reviewsPath] = process.argv.slice(2);
if (!headSha || !reviewsPath) {
  process.stderr.write(
    'Usage: node scripts/check-promotion-approval.mjs <head-sha> <reviews-json-file>\n'
  );
  process.exit(2);
}

try {
  const reviewPages = JSON.parse(await readFile(reviewsPath, 'utf8'));
  const reviews = Array.isArray(reviewPages) ? reviewPages.flat(Infinity) : reviewPages;
  const codeowners = await readFile('.github/CODEOWNERS', 'utf8');
  if (!hasFreshApproval({ reviews, headSha, owners: codeownerLogins(codeowners) })) {
    process.stderr.write(`No current CODEOWNER approval exists for ${headSha}.\n`);
    process.exit(1);
  }
  process.stdout.write(`A CODEOWNER approved the exact promotion head ${headSha}.\n`);
} catch (error) {
  process.stderr.write(`Unable to verify promotion approval: ${error.message}\n`);
  process.exit(2);
}
