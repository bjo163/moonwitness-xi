# Generated platform reference

Source fingerprint: `a9d099254220ebad3237fe5e9596f687513595ca5d0792673a569681d8109282`. This reference contains package names, script names and environment variable names only; it does not contain local environment values.

## Workspace packages and apps

| Name                         | Kind    | Version    | Scripts                                                                                                      |
| ---------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `@moonwitness/api`           | App     | 1.0.0-rc.1 | `build`, `dev`, `jobs:outbox`, `jobs:scheduler`, `jobs:worker`, `reset:superadmin-password`, `start`, `test` |
| `@moonwitness/board`         | App     | 1.0.0-rc.1 | `build`, `dev`, `lint`, `preview`, `typecheck`                                                               |
| `@moonwitness/docs`          | App     | 1.0.0-rc.1 | `dev`, `portal:build`, `preview`, `test`, `typecheck`                                                        |
| `@moonwitness/ui-catalog`    | App     | 1.0.0-rc.1 | `build`, `dev`, `preview`, `test`                                                                            |
| `@moonwitness/assets`        | Package | 1.0.0-rc.1 | —                                                                                                            |
| `@moonwitness/auth`          | Package | 1.0.0-rc.1 | `build`, `test`                                                                                              |
| `@moonwitness/client`        | Package | 1.0.0-rc.1 | `build`, `test`                                                                                              |
| `@moonwitness/eslint-config` | Package | 1.0.0-rc.1 | —                                                                                                            |
| `@moonwitness/jobs`          | Package | 1.0.0-rc.1 | `build`, `test`                                                                                              |
| `@moonwitness/logger`        | Package | 1.0.0-rc.1 | `build`, `test`                                                                                              |
| `@moonwitness/orm`           | Package | 1.0.0-rc.1 | `build`, `test`                                                                                              |
| `@moonwitness/orm-base`      | Package | 1.0.0-rc.1 | `build`, `test`                                                                                              |
| `@moonwitness/types`         | Package | 1.0.0-rc.1 | `build`                                                                                                      |
| `@moonwitness/ui`            | Package | 1.0.0-rc.1 | `build`, `test`                                                                                              |

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
- `pnpm audit:workspace`
- `pnpm build`
- `pnpm ci:affected`
- `pnpm dev`
- `pnpm dev:board`
- `pnpm docs:build`
- `pnpm docs:check`
- `pnpm docs:examples:check`
- `pnpm docs:generate`
- `pnpm docs:links`
- `pnpm docs:links:external`
- `pnpm format`
- `pnpm format:check`
- `pnpm jobs:outbox`
- `pnpm jobs:scheduler`
- `pnpm jobs:worker`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm promotion:approval-check`
- `pnpm promotion:risk`
- `pnpm readme:check`
- `pnpm readme:generate`
- `pnpm release:check`
- `pnpm release:classify`
- `pnpm reset:superadmin-password`
- `pnpm test`
- `pnpm test:affected`
- `pnpm test:architecture`
- `pnpm test:artifact-safety`
- `pnpm test:assets`
- `pnpm test:ci-gate`
- `pnpm test:coverage-policy`
- `pnpm test:docs-navigation`
- `pnpm test:docs-portal`
- `pnpm test:e2e`
- `pnpm test:flaky-policy`
- `pnpm test:integration`
- `pnpm test:promotion-policy`
- `pnpm test:release-classification`
- `pnpm test:restore-drill`
- `pnpm test:ui`
- `pnpm test:ui-budget`
- `pnpm test:ui-catalog`
- `pnpm test:unit`
- `pnpm test:unit:ci`
- `pnpm typecheck`
- `pnpm ui:budget`
- `pnpm ui:visual:update`
- `pnpm verify`
