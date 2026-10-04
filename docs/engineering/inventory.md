# Inventory awal MoonWitness

Baseline inspeksi: source pada dev setelah M0.08. Ini inventaris bukti kode, bukan klaim bahwa setiap kombinasi telah diuji.

## Workspace

| Workspace                            | Peran                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| apps/api                             | Fastify API, auth/policy, generic ORM API, health/metrics, jobs admin, startup checks                    |
| apps/board                           | React/Vite login, dashboard, profile, settings, generic model/list/form and widgets                      |
| packages/types                       | Shared DTO, routes, domain, JSON-RPC/config types                                                        |
| packages/orm                         | BaseModel, addon installer/programmatic schema and seed, registry, fields, views, domains                |
| packages/orm-base                    | Base manifest/models/views/reference/demo seed/access metadata                                           |
| packages/auth                        | Authentication/session service and addon manifest                                                        |
| packages/jobs                        | Database jobs/scheduler/outbox runtime                                                                   |
| packages/client                      | Typed API client and query/domain support                                                                |
| packages/logger                      | Shared logging/redaction                                                                                 |
| packages/eslint-config               | Shared ESLint rules                                                                                      |
| packages/addons                      | Directory exists but no package source found in first scan; decide whether empty scaffold is intentional |
| Planned packages/ui, packages/assets | Not present at baseline                                                                                  |

## Base addon models

Declared in packages/orm-base/src/manifest.ts: base.country, base.country_state, base.currency, base.language, base.company, base.bank, base.partner, base.partner_bank, base.partner_category, base.partner_category_link, base.partner_address, base.user, base.tag, base.tag_link, base.attachment, base.activity, base.sequence, base.access_group, base.group_membership, base.model_access, base.company_membership, base.audit_log.

Manifest declares a menu for each model. Development-only, localization and technical menus use metadata. AuditLog has no fake seed. Model seed completeness checks exist in packages/orm-base/tests/addon.test.ts.

Seed areas visible in packages/orm-base/src/data.ts: 249 countries, a state reference subset, currency/language, default company, bank examples, user-linked partner profiles and contact examples, bank account examples, categories, address, access groups/memberships/model access, tags, attachment/activity examples, and sequences. Bank account, attachment and activity examples require a deliberate demo-data/publication audit.

## API route families

| Family              | Source                                | Behavior                                                                                 |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| Health/root/metrics | apps/api/src/routes/health.routes.ts  | /livez, /readyz, /health, /metrics, root info                                            |
| Authentication      | apps/api/src/routes/auth.routes.ts    | register, login, refresh, logout, current user, own password, preferences, own profile   |
| Generic models      | apps/api/src/routes/generic.routes.ts | models/fields/views, search/count, read, create/update/delete/archive, actions, JSON-RPC |
| Jobs administration | apps/api/src/routes/jobs.routes.ts    | job/outbox health/list/runs/retry/cancel and cron management/trigger                     |
| Startup             | apps/api/src/startup-checks.ts        | required models, seed, accounts and credentials readiness                                |

Dynamic generic operations are behavior families, not one route per model. Test role/company/model/action combinations; route existence does not prove authorization.

## Background work and Board

- Entrypoints: apps/api/src/commands/jobs-worker.ts, jobs-scheduler.ts, outbox-worker.ts. Runtime/data is in packages/jobs/src; specs exist under packages/jobs/tests/runtime.test.ts and apps/api/tests/jobs.test.ts.
- Board: public auth-page; signed-in dashboard, profile, settings, generic model page. Shell/menu in components/layout/app-shell.tsx and lib/navigation.ts. Widgets include list, form, fields, one2many, query builder, import wizard, tags and chatter.
- Board-local primitives are in components/ui; visual/logo files are in components/manga. Existing profile/settings are pages/profile-page.tsx and settings-page.tsx.
- No Board test script or browser/component specs were found in first scan. Board typecheck/lint scripts are separate.

## Tests and GitHub automation

- Existing test families: ORM/client domains, logger, auth, jobs, base addon/password/extensions, API auth/client/database errors/jobs/observability/ORM/record rules/startup/ratelimit/views, optional PostgreSQL upgrade/auth integration.
- Root pnpm test runs recursive workspace tests. API PostgreSQL tests currently skip without POSTGRES_TEST_URL; M2.06 must fail closed in required CI mode.
- Existing CI is .github/workflows/ci.yml; PostgreSQL service, lint, format, build, tests, container builds, Compose validation and backup/restore. At baseline push trigger names main only; PR trigger is unfiltered.
- Existing release is .github/workflows/release.yml, tag/workflow_dispatch with explicit publish boolean.
- Existing deploy file is .github/workflows/deploy.yml and had staging/optional production behavior at baseline; remove app deployment per user scope.
- GitHub default branch is main, repo is public and Issues enabled; remote branches at bootstrap were main and dev. Initial rulesets API read returned none. Read branch protection, Pages and auto-merge settings before activation.
- Current Board tests and dev CI execution still need to be implemented/verified.

## Open inventory questions

- Are there model metadata/access combinations not reachable from the visible Board routes?
- Do sample bank/contact/account values need replacement before public demo docs?
- Is packages/addons intentionally empty?
- Which DB tests skip locally, and does full CI execute each one?
- Are loading/error/empty states shared or independently implemented by each view?
