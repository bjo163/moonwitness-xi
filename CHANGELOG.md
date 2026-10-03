# Changelog

Notable changes to MoonWitness are recorded here. Versions follow SemVer; release tags use the `vMAJOR.MINOR.PATCH` format.

## [1.0.0-rc.1] - 2026-10-04

### Release candidate

- Adds separate production container images for the API and Board, including same-origin API proxying and SPA route fallback.
- Adds the Board's mobile navigation drawer and compact record cards for narrow viewports.
- Fixes strict TypeScript errors in the scheduler panel and API cron trigger.
- Passed local PostgreSQL integration tests, production Compose startup, desktop/mobile browser smoke tests, and a disposable PostgreSQL backup/restore check.
- Staging deployment remains pending configuration of the real staging URL and GitHub environment secret.

## [1.0.0] - 2026-10-04

### Added

- Metadata-driven API and Board for discovering models, resolving view definitions, and working with records through a shared typed client.
- `orm-base` addon with users, partners, companies, geography and localization catalogs, access groups, memberships, model access rules, tags, attachments, activities, sequences, audit logs, and seed examples.
- Programmatic addon installation and seed lifecycle without hand-maintained traditional SQL migration files.
- Authentication, password reset utility, model-level authorization, multi-company context, and audit trail foundations.
- Durable background jobs, scheduler, transactional outbox, operational health endpoints, structured logs, and PostgreSQL backup/restore scripts.
- Docker production image, production Compose configuration, CI checks, staging smoke tests, and protected production deployment workflow.
- Responsive admin Board with dashboard, model lists, record forms, filters, grid and pipeline views, command palette, activity notifications, and job operations.

### Quality

- Strict TypeScript across the workspace with a release check that validates the tag and package versions.
- Automated PostgreSQL-backed tests, production container build, Compose validation, and backup/restore verification in CI.

### Release notes

- First 1.0 release candidate baseline. Configure the GitHub `staging` and protected `production` environments before enabling deployment workflows.
- Production launch still requires environment-specific secrets, a managed PostgreSQL service, TLS/domain setup, and an exercised backup schedule.
