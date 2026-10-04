# API and addon compatibility policy

This document defines the public compatibility boundary for MoonWitness API consumers and programmatic ORM addons. It applies to the current `1.0.0-rc` package line and becomes the release contract for the first stable `1.x` line. Internal source files are not public entry points; consumers must use the package root exports.

## Public contracts

### TypeScript client and HTTP API

`@moonwitness/client` root exports are the supported SDK surface. The current generic API contract includes:

- Authentication at `/auth/*`, with token values and the user profile represented by the SDK's `AuthTokens` and `UserProfile` types.
- Model metadata at `/api/models`, `/api/:model/fields`, and `/api/:model/views`.
- Generic model operations at `/api/:model`: search/read, read by ID, create, patch, and archive by default; permanent deletion requires `hard=true`.
- Search options `domain`, `fields`, `offset`, `limit`, `order`, `with`, and `count`. `with` accepts Objection graph syntax and comma-separated top-level relation names. A requested count is returned as `total` by the SDK.
- JSON error responses with an HTTP status and an `error` message; the SDK maps common 400/401/403/404/409 statuses to its exported error classes.

The HTTP API currently has no independently versioned URL prefix. Its contract is released with the monorepo packages and changes follow the same compatibility rules. Additive response fields and optional request fields are compatible; clients must ignore unknown response fields. Existing successful response envelopes, authorization outcomes, archive semantics, and established relation query syntax are part of the contract. A future separately versioned API must be introduced explicitly and documented before it is offered.

### ORM addon contract

An addon uses the public `@moonwitness/orm` primitives and a manifest with a stable addon `name`, semantic `version`, declared dependencies, models, optional seed data/views/menus, and explicit upgrade hooks. `@moonwitness/orm-base` exposes its supported models and `manifest` from the package root. Addon installation is programmatic and transactional; it supports safe additive schema evolution and explicit forward upgrade hooks. It does not promise automatic downgrade or destructive schema rollback after a release.

Consumers must not import package internals such as `@moonwitness/orm/dist/...` or `packages/orm/src/...`. Public exports can be removed or renamed only through the deprecation process below.

## Version and deprecation rules

- Before the first stable `1.0.0` release, a breaking contract adjustment may still be made, but the release notes and upgrade guide must call it out. The first stable release must publish this policy alongside its changelog.
- Within stable `1.x`, compatible additions use a minor release and fixes use a patch release. Removing or changing a public SDK export, HTTP behavior, addon field/model identity, seed external ID, or upgrade-hook contract is breaking and requires a major release.
- A deprecation notice must identify the replacement, affected version, removal target, and migration steps in API/SDK documentation and release notes. Keep the old behavior for at least two stable minor releases and 90 days, whichever period ends later. Security or data-integrity fixes may shorten this window; the release note must explain the risk and the supported recovery path.
- Every breaking release must include a migration guide before promotion. The release-validation task M7.06 must reject a breaking-change record without an upgrade guide. A deprecation comment in source alone is insufficient notice.

## Upgrade guidance and data/session impact

1. Read the target release's breaking, deprecation, and upgrade sections; identify the current package and addon versions from the running deployment and `_orm_addons` records.
2. Take and verify an application backup before a release that changes schema, seed identity, auth/session behavior, or addon versions. Test the same upgrade on a restored copy first.
3. Deploy compatible API/Board/client packages together when a change affects their shared contract. Keep old clients working during the deprecation window; additive fields should not become required in an existing response.
4. Addon authors must provide an explicit version-to-version programmatic upgrade hook for data transformations. Preserve existing records, user edits, and seed external IDs. Hooks run transactionally; do not assume there is a down migration. If a forward hook fails, verify rollback on a disposable database and correct the addon before retrying.
5. For session-contract changes, document whether access tokens, refresh tokens, stored SDK state, or active sessions are invalidated. If invalidation is unavoidable, require users to sign in again and state that consequence before rollout; never silently reinterpret an old token.
6. After upgrade, verify addon versions, seed references, login/refresh/logout, client model reads/writes, and application-specific integrity checks. Retain the pre-upgrade backup until those checks pass.

## Contract verification

- `apps/api/tests/client.test.ts` runs the public `@moonwitness/client` against the real Fastify routes and covers authentication, model metadata, CRUD/archive, pagination count, relation loading, permissions, and token refresh.
- `packages/orm-base/tests/addon.test.ts` consumes the addon root exports, installs the example manifest through the public ORM package, and checks seeded records, idempotency, schema upgrades, preserved edits, and relation references.
- `packages/orm/tests/addon.test.ts` exercises declared addon installation, transactional forward upgrades, rollback on failed hooks, and downgrade rejection.

These tests are compatibility checks for the current contract. Changing a contract requires updating the tests and this guide in the same change; tests must not be weakened simply to admit an incompatible change.
