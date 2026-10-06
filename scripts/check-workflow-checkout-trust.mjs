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

function namedWorkflowStep(source, expectedName) {
  const lines = source.split(/\r?\n/u);
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^(?<indent>\s*)- name: (?<name>.+?)\s*$/u.exec(line);
    if (match?.groups?.name !== expectedName) continue;
    const indent = match.groups.indent.length;
    let end = index + 1;
    while (end < lines.length) {
      const candidate = lines[end];
      const candidateIndent = candidate.length - candidate.trimStart().length;
      if (candidateIndent === indent && candidate.startsWith(`${' '.repeat(indent)}- `)) break;
      end += 1;
    }
    matches.push(lines.slice(index, end).join('\n'));
  }
  return matches.length === 1 ? matches[0] : null;
}

export function inspectTrustedCheckoutPolicies({
  pages,
  visualReview,
  release,
  releasePrepare,
  dependencyCandidate,
  releasePlan,
  promote,
  issueIntake,
  issueIntakeRunner,
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
  if (!pages.includes('test "$(git rev-parse HEAD)" = "$release_sha"'))
    findings.push(
      'Pages must verify the checked-out release tag still matches its resolved commit.'
    );
  if (
    pages.indexOf('git checkout --detach "$RELEASE_TAG"') >
    pages.indexOf('name: Verify and select an immutable main source SHA')
  ) {
    findings.push('Pages must keep stable-tag checkout in its tag-selection step.');
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
  if (
    visualReview.includes('name: Publish screenshots for human review') &&
    (!visualReview.includes('id: scan_reports') ||
      !visualReview.includes("if: always() && steps.scan_reports.outcome == 'success'"))
  ) {
    findings.push('Visual review must scan reports successfully before uploading screenshots.');
  }
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

  if (pages.includes('compose-site:')) {
    if (!pages.includes('docs-site-$TAG.tar.gz'))
      findings.push(
        'Versioned Pages snapshots must use stable-tagged immutable release asset names.'
      );
    if (
      !pages.includes('jq -r \'.digest // empty\' <<< "$asset"') ||
      !pages.includes('jq -r \'.size\' <<< "$asset"')
    )
      findings.push('Versioned Pages assets must be reconciled by digest and size before reuse.');
    if (!pages.includes('name: Upload stable documentation archive'))
      findings.push('Stable docs archive must be available to the immutable release-asset job.');
    if (!pages.includes('versioned-site.mjs compose'))
      findings.push(
        'Pages must compose the retained version map before uploading the deploy artifact.'
      );
    if (!pages.includes("needs.compose-site.result == 'success'"))
      findings.push('Pages deployment must require a successfully composed versioned site.');
    if (!pages.includes('versioned-site.mjs plan --releases release-inventory.json --limit 5'))
      findings.push('Pages must apply the five-stable-release snapshot retention plan.');
  }

  if (promote) {
    const staleGuard = namedWorkflowStep(promote, 'Skip stale promotion events');
    const pullRequest = namedWorkflowStep(promote, 'Create or find the promotion pull request');
    const riskStep = namedWorkflowStep(promote, 'Classify risk from commits and changed paths');
    const report = namedWorkflowStep(promote, 'Refresh exact-SHA promotion report');
    const ensureLabel = namedWorkflowStep(promote, 'Ensure approval-required label exists');
    const sensitive = namedWorkflowStep(promote, 'Disable auto-merge and mark sensitive promotion');
    const lowRisk = namedWorkflowStep(promote, 'Enable merge for compatible, low-risk promotion');
    if (!staleGuard?.includes('current_sha="$(git ls-remote origin refs/heads/dev | cut -f1)"'))
      findings.push('Promotion must ignore stale dev push events before opening or updating a PR.');
    if (!staleGuard?.includes('if [[ "$current_sha" != "$EXPECTED_SHA" ]]'))
      findings.push('Promotion must compare the event SHA with the current dev head.');
    if (!staleGuard?.includes('echo \'stale=true\' >> "$GITHUB_OUTPUT"'))
      findings.push('Promotion must expose stale-event state so later steps can be skipped.');
    if (
      staleGuard &&
      staleGuard.indexOf('git fetch --no-tags origin') >= 0 &&
      staleGuard.indexOf('if [[ "$current_sha" != "$EXPECTED_SHA" ]]') >
        staleGuard.indexOf('git fetch --no-tags origin')
    ) {
      findings.push('Promotion must reject stale dev events before fetching promotion refs.');
    }
    if (
      !pullRequest?.includes(
        `number="$(gh pr list --base main --head dev --state open --json number --jq '.[0].number // empty')"`
      ) ||
      !pullRequest.includes('if [ -z "$number" ]; then') ||
      !pullRequest.includes('--base main') ||
      !pullRequest.includes('--head dev') ||
      pullRequest.indexOf('gh pr create') < pullRequest.indexOf('if [ -z "$number" ]; then')
    ) {
      findings.push(
        'Promotion must find the existing dev-to-main PR and create one only when absent.'
      );
    }
    if (
      !promote.includes('checks: read') ||
      !report?.includes('commits/$EXPECTED_SHA/check-runs?per_page=100') ||
      !report?.includes('promotion-current-body.md') ||
      !report?.includes('node scripts/render-promotion-report.mjs') ||
      !report?.includes('gh pr edit "$PR_NUMBER" --repo "$GH_REPO" --body-file "$report_file"')
    ) {
      findings.push(
        'Promotion must render an exact-SHA report with read-only check results and preserve/update the managed PR body safely.'
      );
    }
    for (const [name, step] of [
      ['PR lookup/create', pullRequest],
      ['risk classification', riskStep],
      ['promotion report', report],
      ['approval label', ensureLabel],
      ['sensitive approval', sensitive],
      ['low-risk merge', lowRisk],
    ]) {
      if (!step?.includes("if: steps.stale.outputs.stale != 'true'"))
        findings.push(`Promotion ${name} must not run for a stale dev push event.`);
    }
    if (
      promote.indexOf('name: Skip stale promotion events') >
      promote.indexOf('name: Create or find the promotion pull request')
    ) {
      findings.push('Promotion must reject a stale dev event before reconciling its pull request.');
    }
    if (
      !sensitive?.includes("steps.risk.outputs.approval_required == 'true'") ||
      !sensitive.includes('gh pr edit "$PR_NUMBER" --repo "$GH_REPO" --add-label approval-required')
    ) {
      findings.push('Sensitive promotion must be labeled for CODEOWNER approval.');
    }
    if (
      !sensitive?.includes('gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --disable-auto') ||
      !sensitive?.includes("steps.risk.outputs.approval_required == 'true'") ||
      sensitive?.includes('--auto') ||
      !lowRisk?.includes("steps.risk.outputs.approval_required != 'true'")
    ) {
      findings.push(
        'Sensitive promotion must disable auto-merge; only low-risk promotion may enable it.'
      );
    }
    if (
      !lowRisk?.includes(
        'gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --auto --merge --match-head-commit "$EXPECTED_SHA"'
      )
    ) {
      findings.push('Automatic promotion must be bound to the exact classified dev SHA.');
    }
    if (
      !lowRisk?.includes('gh pr view "$PR_NUMBER" --repo "$GH_REPO" --json labels') ||
      !lowRisk?.includes(
        'if jq -e \'index("approval-required") != null\' <<< "$labels" >/dev/null; then'
      ) ||
      !lowRisk?.includes(
        'gh pr edit "$PR_NUMBER" --repo "$GH_REPO" --remove-label approval-required'
      ) ||
      lowRisk.indexOf('--remove-label approval-required') >
        lowRisk.indexOf('gh pr merge "$PR_NUMBER" --repo "$GH_REPO" --auto')
    ) {
      findings.push(
        'Low-risk promotion must clear a stale approval-required label before auto-merge.'
      );
    }
  }

  if (issueIntake) {
    if (!issueIntake.includes('issue_comment:\n    types: [created]'))
      findings.push('Issue intake must process only newly created issue comments.');
    if (!issueIntake.includes('permissions:\n  contents: read'))
      findings.push('Issue intake must grant the workflow token contents: read only.');
    if (/^\s+(?:issues|contents|pull-requests|checks|actions):\s+write\s*$/mu.test(issueIntake))
      findings.push('Issue intake must not grant write permissions to workflow tokens.');
    const intakeCheckouts = checkoutSteps(issueIntake);
    if (
      intakeCheckouts.length !== 1 ||
      !intakeCheckouts[0].includes('ref: ${{ github.sha }}') ||
      !intakeCheckouts[0].includes('persist-credentials: false')
    )
      findings.push(
        'Issue intake must use one immutable event-SHA checkout without persisted credentials.'
      );
    const requireToken = namedWorkflowStep(
      issueIntake,
      'Require the least-privilege GitHub App permission verifier'
    );
    const mintToken = namedWorkflowStep(issueIntake, 'Mint repository-scoped metadata-read token');
    const runIntake = namedWorkflowStep(
      issueIntake,
      'Verify actor and report a read-only proposal'
    );
    if (
      !requireToken?.includes('ROADMAP_INTAKE_APP_CLIENT_ID') ||
      !requireToken.includes('ROADMAP_INTAKE_APP_PRIVATE_KEY') ||
      !requireToken.includes('exit 2')
    )
      findings.push('Issue intake must fail clearly when its GitHub App credentials are missing.');
    if (
      !mintToken?.includes('actions/create-github-app-token@') ||
      !mintToken.includes('permission-metadata: read') ||
      mintToken.includes('permission-issues:') ||
      mintToken.includes('permission-contents:')
    )
      findings.push(
        'Issue intake must mint a least-privilege GitHub App token with Metadata: read only.'
      );
    if (
      !runIntake?.includes('steps.intake-token.outputs.token') ||
      runIntake.includes('github.token') ||
      !runIntake.includes('GITHUB_EVENT_PATH')
    )
      findings.push(
        'Issue intake must use the scoped verifier token and trusted runner event payload.'
      );
    if (
      requireToken &&
      mintToken &&
      runIntake &&
      (issueIntake.indexOf(requireToken) > issueIntake.indexOf(mintToken) ||
        issueIntake.indexOf(mintToken) > issueIntake.indexOf(runIntake))
    )
      findings.push(
        'Issue intake must validate credentials, mint its token, then run the planner in order.'
      );
    if (
      !issueIntakeRunner?.includes('sourceSha: process.env.GITHUB_SHA') ||
      !issueIntakeRunner.includes('deliveryId: result.deliveryId') ||
      /proposal\.(?:rationale|requestedChange)|comment\.body|issue\.body/u.test(issueIntakeRunner)
    )
      findings.push(
        'Issue intake summary must bind a proposal ID to source SHA and omit user text.'
      );
  }

  return findings;
}

async function main() {
  const [
    pages,
    visualReview,
    release,
    releasePrepare,
    dependencyCandidate,
    releasePlan,
    promote,
    issueIntake,
    issueIntakeRunner,
  ] = await Promise.all([
    readFile(path.join(repositoryRoot, '.github/workflows/pages.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/visual-review.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/release.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/release-prepare.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/dependency-candidate.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/release-plan.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/promote.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/roadmap-issue-intake.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, 'scripts/roadmap/run-issue-intake.mjs'), 'utf8'),
  ]);
  const findings = inspectTrustedCheckoutPolicies({
    pages,
    visualReview,
    release,
    releasePrepare,
    dependencyCandidate,
    releasePlan,
    promote,
    issueIntake,
    issueIntakeRunner,
  });
  if (findings.length) {
    for (const finding of findings) process.stderr.write(`${finding}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    'Trusted checkout, promotion and issue-intake workflow policies are valid.\n'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
