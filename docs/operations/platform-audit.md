# Monthly platform audit

The monthly audit is a read-only inventory. It records Actions artifacts and 90-day workflow outcomes, repository/workflow permissions, available package registry and billing data, and the Node.js release schedule. It compares the result to the previous successful baseline artifact when that artifact is still available.

Run locally with an authenticated GitHub CLI:

```powershell
pnpm platform:audit -- --repo bjo163/moonwitness-xi --output platform-audit-baseline.json
```

Use `--previous <report.json>` to calculate deltas from an earlier report. Never commit a report containing private repository metadata; the scheduled workflow stores its report as a 120-day Actions artifact and writes a concise summary. Monthly scheduling runs from the default branch; `workflow_dispatch` is available for a manual read-only snapshot.

The workflow token needs only `contents: read` and `actions: read`. Repository package inventory or billing APIs can return `403`/`404` when the repository/account plan or token does not expose those capabilities. Such fields remain `unknown`; they must not be interpreted as zero. Record the missing capability and owner in the next review.

The cleanup section is a plan only. It classifies only known ephemeral report names and only after 90 days; release, provenance, evidence, backup, restore, migration and unknown names are never candidates. The audit has no deletion implementation or write permission. Review retention settings and published release assets separately before proposing any cleanup change.

Node.js end-of-life is checked against the official [`nodejs/Release` schedule](https://github.com/nodejs/Release/blob/main/schedule.json). Review the pinned Ubuntu runner image, pnpm, PostgreSQL, Playwright, and GitHub Action runtime notices against their official support schedules during each audit; the report deliberately leaves those upstream checks visible as human follow-up rather than inferring support from a version number alone.
