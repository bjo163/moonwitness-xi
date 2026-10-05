import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function checkoutSteps(source) {
  const starts = [
    ...source.matchAll(/^(?<indent>\s*)-\s+uses:\s+actions\/checkout@[^\r\n]*\r?\n/gmu),
  ];
  return starts.map((match, index) => {
    const start = match.index + match[0].length;
    const indent = match.groups.indent.length;
    const next = starts[index + 1]?.index ?? source.length;
    const block = source.slice(start, next);
    const stepStart = block.search(new RegExp(`^\\s{0,${indent}}-\\s`, 'mu'));
    return stepStart < 0 ? block : block.slice(0, stepStart);
  });
}

export function inspectTrustedCheckoutPolicies({ pages, visualReview }) {
  const findings = [];
  for (const [name, source] of [
    ['pages.yml', pages],
    ['visual-review.yml', visualReview],
  ]) {
    const steps = checkoutSteps(source);
    if (steps.length === 0) {
      findings.push(`${name} must have a reviewed checkout step.`);
      continue;
    }
    for (const [index, checkout] of steps.entries()) {
      if (!checkout.includes('ref: ${{ github.sha }}'))
        findings.push(
          `${name} checkout ${index + 1} must use the immutable event SHA, not a dispatch input.`
        );
      if (!checkout.includes('persist-credentials: false'))
        findings.push(
          `${name} checkout ${index + 1} must not persist the workflow token in git config.`
        );
      if (/\$\{\{\s*inputs\./u.test(checkout))
        findings.push(
          `${name} checkout ${index + 1} must not interpolate workflow-dispatch input.`
        );
    }
  }

  if (!pages.includes('DISPATCH_REF" != "refs/heads/dev"'))
    findings.push('Pages preview dispatch must be restricted to the protected dev branch.');
  if (!pages.includes('DISPATCH_REF" != "refs/heads/main"'))
    findings.push('Pages publication dispatch must be restricted to the protected main branch.');
  if (!pages.includes('git merge-base --is-ancestor "$release_sha" refs/remotes/origin/main'))
    findings.push('Release-tag checkout must verify that the tag is reachable from main.');
  if (
    pages.indexOf('git merge-base --is-ancestor "$release_sha" refs/remotes/origin/main') >
    pages.indexOf('git checkout --detach "$RELEASE_TAG"')
  ) {
    findings.push('Pages must validate a release tag before checking out its source code.');
  }

  if (!visualReview.includes('DISPATCH_REF" != "refs/heads/dev"'))
    findings.push('Visual review dispatch must be restricted to the protected dev branch.');
  if (/^\s{4}inputs:/mu.test(visualReview))
    findings.push('Visual review must not accept an arbitrary ref input.');

  return findings;
}

async function main() {
  const [pages, visualReview] = await Promise.all([
    readFile(path.join(repositoryRoot, '.github/workflows/pages.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/visual-review.yml'), 'utf8'),
  ]);
  const findings = inspectTrustedCheckoutPolicies({ pages, visualReview });
  if (findings.length) {
    for (const finding of findings) process.stderr.write(`${finding}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Pages and visual-review checkout trust policies are valid.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
