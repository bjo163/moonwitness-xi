# Monthly platform audit

The monthly audit is a read-only inventory. It records Actions artifacts and 90-day workflow outcomes, repository/workflow permissions, available package registry and billing data, the Node.js release schedule, and dated upstream support reviews for Node.js, pnpm, PostgreSQL, Playwright and the Actions runner image. It compares the result to the previous successful baseline artifact when that artifact is still available.

Run locally with an authenticated GitHub CLI:

```powershell
pnpm platform:audit -- --repo bjo163/moonwitness-xi --output platform-audit-baseline.json
```

Use `--previous <report.json>` to calculate deltas from an earlier report. Never commit a report containing private repository metadata; the scheduled workflow stores its report as a 90-day Actions artifact and writes a concise summary. Monthly scheduling runs from the default branch; `workflow_dispatch` is available for a manual read-only snapshot.

The monthly report checks scheduled-event freshness separately from manual dispatch for the weekly browser matrix, deep PostgreSQL/jobs/restore regression, CodeQL, Gitleaks, and the monthly audit itself. Each entry records its most recent run and successful run, with an 8-day weekly or 38-day monthly threshold. Missing scheduled history, a failed latest run, or a stale success is reported as a limitation; run status is not inferred from a manually dispatched success.

The general 90-day workflow inventory is limited to GitHub's 1,000-run API window. To keep that cap from hiding a scheduled run, the audit also queries each required scheduled workflow by its workflow file and `event=schedule`, then computes freshness from those targeted results. These requests use the same read-only Actions permission. API rate-limit or access errors stop the audit rather than silently treating a schedule as missing.

The workflow token needs only `contents: read` and `actions: read`. Repository package inventory or billing APIs can return `403`/`404` when the repository/account plan or token does not expose those capabilities. Such fields remain `unknown`; they must not be interpreted as zero. Record the missing capability and owner in the next review.

The cleanup section is a plan only. It classifies only known ephemeral report names and only after 90 days; release, provenance, evidence, backup, restore, migration and unknown names are never candidates. The audit has no deletion implementation or write permission. Review retention settings and published release assets separately before proposing any cleanup change.

Node.js end-of-life is checked against the official [`nodejs/Release` schedule](https://github.com/nodejs/Release/blob/main/schedule.json). Review the pinned Ubuntu runner image, pnpm, PostgreSQL, Playwright, and GitHub Action runtime notices against their official support schedules during each audit; the report deliberately leaves those upstream checks visible as human follow-up rather than inferring support from a version number alone.

The [runtime support review ledger](../engineering/runtime-support-review.json) records the configured version, responsible owner, last review date, next review deadline, and official source for each component. The report marks a review `due` on its deadline and `overdue` after it; these are review-freshness states, not claims that a component has reached end of support. Update the ledger only after checking its linked upstream source and current repository configuration. The Ubuntu runner review is due before GitHub's announced November 2026 `ubuntu-latest` transition so the pinned 24.04 runner can be deliberately revalidated.
