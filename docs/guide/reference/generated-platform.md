# Generated platform reference

Source fingerprint: `cdece6f9122cb17ceff02ba68a4275c3d8dbb018d872c14f59d067cd39d77017`. This reference contains package names, script names and environment variable names only; it does not contain local environment values.

## Workspace packages and apps

| Name                            | Kind    | Version    | Scripts                                                                                                                                                                              |
| ------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@moonwitness/api`              | App     | 1.0.0-rc.1 | `attachments:reconcile`, `build`, `dev`, `jobs:outbox`, `jobs:scheduler`, `jobs:worker`, `reset:superadmin-password`, `revoke:auth-sessions`, `start`, `test`, `visual-audit:server` |
| `@moonwitness/board`            | App     | 1.0.0-rc.1 | `build`, `dev`, `lint`, `preview`, `typecheck`                                                                                                                                       |
| `@moonwitness/docs`             | App     | 1.0.0-rc.1 | `dev`, `portal:build`, `preview`, `test`, `typecheck`                                                                                                                                |
| `@moonwitness/ui-catalog`       | App     | 1.0.0-rc.1 | `build`, `dev`, `preview`, `test`                                                                                                                                                    |
| `@moonwitness/assets`           | Package | 1.0.0-rc.1 | —                                                                                                                                                                                    |
| `@moonwitness/auth`             | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/client`           | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/eslint-config`    | Package | 1.0.0-rc.1 | —                                                                                                                                                                                    |
| `@moonwitness/jobs`             | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/logger`           | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm`              | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-base`         | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-integration`  | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-notification` | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-organization` | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-request`      | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-storage`      | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-workflow`     | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/types`            | Package | 1.0.0-rc.1 | `build`                                                                                                                                                                              |
| `@moonwitness/ui`               | Package | 1.0.0-rc.1 | `build`, `test`                                                                                                                                                                      |

## Environment variable names

| Name                         | Value category | Present in `.env.example` | Sensitive value redacted |
| ---------------------------- | -------------- | ------------------------- | ------------------------ |
| `ACCESS_TOKEN_TTL_SECONDS`   | secret         | Yes                       | Yes                      |
| `API_HOST`                   | string         | Yes                       | No                       |
| `API_PORT`                   | integer        | Yes                       | No                       |
| `ATTACHMENT_STORAGE_DIR`     | string         | Yes                       | No                       |
| `AUTH_LOGIN_RATE_MAX`        | integer        | Yes                       | No                       |
| `DATABASE_URL`               | url            | Yes                       | Yes                      |
| `DB_ACQUIRE_TIMEOUT_MS`      | integer        | Yes                       | No                       |
| `DB_POOL_MAX`                | integer        | Yes                       | No                       |
| `DB_POOL_MIN`                | integer        | Yes                       | No                       |
| `DB_STATEMENT_TIMEOUT_MS`    | integer        | Yes                       | No                       |
| `HOST`                       | string         | No                        | No                       |
| `JOB_HANDLERS_MODULE`        | string         | Yes                       | No                       |
| `JOBS_SCHEDULER_HEALTH_PORT` | integer        | Yes                       | No                       |
| `JOBS_WORKER_HEALTH_PORT`    | integer        | Yes                       | No                       |
| `JWT_SECRET`                 | secret         | Yes                       | Yes                      |
| `LOG_DIR`                    | string         | Yes                       | No                       |
| `LOG_FILE_NAME`              | string         | Yes                       | No                       |
| `LOG_LEVEL`                  | string         | Yes                       | No                       |
| `LOG_PRETTY`                 | boolean        | Yes                       | No                       |
| `LOG_TO_FILE`                | boolean        | Yes                       | No                       |
| `METRICS_TOKEN`              | secret         | Yes                       | Yes                      |
| `NODE_ENV`                   | string         | Yes                       | No                       |
| `OUTBOX_HANDLERS_MODULE`     | string         | Yes                       | No                       |
| `OUTBOX_WORKER_HEALTH_PORT`  | integer        | Yes                       | No                       |
| `PORT`                       | integer        | No                        | No                       |
| `POSTGRES_TEST_URL`          | url            | Yes                       | No                       |
| `PRINT_ROUTES`               | boolean        | Yes                       | No                       |
| `REFRESH_TOKEN_TTL_SECONDS`  | secret         | Yes                       | Yes                      |
| `RESTORE_DRILL_SCHEMA`       | string         | No                        | No                       |
| `SUPERADMIN_PASSWORD`        | secret         | Yes                       | Yes                      |
| `WORKER_HEALTH_HOST`         | string         | Yes                       | No                       |

The generator reads only `.env.example` and the names referenced by the typed config source. It never reads `.env` and does not emit values or defaults.

Value categories are inferred from variable names and example syntax; requiredness and validation limits remain defined by the source configuration.

## Root commands

- `pnpm architecture:check`
- `pnpm architecture:generate`
- `pnpm assets:check:docs`
- `pnpm assets:export:docs`
- `pnpm assets:generate`
- `pnpm assets:generate:illustrations`
- `pnpm assets:render`
- `pnpm assets:validate`
- `pnpm attachments:reconcile`
- `pnpm audit:workspace`
- `pnpm automation:check:action-pins`
- `pnpm automation:check:roadmap`
- `pnpm automation:check:secrets`
- `pnpm automation:check:ubuntu-runner-candidate`
- `pnpm automation:check:workflow-trust`
- `pnpm board:budget`
- `pnpm board:visual:update`
- `pnpm build`
- `pnpm ci:affected`
- `pnpm dependency:candidate`
- `pnpm dependency:plan`
- `pnpm dev`
- `pnpm dev:board`
- `pnpm docs:build`
- `pnpm docs:change:classify`
- `pnpm docs:check`
- `pnpm docs:examples:check`
- `pnpm docs:generate`
- `pnpm docs:links`
- `pnpm docs:links:external`
- `pnpm docs:publication:check`
- `pnpm format`
- `pnpm format:check`
- `pnpm jobs:outbox`
- `pnpm jobs:scheduler`
- `pnpm jobs:worker`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm platform:audit`
- `pnpm promotion:approval-check`
- `pnpm promotion:risk`
- `pnpm readme:check`
- `pnpm readme:generate`
- `pnpm release:changelog`
- `pnpm release:check`
- `pnpm release:classify`
- `pnpm release:dry-run`
- `pnpm release:plan`
- `pnpm release:prepare`
- `pnpm release:verify-attestations`
- `pnpm reset:superadmin-password`
- `pnpm revoke:auth-sessions`
- `pnpm roadmap:issues:plan`
- `pnpm test`
- `pnpm test:action-pins`
- `pnpm test:addon-conformance`
- `pnpm test:affected`
- `pnpm test:architecture`
- `pnpm test:artifact-safety`
- `pnpm test:assets`
- `pnpm test:board-budget`
- `pnpm test:ci-gate`
- `pnpm test:coverage-policy`
- `pnpm test:dependency-candidate`
- `pnpm test:dependency-plan`
- `pnpm test:docs-navigation`
- `pnpm test:docs-portal`
- `pnpm test:docs-publication`
- `pnpm test:e2e`
- `pnpm test:e2e:diagnostics`
- `pnpm test:e2e:visual`
- `pnpm test:e2e:visual:matrix`
- `pnpm test:expected-ref`
- `pnpm test:flaky-policy`
- `pnpm test:integration`
- `pnpm test:maintenance-incidents`
- `pnpm test:package-manager`
- `pnpm test:platform-audit`
- `pnpm test:promotion-policy`
- `pnpm test:release-classification`
- `pnpm test:release-dry-run`
- `pnpm test:release-image-publish`
- `pnpm test:release-latest-policy`
- `pnpm test:release-plan`
- `pnpm test:release-prepare`
- `pnpm test:release-prepare-workflow`
- `pnpm test:release-verify-attestations`
- `pnpm test:release-workflow`
- `pnpm test:render-changelog`
- `pnpm test:restore-drill`
- `pnpm test:roadmap`
- `pnpm test:secrets`
- `pnpm test:security-policy`
- `pnpm test:ubuntu-runner-candidate`
- `pnpm test:ui`
- `pnpm test:ui-budget`
- `pnpm test:ui-catalog`
- `pnpm test:unit`
- `pnpm test:unit:ci`
- `pnpm test:versioned-docs`
- `pnpm test:workflow-trust`
- `pnpm test:workspace-version-policy`
- `pnpm typecheck`
- `pnpm ui:budget`
- `pnpm ui:visual:update`
- `pnpm verify`
