# @moonwitness/knowledge

Offline, typed structural contracts for the XI core knowledge record envelope,
explicit canonical identity resolution, and PROV-inspired provenance graphs.

The JSON Schema at `schemas/knowledge-record.schema.json` is the canonical
Draft 2020-12 contract. `validateKnowledgeRecord` returns JSON Pointer
diagnostics, and `isKnowledgeRecord` provides a type guard after validation.
`validateCanonicalKnowledgeId` checks stable IDs in the `mw:<kind>:<token>`
namespace, and `resolveKnowledgeIdentity` accepts exact canonical IDs or an
explicit source namespace and alias value. Alias collisions are returned as
conflicts; titles and similarity are never used as implicit identity.

The optional `derivation` field records an activity ID, non-empty input IDs,
method ID, and method version on each derived record. `validateKnowledgeProvenanceGraph`
checks canonical IDs, actor/source/input/output/activity resolution, matching
generation and method metadata, ordered timestamps, and acyclic derivation
lineage. In this graph contract, activity `generated_ids` defines the derived
record set, and every listed output must carry matching derivation metadata.
The graph contains only an ID/kind index; validate each full record envelope
separately with `validateKnowledgeRecord`. Actors must resolve to `Agent`
records and `source_ids` must resolve to `Artifact` records. The exported
provenance schema is also available at
`@moonwitness/knowledge/provenance-schema`.

The activity mapping is PROV-inspired: activities correspond to `prov:Activity`,
actors to `prov:Agent` / `prov:wasAssociatedWith`, used inputs and sources to
`prov:used`, and generated records to `prov:wasGeneratedBy`. Method IDs and
versions are explicit XI contract fields; this package does not claim to be an
RDF runtime or infer causation from timestamps. Rights clearance remains a
separate gate. Visibility values are provisional pending K0-005 review; records
must state a visibility explicitly. Fixtures and tests use synthetic data only.

```sh
pnpm --filter @moonwitness/knowledge build
pnpm --filter @moonwitness/knowledge typecheck
pnpm --filter @moonwitness/knowledge test
```
