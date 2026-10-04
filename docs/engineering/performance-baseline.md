# PostgreSQL performance baseline

## Method

`pnpm test:integration` runs `apps/api/tests/postgres.performance.integration.test.ts` against a schema with a randomized name, then drops the schema. The synthetic fixture installs Base/Auth/Jobs, inserts 120 synthetic partners with 240 addresses, and schedules eight no-op jobs through the real job enqueue/claim path.

The test records five measured samples after one warm-up for list, count, eager relation loading at 12 and 120 partners, and job claims. It captures Knex query events, elapsed time, and process heap delta; it also writes PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans for the measured partner-list shape and the Objection eager related-address query. The sanitized JSON report is written to `test-results/performance/m4.15.json` and uploaded with the CI test artifact.

## Structural budgets

| Operation                |                  Query budget | Regression being detected                                        |
| ------------------------ | ----------------------------: | ---------------------------------------------------------------- |
| Partner list             |                       1 query | Extra per-row fetches or duplicate base selects                  |
| Partner count            |                       1 query | Count implementation that loads rows or performs related queries |
| Partner with addresses   | 2 queries for 12 and 120 rows | N+1 eager loading when result size grows 10x                     |
| Job claim and completion |    At most 12 queries per job | Unbounded query growth in the durable claim/complete path        |

Counts/results and relation totals are asserted so query reductions cannot silently omit data. Query-count budgets are CI gates. Latency, p95, standard deviation, heap delta, and EXPLAIN output are observations from a shared runner, not hard SLOs; compare similar runtime/database versions and fixture sizes before using them to justify optimization.

## Current run

A local reference snapshot and its exact environment are recorded in [M4.15 evidence](../roadmap/evidence/M4.15.md). Hosted CI uploads the complete JSON report as a run artifact; timings from either environment are not production latency or memory guarantees.
