# @moonwitness/orm-knowledge

This addon provides a first-pass, synthetic-only witness testimony model. It stores the original account separately from sourced, numbered corrections; records source labels, locators and SHA-256 digests; preserves the source's written time alongside its precision and uncertainty; and defaults visibility to `RESTRICTED`.

The seeds are fabricated examples. Do not treat them as historical records or load real testimony through this scaffold.

Model hooks reject ordinary Objection update/delete operations for source, correction, and interpretation records, and the correction helper validates provenance fields and the next sequential number. This package does not provide row-level authorization or enforce append-only rules against direct SQL, another database client, privileged operators, or bulk-write paths that bypass Objection hooks. The access records deny ordinary user reads, but enforcement depends on API policy wiring outside this package. These records must remain inactive for real data until those controls and an authorized intake/retention process are implemented and independently verified.

The ordinary package test uses SQLite. The PostgreSQL integration test runs only when `POSTGRES_TEST_URL` is set; it creates and drops a uniquely named temporary schema to verify addon installation and ORM immutability hooks without touching application tables.
