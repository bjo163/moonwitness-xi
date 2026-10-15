# @moonwitness/knowledge

Offline, typed structural contracts for the XI core knowledge record envelope.

The JSON Schema at `schemas/knowledge-record.schema.json` is the canonical
Draft 2020-12 contract. `validateKnowledgeRecord` returns JSON Pointer
diagnostics, and `isKnowledgeRecord` provides a type guard after validation.

The shared envelope intentionally stops at structural metadata. Identifier
grammar, source rights, provenance, domain-specific assertions, persistence,
import and publication belong to later K-series tasks. Visibility values are
provisional pending K0-005 review; records must state a visibility explicitly.
Fixtures and tests use synthetic data only.

```sh
pnpm --filter @moonwitness/knowledge build
pnpm --filter @moonwitness/knowledge typecheck
pnpm --filter @moonwitness/knowledge test
```
