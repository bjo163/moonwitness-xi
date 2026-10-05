# M9 — Kartu kerja terperinci

Baca [protokol eksekusi](EXECUTION.md) terlebih dahulu. Status resmi tetap di [master checklist](../../ROADMAP.md); dokumen ini menjelaskan pekerjaan, bukan bukti bahwa fitur sudah ada. Path output yang belum ada adalah usulan deliverable. Semua path kode relatif terhadap root repository.

## M9.01 — Evaluasi `orm-notification`: preferences, templates, inbox, delivery status; reuse jobs/outbox dan cegah pengiriman contoh ke penerima nyata.

- **Prasyarat:** M4.11, M4.06
- **Baca/periksa:** Activity/inbox existing; packages/jobs; outbox inventory.
- **Deliverable:** orm-notification minimal addon atau ADR reuse existing.

### Langkah pelaksanaan

1. Tentukan gap nyata notifications dan reuse model delivery existing sebelum menambah package.
2. Rancang preference/template/notification/delivery dengan company scope dan idempotency key.
3. Implementasikan in-app channel dahulu, fake email adapter untuk demo; seed contoh non-delivering.

### Verifikasi dan syarat selesai

Preference respected; recipient isolation; retry tidak menggandakan inbox; contoh tak mengirim email nyata.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M9.01.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M9.02 — Evaluasi `orm-storage`: storage adapters, attachment ownership/download/retention; migrasikan dengan kompatibilitas data existing.

- **Prasyarat:** M4.12, M4.16
- **Baca/periksa:** [Attachment contract](../engineering/attachments.md), authenticated upload/download/hard-delete routes, attachment seed placeholder, restore drill, and current `ATTACHMENT_STORAGE_DIR` configuration.
- **Deliverable:** typed `@moonwitness/orm-storage` provider contract, compatible local provider, bounded orphan-reference reconciliation CLI, migration/operations guide, and tests proving UUID-keyed legacy files remain downloadable without metadata rewrite.

### Langkah pelaksanaan

1. Extract key validation, atomic put, get, delete, list and object metadata behind a typed provider API; reject non-UUID keys and preserve the existing direct UUID filename layout.
2. Inject the provider into API routes; retain parent-row/company authorization, MIME/size limits, checksum and transaction cleanup in the API. Keep the old `ATTACHMENT_STORAGE_DIR` constructor option as a documented transition.
3. Add a local provider first. Define a provider seam for cloud adapters without adding unconfigured credentials, public URLs, external network writes or fake S3 support.
4. Reconcile database references against local objects and report missing, corrupt and orphaned objects. Default to dry-run; deletion requires an explicit cutoff/grace period and bounded batch size. Never delete fresh temp files or non-UUID files.
5. Add the root `attachments:reconcile` command and API package runner, document operator review and shared-volume constraints, and add deterministic tests for old UUID files and data integrity.

### Verifikasi dan syarat selesai

Upload/download/delete isolation, database rollback cleanup, legacy UUID reads, content checksum/size mismatch, dry-run, bounded stale orphan deletion and missing/corrupt reports are tested. No attachment IDs, owner/resource relations or stored-key values change. Cloud adapter remains explicitly unsupported until provider-specific credentials and integration tests exist.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M9.02.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M9.03 — Implementasikan `orm-workflow`: state transition, approval policy, authorization, history, timeout, dan audit.

- **Prasyarat:** M4.06, M4.10
- **Baca/periksa:** Activities/access groups/jobs; one business example.
- **Deliverable:** typed `@moonwitness/orm-workflow` addon, sample approval definition, authenticated company-scoped API, scheduled expiry worker, generated API/model/architecture docs, and package/API verification.

### Langkah pelaksanaan

1. Define versioned definitions, immutable instance snapshots, approval votes and append-only audit events through ORM models and a manifest; seed one safe example without synthetic runtime activity.
2. Validate configuration shape, roles, resource-model allowlists, state/action transitions, company and actor scope, optimistic revision, quorum and requester/reviewer separation.
3. Require scoped idempotency keys for starts/actions, protect collisions across actor/company/resource/action, and make duplicate requests safe.
4. Add authenticated API list/start/detail/action routes; verify underlying resource read access and row rules before start; block generic CRUD/RPC access to internal workflow tables.
5. Register bounded timeout expiry as a jobs handler and seed an enabled cron; load the addon in API, scheduler and worker processes.
6. Add API/package tests for authorization, company boundaries, snapshots, timeout, duplicate approval, invalid transitions, event history and malformed payloads.
7. Include the package in root scripts, unit coverage, workspace docs/catalog and architecture generators; regenerate references and README.

### Verifikasi dan syarat selesai

Forbidden transition, cross-company access, idempotency collision, invalid revision, duplicate approval, and self-approval are denied; definition edits do not alter active snapshots; expiry runs once and preserves event sequence. API and package test suites, typecheck, lint, format, docs, architecture and hosted technical CI pass. A visual Board workflow UI and business-specific request addon are follow-up scope (M9.06), not claimed by this engine milestone.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M9.03.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M9.04 — Evaluasi `orm-integration`: webhook subscriptions, scoped credential references, signing, idempotency, delivery/retry; validasi tujuan request untuk menghindari SSRF.

- **Prasyarat:** M4.11, M8.11
- **Baca/periksa:** Outbox/http adapters; credential config.
- **Deliverable:** orm-integration minimal webhook addon.

### Langkah pelaksanaan

1. Implementasikan webhook subscription/delivery dengan endpoint allow policy, signing dan secret reference.
2. Cegah internal/link-local targets dan redirect/DNS bypass sesuai environment; bound response/time/size.
3. Retry dengan event ID stabil, rotate signing keys dan redact request secrets.

### Verifikasi dan syarat selesai

Receiver signature verifies; internal-address fixture rejected; duplicate delivery aman.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M9.04.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M9.05 — Evaluasi `orm-organization`: departments, teams, positions, memberships dan manager berdasarkan kebutuhan produk.

- **Prasyarat:** M4.06
- **Baca/periksa:** CompanyMembership/User/Partner existing.
- **Deliverable:** orm-organization minimal addon.

### Langkah pelaksanaan

1. Tentukan department/team/position relations tanpa membuat identitas user kedua.
2. Validasi hierarchy acyclic, company boundaries, optional manager dan membership dates.
3. Seed organisasi contoh kecil dan views yang tidak membanjiri normal navigation.

### Verifikasi dan syarat selesai

Cross-company membership invalid ditolak; hierarchy cycle gagal; uninstall tidak menghapus user.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M9.05.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M9.06 — Bangun satu addon bisnis contoh (request/approval atau CRM sederhana) untuk membuktikan extensibility tanpa perubahan core berulang.

- **Prasyarat:** M9.01, M9.03, M9.07
- **Baca/periksa:** Addon SDK contract; workflow/notification ready.
- **Deliverable:** Sample request addon dengan demo dataset.

### Langkah pelaksanaan

1. Pilih request/approval sebagai default example dengan requester, amount/description, company, status.
2. Implementasikan lewat manifest/models/views/access/seed tanpa special-case API routing.
3. Uji submit/approve/reject, notification dan history melalui Board serta API.

### Verifikasi dan syarat selesai

Addon berjalan tanpa patch core untuk nama model khusus; all role paths teruji.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M9.06.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M9.07 — Untuk tiap addon: manifest/dependencies, minimal public API, access isolation, views/menu, required/demo seeds, docs, upgrade path, tests, dan compatibility policy.

- **Prasyarat:** M4.01, M4.02, M4.16
- **Baca/periksa:** Addon template; all M9 packages.
- **Deliverable:** Reusable addon conformance suite.

### Langkah pelaksanaan

1. Buat addon author checklist yang dijalankan untuk setiap addon baru.
2. Pastikan dependencies acyclic, seeds external ID stable, required/demo/system-generated policy dan upgrade test.
3. Tambahkan package docs, menus, access deny defaults dan public exports.

### Verifikasi dan syarat selesai

Fresh install/reinstall/legacy upgrade dan negative authorization pass untuk tiap addon.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M9.07.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M9.08 — Audit ukuran base/API/Board setelah ekstraksi; package baru harus mengurangi coupling atau menghasilkan reuse yang terbukti.

- **Prasyarat:** M0.05, M9.06
- **Baca/periksa:** Refactor map baseline; package dependency graph.
- **Deliverable:** Post-extraction architecture review.

### Langkah pelaksanaan

1. Bandingkan responsibility/coupling sebelum sesudah ekstraksi.
2. Hapus duplicate implementation dan dead dependencies setelah consumers migrasi.
3. Jika package belum punya manfaat nyata, dokumentasikan keep-in-place decision alih-alih scaffold kosong.

### Verifikasi dan syarat selesai

Aplikasi lebih tipis secara tanggung jawab; tidak ada cycle dan ukuran bundle tidak regresi tanpa alasan.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M9.08.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.
