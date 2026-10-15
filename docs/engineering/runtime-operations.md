# Runtime operations contract

## API lifecycle and probes

The API creates one validated request ID per request. A caller-provided `X-Request-ID` is reused
only when it is 1–96 ASCII letters, digits, dot, underscore, colon, or hyphen; otherwise the API
generates a UUID. The resolved ID is returned in the response header and appears in Fastify's
request log context. Metrics continue to use normalized route templates, never request IDs.

`/livez` reports only whether the process can serve HTTP. `/readyz` and the compatibility `/health`
endpoint run a bounded `SELECT 1`; they return 503 while PostgreSQL is unavailable. Health responses
are `no-store`. Startup still verifies addon models, seed accounts, and a DB connection before the
API begins listening.

On SIGINT/SIGTERM the API stops accepting new work through Fastify close and drains active requests.
After 30 seconds it closes active connections to finish shutdown. The Knex pool closes from the
Fastify `onClose` hook after request draining. Shutdown errors set a failing process exit code and
are reported without logging raw driver details.

## Worker lifecycle and probes

The scheduler, jobs worker, and outbox worker install SIGINT/SIGTERM handlers. Signals mark optional
readiness probes unavailable and stop the polling loops. A job/outbox handler already in progress
is allowed to finish before its process closes the DB pool; hard termination is recovered through
the existing leases and at-least-once delivery rules. Liveness remains available during that drain.

Worker HTTP probes are disabled by default (`port=0`). Configure separate values for
`JOBS_WORKER_HEALTH_PORT`, `JOBS_SCHEDULER_HEALTH_PORT`, and `OUTBOX_WORKER_HEALTH_PORT` when an
orchestrator can reach them. `/livez` reports process liveness; `/readyz` requires the worker to be
in its polling phase and `SELECT 1` to succeed. Bind to loopback/private networking with
`WORKER_HEALTH_HOST`; do not expose unauthenticated probes publicly.

## PostgreSQL pools and timeouts

`DB_POOL_MIN` defaults to 0 and `DB_POOL_MAX` to 10 **per process**. `DB_ACQUIRE_TIMEOUT_MS` and
`DB_STATEMENT_TIMEOUT_MS` default to 30 seconds. The maximum pool size is 100, statement timeout is
bounded to 10 minutes, and invalid or contradictory values fail startup. The statement timeout is
sent to PostgreSQL; the acquire timeout bounds waiting for an available pool connection.

Size the total connection budget across API replicas, scheduler, job/outbox workers, addon
installation, migrations, monitoring and PostgreSQL's reserved connections. For example, four API
replicas at pool max 10 already allow 40 API connections before worker pools are counted. Tests use
separate SQLite settings or explicitly bounded PostgreSQL pools.

Structured logging redacts authorization/cookie headers and credential fields. Request IDs and
route-template metrics provide correlation without placing user-controlled IDs or record values in
metric labels. PostgreSQL errors are logged through the safe error context rather than raw SQL
bindings.
