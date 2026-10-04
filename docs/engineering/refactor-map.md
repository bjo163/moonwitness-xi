# Refactor candidates from initial source scan

This list is a review queue, not a mandate to split files by line count. Preserve existing behavior; first add a behavior assertion, then extract one responsibility, then compare the consumer and bundle/test results.

| Candidate                  | Observed source                                                            | Potential responsibility boundary                                                   | Risk and first safe step                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Generic API route          | apps/api/src/routes/generic.routes.ts, 1169 lines                          | metadata endpoints, list/query parsing, record CRUD/actions, JSON-RPC orchestration | High authorization risk; map route tests and policies before moving any handler. Keep one plugin registration/public contract. |
| Board list view            | apps/board/src/components/views/list-view.tsx, 1382 lines                  | query state, table presentation, grouping/pagination/actions                        | High state/cache risk; M3 list E2E first; extract pure typed helpers before components.                                        |
| Base addon installer       | packages/orm/src/addon.ts, 415 lines                                       | dependency order, metadata registry, schema transaction, stable seed upsert         | Core contract; do not split until fault/upgrade tests distinguish boundaries.                                                  |
| BaseModel                  | packages/orm/src/base.model.ts, 394 lines                                  | filter/order parsing, search/count, validation/hooks                                | Correctness/performance sensitive; preserve SQL semantics and relation/count regressions.                                      |
| Form view                  | apps/board/src/components/views/form-view.tsx, 407 lines                   | form state, metadata field rendering, submit/error navigation                       | M3 negative-validation/double-submit coverage first.                                                                           |
| Jobs admin routes          | apps/api/src/routes/jobs.routes.ts, 397 lines                              | read/health endpoints vs retry/cancel/cron mutations                                | Keep admin checks and audit behavior at route boundary; test unauthorized actions first.                                       |
| Seed module                | packages/orm-base/src/data.ts, 350 lines                                   | required reference, core accounts/company, demo examples                            | Only split if data category/API becomes clearer; stable IDs and ordering must remain deterministic.                            |
| Empty addons scaffold      | packages/addons has no sources in initial inventory                        | Could become addon template workspace later                                         | Decide remove or define purpose at M9; don't create empty packages now.                                                        |
| Similar validation helpers | isObject/parseInteger live in generic routes; countValue is in jobs routes | Candidate only if same semantic contract and multiple consumers are established     | Names alone do not justify centralization; avoid a generic utils dumping ground.                                               |

## Initial duplication/coupling evidence

- Dynamic API query and mutation orchestration are concentrated in one plugin; a route refactor could accidentally bypass policy/record rule checks.
- Board's list view is the largest listed TSX file, but no Board browser tests exist at baseline. Do not start structural rewrite until M3.01/M3.06 can detect regressions.
- Addon and model search/count both contain distinct ORM responsibilities; keep them in packages/orm and avoid API importing model internals.
- Reuse is not yet sufficient evidence for packages/ui/assets or chart package in this inventory; those are explicit roadmap deliverables justified by Board+docs consumers.

## Dependency and bundle follow-up

Use pnpm workspace graph and consumer searches before removing dependencies. Vite reports lazy chunks; route-specific size must be recorded before/after. Do not confuse TS source lines, minified byte size and compressed initial transfer.
