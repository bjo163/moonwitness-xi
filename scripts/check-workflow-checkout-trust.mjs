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

export function inspectTrustedCheckoutPolicies({
  pages,
  visualReview,
  release,
  releasePrepare,
  dependencyCandidate,
  releasePlan,
}) {
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
      if (checkout.includes('${{ inputs.') || checkout.includes('${{inputs.'))
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
  if (!pages.includes('isPrerelease == false'))
    findings.push('Pages must reject prerelease releases as stable documentation sources.');
  if (!pages.includes('SOURCE_REF" =~ ^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'))
    findings.push('Pages publication must accept only stable SemVer release tags.');
  if (!pages.includes('git merge-base --is-ancestor "$SOURCE_SHA" refs/remotes/origin/main'))
    findings.push('Pages SHA recovery must require the exact source to be reachable from main.');
  if (!pages.includes('git cat-file -e "$SOURCE_SHA^{commit}"'))
    findings.push('Pages SHA recovery must require a full commit object before checkout.');
  if (!pages.includes('git checkout --detach "$SOURCE_SHA"'))
    findings.push('Pages recovery must rebuild from the exact requested source SHA.');
  if (
    pages.indexOf('git merge-base --is-ancestor "$SOURCE_SHA" refs/remotes/origin/main') >
    pages.indexOf('git checkout --detach "$SOURCE_SHA"')
  ) {
    findings.push('Pages must validate a recovery SHA before checking out its source code.');
  }

  if (!visualReview.includes('DISPATCH_REF" != "refs/heads/dev"'))
    findings.push('Visual review dispatch must be restricted to the protected dev branch.');
  if (visualReview.split(/\r?\n/u).some((line) => line.startsWith('    inputs:')))
    findings.push('Visual review must not accept an arbitrary ref input.');

  if (release) {
    if (
      !release.includes(
        "if: github.event_name == 'workflow_dispatch' && inputs.publish && github.ref_type == 'tag'"
      )
    )
      findings.push('Release publishing must require an explicit dispatch on a version tag.');
    if (!release.includes('needs: verify'))
      findings.push('Release publishing must depend on the verification job.');
    if (!release.includes('test "$remote_tag_sha" = "$EXPECTED_SOURCE_SHA"'))
      findings.push('Release publishing must revalidate the exact source tag SHA before writes.');
  }

  if (releasePrepare) {
    if (!releasePrepare.includes("if: github.ref == 'refs/heads/dev'"))
      findings.push('Release preparation must only run from dev.');
    if (!releasePrepare.includes('test "$EXPECTED_SOURCE_SHA" = "$ACTUAL_SOURCE_SHA"'))
      findings.push('Release preparation must reject an input SHA different from the event SHA.');
    if (!releasePrepare.includes('node scripts/push-expected-ref.mjs origin HEAD refs/heads/dev'))
      findings.push('Release preparation must publish with an expected-dev-SHA guard.');
  }

  if (dependencyCandidate) {
    if (!dependencyCandidate.includes("if: github.ref == 'refs/heads/dev'"))
      findings.push('Dependency candidate workflow must only run from dev.');
    if (
      !dependencyCandidate.includes(
        'node scripts/push-expected-ref.mjs origin "$EXPECTED_CANDIDATE_SHA" refs/heads/dev "$EXPECTED_SOURCE_SHA"'
      )
    )
      findings.push('Dependency candidate publication must use the expected source SHA guard.');
    if (
      !dependencyCandidate.includes(
        'gh workflow run promote.yml --repo "$GITHUB_REPOSITORY" --ref dev'
      )
    )
      findings.push(
        'Dependency candidate must explicitly dispatch promotion after its GITHUB_TOKEN push.'
      );
    if (!dependencyCandidate.includes('gh workflow run ci.yml --repo "$GH_REPO" --ref dev'))
      findings.push(
        'Dependency candidate must explicitly dispatch full CI after its GITHUB_TOKEN push.'
      );
  }

  if (releasePlan) {
    if (!releasePlan.includes("if: github.ref == 'refs/heads/dev'"))
      findings.push('Release dry-run must only run from dev.');
    if (!releasePlan.includes('permissions:\n  contents: read'))
      findings.push('Release dry-run workflow must remain read-only.');
    if (!releasePlan.includes('pnpm release:dry-run'))
      findings.push('Release dry-run workflow must use the shared release planner.');
    if (!releasePlan.includes('actions/upload-artifact@'))
      findings.push('Release dry-run workflow must retain a reviewable plan artifact.');
    if (/packages:\s*write|deploy-pages|docker push|gh release create/u.test(releasePlan))
      findings.push(
        'Release dry-run workflow must not publish packages, releases, or deployments.'
      );
  }

  return findings;
}

async function main() {
  const [pages, visualReview, release, releasePrepare, dependencyCandidate, releasePlan] =
    await Promise.all([
      readFile(path.join(repositoryRoot, '.github/workflows/pages.yml'), 'utf8'),
      readFile(path.join(repositoryRoot, '.github/workflows/visual-review.yml'), 'utf8'),
      readFile(path.join(repositoryRoot, '.github/workflows/release.yml'), 'utf8'),
      readFile(path.join(repositoryRoot, '.github/workflows/release-prepare.yml'), 'utf8'),
      readFile(path.join(repositoryRoot, '.github/workflows/dependency-candidate.yml'), 'utf8'),
      readFile(path.join(repositoryRoot, '.github/workflows/release-plan.yml'), 'utf8'),
    ]);
  const findings = inspectTrustedCheckoutPolicies({
    pages,
    visualReview,
    release,
    releasePrepare,
    dependencyCandidate,
    releasePlan,
  });
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
