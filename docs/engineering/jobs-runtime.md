# Job and scheduler runtime contract

The jobs addon stores queue state, attempts, leases, fencing tokens, individual run history, and scheduler definitions in the application database. API and worker replicas can share the same database; claims and state transitions use database transactions and row locks (`SKIP LOCKED` where the driver supports it).

## Job lifecycle

```text
queued -> running -> succeeded
                  -> queued (retryable failure with attempts remaining)
                  -> dead (permanent failure or attempts exhausted)
                  -> cancelled (cooperative cancellation)

running with expired lease -> retrying history + a new running attempt
running with expired lease at max attempts -> dead
```

Each claim increments both `attempts` and `fencing_token`, assigns `lease_owner`, and creates a `JobRun`. Heartbeats extend a lease only while the owner and fencing token still match. Completion is conditional on the same claim identity, so a stale worker cannot commit after a newer claim. Lease expiry allows recovery after a worker crash; it does not prove that the old process stopped executing.

Transient failures use capped exponential backoff: `min(retryMaxSeconds, retryBaseSeconds × 2^(attempts−1))`; defaults are 2 seconds and 3600 seconds. `max_attempts` bounds retries. Permanent handler failures and unavailable handler versions become dead letters. Run history keeps each attempt outcome and a sanitized, bounded error message.

Cancellation is cooperative. A running handler receives an `AbortSignal`; the worker observes a cancellation request on heartbeat and commits the cancelled state when the handler returns or responds to abort. A handler that ignores cancellation can continue running until it settles, but its expired/fenced claim cannot overwrite a newer owner.

## Scheduler lifecycle

Cron expressions are evaluated by `cron-parser` with the configured IANA timezone. `next_run_at` and occurrence keys are UTC instants. Each schedule update is locked in a transaction, and `schedule_key` deduplicates an occurrence across scheduler replicas.

- `skip` drops missed occurrences.
- `coalesce` queues one occurrence for a missed interval.
- `catch_up` queues at most `max_catch_up` missed occurrences.
- `allow` permits overlapping runs; `forbid` skips scheduling while queued/running work exists; `replace` requests cancellation of running work and cancels queued work before scheduling its replacement.

## Delivery semantics

Queue execution is at-least-once across crashes: a process can perform an external side effect and die before recording success, after which the expired lease may be retried. Fencing protects database completion, not external systems. Handlers that call external services must use a stable idempotency key or receiver-side deduplication. The runtime does not claim exactly-once effects.

The addon includes a disabled example cron seed for discovery. Scheduled jobs are not enabled just by installing the addon.
