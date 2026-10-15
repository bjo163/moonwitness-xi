# `@moonwitness/corpus`

Deterministic, offline ingestion for pinned local JSON record sources. The first
adapter supports only `json-record-array/v1`; it does not fetch URLs, execute
code, infer identity, or decide source rights.

An ingestion recipe pins the exact source bytes:

```json
{
  "format": "moonwitness-ingestion-recipe/v1",
  "recipeId": "example-v1",
  "source": {
    "path": "corpus/input/records.json",
    "sha256": "<64-character-lowercase-sha256>"
  },
  "parser": "json-record-array/v1"
}
```

Validate the recipe shape against `schemas/ingestion-recipe.schema.json`. Then
build the workspace and run a dry-run or immutable import:

```sh
pnpm --filter @moonwitness/knowledge build
pnpm --filter @moonwitness/corpus build
node scripts/knowledge/ingest.mjs recipe.json --output corpus/releases/example --dry-run
node scripts/knowledge/ingest.mjs recipe.json --output corpus/releases/example
```

The adapter verifies the pinned source digest, parses duplicate-key-safe JSON,
validates every record against the knowledge contract, rejects duplicate IDs,
and computes an RFC 8785 snapshot digest. It validates the complete input before
writing. Output is staged beside its destination and published by rename; an
existing release path is immutable and cannot be overwritten. A failed parse,
checksum, or record validation leaves the prior release untouched. Synthetic
fixtures are used in tests; no historical or third-party corpus is bundled.
