# Refactor candidates from initial source scan

This list is a review queue, not a mandate to split files by line count. Preserve existing behavior; first add a behavior assertion, then extract one responsibility, then compare the consumer and bundle/test results.

| Candidate                  | Current source (2026-10-06)                                                    | Potential responsibility boundary                                                   | Risk and first safe step                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Generic API route          | apps/api/src/routes/generic.routes.ts, 1420 lines                              | metadata endpoints, list/query parsing, record CRUD/actions, JSON-RPC orchestration | High authorization risk; preserve API auth/record-rule/tenant E2E before moving one cohesive behavior family. |
| Board list view            | apps/board/src/components/views/list-view.tsx, 1406 lines                      | query state, table presentation, grouping/pagination/actions                        | High state/cache risk; retain current list/import/export/relations E2E and extract pure typed helpers first.  |
| Base addon installer       | packages/orm/src/addon.ts, 415 lines (historical baseline; remeasure on edits) | dependency order, metadata registry, schema transaction, stable seed upsert         | Core contract; do not split until fault/upgrade tests distinguish boundaries.                                 |
| BaseModel                  | packages/orm/src/base.model.ts, 394 lines (historical baseline; remeasure)     | filter/order parsing, search/count, validation/hooks                                | Correctness/performance sensitive; preserve SQL semantics and relation/count regressions.                     |
| Form view                  | apps/board/src/components/views/form-view.tsx, 407 lines (historical)          | form state, metadata field rendering, submit/error navigation                       | Keep current negative-validation/double-submit browser assertions before extraction.                          |
| Jobs admin routes          | apps/api/src/routes/jobs.routes.ts, 397 lines (historical)                     | read/health endpoints vs retry/cancel/cron mutations                                | Keep admin checks and audit behavior at route boundary; test unauthorized actions first.                      |
| Seed module                | packages/orm-base/src/data.ts, 350 lines (historical)                          | required reference, core accounts/company, demo examples                            | Only split if data category/API becomes clearer; stable IDs and ordering must remain deterministic.           |
| Empty addons scaffold      | packages/addons has no sources in initial inventory                            | Could become addon template workspace later                                         | Re-evaluate purpose before adding any empty or unconsumed package.                                            |
| Similar validation helpers | isObject/parseInteger live in generic routes; countValue is in jobs routes     | Candidate only if same semantic contract and multiple consumers are established     | Names alone do not justify centralization; avoid a generic utils dumping ground.                              |

## Initial duplication/coupling evidence

- Dynamic API query and mutation orchestration are concentrated in one plugin; a route refactor could accidentally bypass policy/record rule checks.
- Board's list view is the largest listed TSX file, but no Board browser tests exist at baseline. Do not start structural rewrite until M3.01/M3.06 can detect regressions.
- Addon and model search/count both contain distinct ORM responsibilities; keep them in packages/orm and avoid API importing model internals.
- Reuse is not yet sufficient evidence for packages/ui/assets or chart package in this inventory; those are explicit roadmap deliverables justified by Board+docs consumers.

## Dependency and bundle follow-up

Use pnpm workspace graph and consumer searches before removing dependencies. The table's source-line values are current where measured and explicitly marked historical otherwise; refresh the touched row whenever a candidate changes. Vite reports lazy chunks; route-specific size must be recorded before/after in a like-for-like build. Do not confuse TS source lines, minified byte size and compressed initial transfer.

## Dependency and cycle audit (2026-10-04)

- Re-run the static workspace inventory with `pnpm audit:workspace`; implementation is in `scripts/audit-workspace.mjs` and uses the repository's TypeScript compiler, so it adds no analyzer dependency.
- The audit covered 10 workspace packages plus the root and 153 source/config script files. It found no runtime import cycle and no workspace runtime dependency cycle.
- Two reported file-level cycles are type-only edges around `BaseModel`, `Environment`, and `Registry`. `BaseModel` imports `Environment` at runtime; the back-references from `Environment` and `Registry` are `import type`, so they do not create a runtime cycle. Keep this coupling visible and reassess if the ORM public types are refactored.
- The Board declared `@tanstack/react-table` and `cn` without importing either. The table dependency was unused; the app's `cn` helper is implemented locally in `src/lib/utils.ts` using `clsx` and `tailwind-merge`. Both direct dependencies and their now-unreachable lockfile packages were removed.
- The command deliberately reports unused dependency _candidates_, not automatic removals. TypeScript ambient types, CSS/config imports, package scripts, ORM dialect adapters (`pg`), and peer contracts can be invisible to a source-import scan. Review each candidate against its package scripts/config and runtime role before removal.
