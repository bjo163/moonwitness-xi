# @moonwitness/orm-knowledge

This addon provides a first-pass, synthetic-only witness testimony model. It stores the original account separately from sourced, numbered corrections; records source labels, locators and SHA-256 digests; preserves the source's written time alongside its precision and uncertainty; and defaults visibility to `RESTRICTED`.

The seeds are fabricated examples. Do not treat them as historical records or load real testimony through this scaffold.

Model hooks and idempotently installed SQLite/PostgreSQL triggers reject update/delete operations for source, correction, and interpretation records, including raw SQL. A database unique constraint prevents duplicate correction numbers for one testimony, including concurrent inserts; the correction helper validates provenance and the next sequential number, but a future authorized write adapter must perform that check inside its transaction. Database owners can still alter triggers or data. This package does not provide row-level authorization. The access records deny ordinary user reads, but enforcement depends on API policy wiring outside this package. These records must remain inactive for real data until those controls and an authorized intake/retention process are implemented and independently verified.

The ordinary package test uses SQLite. The PostgreSQL integration test runs only when `POSTGRES_TEST_URL` is set; it creates and drops a uniquely named temporary schema to verify addon installation, raw SQL immutability triggers, and the correction uniqueness constraint without touching application tables.
