# Runtime and maintenance support baseline

Observed values on 2026-10-04:

| Component      | Repository configuration                                     | Local observation                                 | Policy status                                                         |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| Node.js        | Docker build/runtime Node 22; GitHub Actions node-version 22 | local Node v26.5.0                                | Node 22 is the validated CI/container line; local 26 is not validated |
| pnpm           | Corepack/Docker pnpm 11; actions setup version 11            | local pnpm 11.17.0                                | Major pinned; exact Corepack resolution is not pinned                 |
| PostgreSQL     | Docker Compose/service postgres:16-alpine                    | CI integration and E2E services use PostgreSQL 16 | PostgreSQL 16 is the currently tested major                           |
| Browser        | Playwright 1.63.0 from lockfile; CI installs Chromium        | Three Board E2E scenarios run in Chromium         | Chromium is the only tested browser; Firefox/WebKit are not claimed   |
| Actions runner | ubuntu-latest                                                | Remote Actions jobs completed on ubuntu-latest    | Label can move to a new image; no exact image pin                     |
| Coverage       | No coverage baseline command/result recorded                 | unavailable                                       | Add scoped coverage to M2.13; don't assert zero or 100%               |
| Performance    | Board bundle build reports compressed and raw chunk sizes    | No stable application latency/load benchmark      | Establish repeatable app/query budgets before gating                  |

## Initial CI service objectives (measurement targets, not guarantees)

- PR quick verification target: under 10 minutes wall-clock, measured over at least 10 representative affected runs. Not yet measured as a separate stable cohort.
- Full promotion suite target: under 20 minutes wall-clock, measured over at least 10 full runs. Nine successful full push runs are currently observed at 2.57–3.73 minutes (3.24-minute mean); see [M0.06 evidence](../roadmap/evidence/M0.06.md). The sample count is still short of the target.
- If targets are missed, report slow jobs and separate required gates; never omit PostgreSQL/browser/security merely to hit the target.
- Browser failure reports/traces/screenshots/video use explicit 7-day artifact retention in CI. Repository-level artifact/log retention is inherited (`artifact_and_log_retention_days` is unset in the repository API); actual log retention remains unverified.
- Scheduled reliability: GitHub schedules are best-effort; workflows must be manually runnable and M8.10 must find stale/missed runs.

Measure one workflow's wall-clock duration with `gh api repos/bjo163/moonwitness-xi/actions/runs/RUN_ID --jq '[.run_started_at,.updated_at]'`; convert the timestamps to minutes. This includes queue time and is a conservative workflow-level budget, not a job-duration or app-latency benchmark.

Before calling these supported policy, confirm the chosen runtime is still maintained, CI/container parity passes, and dependency compatibility is verified. Upgrade supported major versions with dedicated matrix and release notes.
