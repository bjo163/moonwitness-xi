# K3 storage compatibility pilot — synthetic release and review-event binding

## Status

- Status: pilot evidence only. On 2026-10-16 the owner selected PostgreSQL for canonical research graph releases and operational review events. Hosted PostgreSQL, combined workflow transaction, and recovery compatibility gates remain open; this note does not mark the storage path production-ready.
- Date: 2026-10-16 (Asia/Jakarta).
- Scope: an original test-only compatibility exercise joining filesystem corpus snapshots to ORM workflow events, followed by a typed PostgreSQL addon pilot for immutable research graph releases.
- Data: synthetic entities and graph records at content revisions 1 and 2. No external repository, network source, licensed corpus text, or private data was used.

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

The original file-snapshot recommendation below is superseded by the owner's explicit choice to keep canonical graph releases and review workflow/events in PostgreSQL. Derived indexes remain rebuildable outputs. The previous filesystem exercise remains historical evidence only.

## PostgreSQL selection follow-up

The owner selected "all in PostgreSQL" on 2026-10-16. The first typed storage pilot is implemented in `@moonwitness/orm-knowledge` through the normal addon install path:

- `knowledge_research_graph_releases` stores immutable manifest bytes and their SHA-256 identity.
- `knowledge_research_graph_records` stores each immutable canonical JSON record and content digest.
- `knowledge_research_active_releases` selects one active immutable release per corpus. Activation checks the expected current digest and can restore a prior intact release.
- A `research-graph/v1` release must pass the ontology assertion/relation/evidence and graph checks before activation; active reads verify corpus identity and fail closed on invalid graph snapshots.
- Release bytes are canonicalized deterministically, and reads verify member hashes, manifest membership, and release digest before returning records.
- Test data is synthetic. It includes no new licensed text, witness data, or relationship between the approved Quran and Genesis examples.

The local SQLite compatibility tests pass for deterministic serialization, exact replay, immutable rows, expected-head activation/rollback, and caller-transaction rollback. An isolated-schema PostgreSQL integration test has been added to the existing hosted integration suite, but could not run locally because `POSTGRES_TEST_URL` is unavailable. A hosted green run is still required to claim PostgreSQL compatibility.

The transaction-aware K3 review adapter is now implemented locally in `@moonwitness/orm-knowledge`: it validates the active PostgreSQL graph release, subject/evidence bindings, authenticated reviewer context, and explicit actor identity mappings inside the locked workflow transaction, then persists the decision with the workflow event. It has focused SQLite behavioral tests. The PostgreSQL integration suite currently tests graph release create/read/activate/rollback and append-only guards, but not the combined review adapter; hosted PostgreSQL and restore/recovery verification remain open. No authenticated HTTP read/write API or production exposure is implemented. Approved Tanzil/Q7:46 source bytes remain pinned local repository assets resolved offline; the PostgreSQL selection concerns canonical structured research snapshots and operational review/workflow data, and does not copy corpus bytes into PostgreSQL. The addon remains a typed pilot, not evidence for deployment.

## Limitations and gates

- SQLite adapter tests validate subject/evidence records under a locked workflow transition, prove evidence-to-subject association, authenticate the reviewer against database role/company membership plus an explicit canonical identity mapping, resolve visibility, and select the verified active release. PostgreSQL execution of this combined transaction and recovery remain unverified; K3-005 and K3-006 remain in progress.
- The original compatibility exercise used SQLite and filesystem releases, not PostgreSQL. The new addon has an isolated PostgreSQL integration test in the hosted suite, but that test has not run locally because `POSTGRES_TEST_URL` is unavailable.
- File snapshot and recipe durability, filesystem permissions, backup/restore of file bytes alongside PostgreSQL, and multi-process deployment semantics are not certified. Application deployment remains out of scope under ADR 0001/0004.
- Existing Q7:46 Tanzil and WEBP Genesis 1:1 approvals remain exact-source/sample scope only. The review fixture resolves only Q7:46 locally and asserts no relationship between it and Genesis. Rights/privacy policy ownership does not authorize other imports or private-data projection.
- Before production acceptance: pass the hosted PostgreSQL integration test; bind the release lookup and validated review payload to the same locked workflow transaction; define and rehearse restore of releases, active pointers, and workflow history from one consistent database backup; and approve the authenticated K3 adapter contract and visibility rules.
