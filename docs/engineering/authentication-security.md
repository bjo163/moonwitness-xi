# Authentication security and invalidation contract

The API issues HS256 access JWTs with issuer `moonwitness` and a configured lifetime from `ACCESS_TOKEN_TTL_SECONDS` (default 900 seconds / 15 minutes). Every protected request also loads the current user, partner and role from the database. Demotion therefore changes authorization immediately, and deactivation of the user or partner rejects the existing access token immediately. Access JWTs are stateless and are not individually revoked on password change; password change revokes every refresh session, so a stolen access token can remain usable for at most its remaining configured TTL (default at most 15 minutes), unless the user/partner is disabled first. Choose a shorter access TTL where this revocation window is not acceptable; reducing it increases refresh frequency.

Refresh credentials are random opaque values; only SHA-256 hashes are stored. Rotation reuses the same family, simultaneous requests for a token have a bounded five-second grace path, and replay after that window revokes the family. Password verification uses salted scrypt; login responses for unknown login and wrong password are identical. Login/register and refresh routes have per-IP budgets. Password changes require the current password, revoke refresh sessions, and the API re-reads role/access state on each protected request.

Regression cases live in `apps/api/tests/auth.test.ts`, `apps/api/tests/ratelimit.test.ts`, and PostgreSQL integration tests. Defaults are declared in `apps/api/src/config/env.ts`; deployment config may override them.

## Audit log integrity and retention

`base.audit_log` records generic API create/update/delete changes in the same transaction as the business write and outbox event. Secret fields are excluded, the generic API exposes audit entries as admin-readable and non-writable, and the ORM model rejects instance and bulk update/delete queries. Audit activity is not seeded as demo data.

This is application/ORM-level append-only protection, not tamper-proof storage: a database owner or direct SQL connection can still alter rows. No audit log pruning or retention automation is configured; keep records under the database backup and access policy, and do not manually delete them. Define and review any future retention/export policy before implementing cleanup. This service does not claim WORM retention or regulatory non-repudiation.
