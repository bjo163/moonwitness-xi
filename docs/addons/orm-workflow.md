# Workflow and approval addon

`@moonwitness/orm-workflow` provides versioned workflow definitions, company-scoped instances, approval votes, append-only events, optimistic revisions, idempotency, and bounded expiry through the normal ORM/addon contract.

## Transition contract

A definition is JSON validated when used and copied into each instance as an immutable snapshot. Each transition declares its action, source/destination state, allowed roles, optional approval quorum, and optional requester/starter notification template. A notification is added to the shared outbox in the same database transaction as the successful transition. A failed transition creates neither event nor notification. For quorum transitions, the starter is notified only when the quorum actually reaches the configured destination state.

`notifyStarter` must be a notification template code. Templates are seeded by an addon such as `orm-request`; the workflow package does not hard-code business model names or message content. Notifications still respect company membership, recipient preferences, idempotency, and the in-app-only delivery policy. Email remains suppressed.

## Runtime API

Authenticated clients use `POST /workflows/instances` to start a definition on an authorized resource, `POST /workflows/instances/:id/actions` to transition it, and `GET /workflows/instances/:id` to read event/approval history. The routes check active company, model access, row rules, revision, role, and requester/reviewer separation. Generic CRUD/RPC for workflow internals is denied.

The workflow engine depends on `base`, `jobs`, and `notification`. API and worker processes install the declared dependencies before running expiry jobs or delivering outbox notifications. Schema/seed and expiry scheduling are programmatic; no SQL migration files are used.
