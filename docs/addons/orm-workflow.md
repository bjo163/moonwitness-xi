# Workflow and approval addon

`@moonwitness/orm-workflow` provides versioned workflow definitions, company-scoped instances, approval votes, append-only events, optimistic revisions, idempotency, and bounded expiry through the normal ORM/addon contract.

## Transition contract

A definition is JSON validated when used and copied into each instance as an immutable snapshot. Each transition declares its action, source/destination state, allowed roles, optional approval quorum, and optional requester/starter notification template. A notification is added to the shared outbox in the same database transaction as the successful transition. A failed transition creates neither event nor notification. For quorum transitions, the starter is notified only when the quorum actually reaches the configured destination state.

`notifyStarter` must be a notification template code. Templates are seeded by an addon such as `orm-request`; the workflow package does not hard-code business model names or message content. Notifications still respect company membership, recipient preferences, idempotency, and the in-app-only delivery policy. Email remains suppressed.

## Runtime API

Authenticated clients use `GET /workflows/definitions?resource_model=...` to discover definitions for roles that can start or transition them; each result includes `canStart` so reviewers cannot mistake participation for start permission. `POST /workflows/instances` starts a definition on an authorized resource, `GET /workflows/instances` requires a resource model/ID pair, `POST /workflows/instances/:id/actions` transitions it, and `GET /workflows/instances/:id` reads event/approval history. List, detail, start and action routes verify active-company scope, model read access and row rules for the associated resource. Revision, workflow role, and requester/reviewer separation are checked by the engine. Generic CRUD/RPC for workflow internals is denied.

The workflow engine depends on `base`, `jobs`, and `notification`. API and worker processes install the declared dependencies before running expiry jobs or delivering outbox notifications. Schema/seed and expiry scheduling are programmatic; no SQL migration files are used.
