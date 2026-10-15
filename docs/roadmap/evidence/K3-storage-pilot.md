# K3 storage compatibility pilot — synthetic release and review-event binding

## Status

- Status: pilot evidence only; no canonical research-storage decision is accepted by this note.
- Date: 2026-10-16 (Asia/Jakarta).
- Scope: test-only compatibility exercise joining the existing local corpus snapshot/release path to the existing ORM workflow event path.
- Data: one synthetic entity at content revisions 1 and 2. No external repository, network source, licensed corpus text, private data, production schema, addon, or API was used.

## Pilot

`packages/orm-workflow/tests/storage-compatibility-pilot.mjs` exercises both current adapters with one synthetic record identity. It is intentionally run with Node's built-in test runner so it remains outside the package's Vitest suite:

1. The corpus path ingests canonical JSON to immutable snapshots, creates two content-addressed dataset releases, checks their snapshot digests differ when the record revision changes, verifies the second release points to the first, deletes the first snapshot, and replays it from its pinned local recipe/source. Replay restores the first digest and active pointer while leaving the original release manifest bytes unchanged.
2. The existing workflow addon stores the selected release ID, snapshot digest, record ID, and record revision in a transition event payload. A forced event-insert failure proves the workflow state update and event insert roll back together. Retrying succeeds once; an exact retry returns the committed revision; changed payload under the same idempotency key fails; a stale expected revision fails; raw ORM update/delete of the committed event fails.
3. The only database used is an in-memory SQLite test database with existing synthetic addon seed records. The test is isolated and does not change package runtime dependencies or production code.

## Results

| Check                                                                                            | Result    |
| ------------------------------------------------------------------------------------------------ | --------- |
| `pnpm --filter @moonwitness/corpus build`                                                        | Pass      |
| `pnpm --filter @moonwitness/orm-workflow build`                                                  | Pass      |
| `pnpm --filter @moonwitness/orm-workflow exec node --test tests/storage-compatibility-pilot.mjs` | Pass; 1/1 |

Existing focused suites add broader evidence for immutable release manifests, exact release replay, rollback and failed activation pointer preservation (`packages/corpus/tests/dataset-release.test.ts`), plus workflow revision checks, payload equality on replay, transactional rollback, and ORM/SQL append-only protections (`packages/orm-workflow/tests/runtime.test.ts`).

## Compatibility assessment and recommendation

The pilot shows the two existing mechanisms can be joined by stable release and content digests: the file-backed release path can reproduce an immutable graph snapshot, while the workflow event path can atomically retain a decision payload referencing that exact snapshot. They are complementary boundaries rather than interchangeable stores: the corpus release path supplies canonical snapshot retrieval/rebuild/rollback; workflow tables supply operational state transitions and append-only review-event history. A workflow JSON payload alone does not validate or resolve a canonical research record.

Recommended candidate for a future owner decision: keep accepted graph releases and immutable source artifacts as local content-addressed files/snapshots; keep draft workflow state and transactional review events in the existing PostgreSQL-backed ORM workflow addon, with each event bound to an exact release/snapshot digest and subject revision. Derived indexes remain rebuildable outputs. This note is evidence for that candidate, not approval to implement a research persistence addon or public API. ADR 0004 remains unchanged and still requires explicit selection and compatibility review before production schema/API work.

## Limitations and gates

- The test only binds a synthetic event payload to a previously built release. It does not validate subject/evidence records under a locked application transition, prove evidence-to-assertion association, authenticate an API actor, resolve visibility, or select an authorized graph release. K3-005 and K3-006 remain in progress.
- This uses SQLite, not PostgreSQL. Hosted exact-SHA PostgreSQL integration remains required for locking/trigger and restore acceptance; local `POSTGRES_TEST_URL` was unavailable in the prior task environment.
- File snapshot and recipe durability, filesystem permissions, backup/restore of file bytes alongside PostgreSQL, and multi-process deployment semantics are not certified. Application deployment remains out of scope under ADR 0001/0004.
- Existing Q7:46 Tanzil and WEBP Genesis 1:1 approvals remain exact-source/sample scope only. This pilot imports neither and asserts no relationship between them. Rights/privacy policy ownership does not authorize other imports or private-data projection.
- Before a production decision: review whether filesystem release storage is an acceptable canonical home for the intended local runtime; specify DB-to-snapshot backup/restore and release activation semantics; run PostgreSQL upgrade/transaction/append-only/restore coverage; and approve the authenticated K3 adapter contract and visibility rules.
