# Baseline kualitas MoonWitness

Recorded on 2026-10-04 from local Windows workspace, branch dev at source before this baseline commit. Re-run against the final source SHA in GitHub CI; the values below are measurements, not release guarantees.

| Check                                           | Command                                    | Result                                                                                                       |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Root ESLint                                     | pnpm lint                                  | Pass, exit 0                                                                                                 |
| Formatting, after formatting new inventory docs | pnpm format:check                          | Pass, exit 0; run again before commit                                                                        |
| Monorepo production build                       | pnpm build                                 | Pass, exit 0; Board built with Vite 8.3.2                                                                    |
| Root workspace tests                            | pnpm test                                  | Pass, 123 passed, 3 skipped; 19 test files pass, 1 PostgreSQL integration file skipped                       |
| API tests                                       | via pnpm test                              | 69 passed, 3 skipped across 10 pass and 1 skipped files                                                      |
| Base addon                                      | pnpm --filter @moonwitness/orm-base test   | 18 passed across 3 files, including TypeScript check                                                         |
| Board typecheck                                 | pnpm --filter @moonwitness/board typecheck | Pass, tsc -b                                                                                                 |
| Board lint                                      | pnpm --filter @moonwitness/board lint      | Exit 0 with 15 existing warnings; see table below                                                            |
| PostgreSQL integration                          | root test in local Windows env             | Skipped because POSTGRES_TEST_URL was not configured in this shell; not counted as passed                    |
| Board production bundle                         | pnpm build                                 | main JS 434.89 kB / 134.12 kB gzip; model page chunk 143.68 kB / 29.29 kB gzip; CSS 64.47 kB / 11.80 kB gzip |
| Docker/container smoke                          | not run locally during baseline            | Must run in GitHub Linux CI                                                                                  |
| Browser E2E                                     | no Board browser specs found               | Missing; M3                                                                                                  |

## Board lint warnings

Board oxlint exits zero but reports 15 warnings:

| Count | File                                          | Rule/issue                                   |
| ----- | --------------------------------------------- | -------------------------------------------- |
| 1     | src/components/ui/button.tsx                  | react(only-export-components)                |
| 1     | src/hooks/use-auth.tsx                        | react(only-export-components)                |
| 1     | src/components/layout/activity-bell.tsx       | impure Date during render                    |
| 3     | src/components/views/query-builder-dialog.tsx | set-state-in-effect twice; hook dependencies |
| 2     | src/components/views/form-view.tsx            | set-state-in-effect; hook dependencies       |
| 2     | src/components/views/fields.tsx               | react(only-export-components) twice          |
| 2     | src/components/views/chatter.tsx              | impure Date.now during render twice          |
| 2     | src/components/views/import-wizard-dialog.tsx | useMemo dependencies                         |
| 1     | src/components/views/list-view.tsx            | react(preserve-manual-memoization)           |

Treat these as baseline debt, then address in focused changes with behavior tests. Do not suppress warning rules wholesale.

## Performance measurement plan

One local Vite bundle measurement is only an initial reference. It is not a stable budget. M0.06/M4.15 should add repeatable runner measurement and compare before setting threshold. Include route-specific compressed chunks; avoid declaring all JS shipped on initial route when lazy-loaded.
