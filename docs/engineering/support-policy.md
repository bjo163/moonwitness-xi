# Runtime and maintenance support baseline

Observed values on 2026-10-04:

| Component      | Repository configuration                                     | Local observation                                      | Policy status                                                                        |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Node.js        | Docker build/runtime Node 22; GitHub Actions node-version 22 | local Node v26.5.0                                     | CI/container are source of supported build runtime; local 26 is not validated        |
| pnpm           | Corepack/Docker pnpm 11; actions setup version 11            | local pnpm 11.17.0                                     | Major pinned, exact Corepack resolution not fully documented                         |
| PostgreSQL     | Docker Compose/service postgres:16-alpine                    | local integration URL absent during baseline           | Postgres 16 CI is intended; integration must become required                         |
| Browser        | No E2E runner/config found                                   | Not measured                                           | Define supported browser matrix in M3.11                                             |
| Actions runner | ubuntu-latest                                                | Remote run version not recorded in this local baseline | Runner can change; pin OS only if reproducibility needs it and review update process |
| Coverage       | No coverage baseline command/result recorded                 | unavailable                                            | Add scoped coverage to M2.13; don't assert zero or 100%                              |
| Performance    | One local Vite bundle output recorded in baseline.md         | No stable runner benchmark                             | Establish same-runner repeatable budgets before gating                               |

## Initial CI service objectives (measurement targets, not guarantees)

- PR quick verification target: under 10 minutes after caching, measured over at least 10 representative runs.
- Full promotion suite target: under 20 minutes after caching, measured over at least 10 representative runs.
- If targets are missed, report slow jobs and separate required gates; never omit PostgreSQL/browser/security merely to hit the target.
- Artifact retention: retain routine failure traces 14 days initially; release evidence and immutable artifacts follow release retention policy. Confirm repository policy/cost before activation.
- Scheduled reliability: GitHub schedules are best-effort; workflows must be manually runnable and M8.10 must find stale/missed runs.

Before calling these supported policy, confirm the chosen runtime is still maintained, CI/container parity passes, and dependency compatibility is verified. Upgrade supported major versions with dedicated matrix and release notes.
