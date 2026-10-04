import { readChangedFiles, resolveCommit } from './git-range.mjs';
import { classifyDocumentationFiles } from './docs-change-policy.mjs';
import process from 'node:process';

const [baseRef, headRef] = process.argv.slice(2);
if (!baseRef || !headRef) {
  process.stderr.write('Usage: node scripts/classify-docs-change.mjs <base-ref> <head-ref>\n');
  process.exit(2);
}

try {
  const base = resolveCommit(baseRef);
  const head = resolveCommit(headRef);
  const files = readChangedFiles(base, head);
  const classification = classifyDocumentationFiles(files);
  process.stdout.write(
    `${JSON.stringify({ baseSha: base, headSha: head, ...classification }, null, 2)}\n`
  );
} catch (error) {
  process.stderr.write(`Unable to classify documentation changes: ${error.message}\n`);
  process.exit(2);
}
