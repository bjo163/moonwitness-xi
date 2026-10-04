# M4 — Kartu kerja terperinci

Baca [protokol eksekusi](EXECUTION.md) terlebih dahulu. Status resmi tetap di [master checklist](../../ROADMAP.md); dokumen ini menjelaskan pekerjaan, bukan bukti bahwa fitur sudah ada. Path output yang belum ada adalah usulan deliverable. Semua path kode relatif terhadap root repository.

## M4.01 — Validasi semua model/field/relasi/view/menu/access dan kebijakan seed melalui matriks metadata.

- **Prasyarat:** M0.01
- **Baca/periksa:** manifest.ts; views.ts; ORM registry dan addon loader.
- **Deliverable:** Metadata integrity tests.

### Langkah pelaksanaan

1. Enumerasi field yang dirujuk view/menu/access lalu cocokkan ke registry.
2. Periksa target relasi, urutan dependency dan duplicate declarations.
3. Validasi tiap model punya kebijakan seed required/demo/system-generated.

### Verifikasi dan syarat selesai

Fixture field/view/target invalid gagal dengan pesan actionable; seluruh base metadata valid.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.01.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.02 — Test instalasi bersih, restart idempotent, upgrade legacy, seed reference, pelestarian edit pengguna, dan startup multi-replica.

- **Prasyarat:** M2.07
- **Baca/periksa:** packages/orm/src/addon.ts; orm-base/tests; postgres tests.
- **Deliverable:** Addon install/upgrade regression suite.

### Langkah pelaksanaan

1. Bangun fixture clean/legacy pada DB test.
2. Install, edit record, reinstall dan bandingkan external IDs/values.
3. Install bersamaan serta inject failure di tengah schema/seed untuk menguji rollback.

### Verifikasi dan syarat selesai

Tidak ada duplicate seed/lost user edit/partial committed upgrade; concurrency terserialisasi.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.02.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.03 — Verifikasi default system/superadmin, password awal dari konfigurasi, reset CLI/root script, dan tidak menimpa password yang sudah diubah.

- **Prasyarat:** M2.07
- **Baca/periksa:** models/user.ts; password helpers; reset command; root script.
- **Deliverable:** Password initialization/reset tests.

### Langkah pelaksanaan

1. Uji env initial password pada fresh DB tanpa mencetak nilainya.
2. Ubah password lalu reinstall dan pastikan hash tidak direset.
3. Jalankan reset command terhadap fixture DB dengan invalid/missing user/password cases.

### Verifikasi dan syarat selesai

Hash salted, plaintext tak tersimpan/terlog; root command tersedia dan status exit benar.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.03.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.04 — Verifikasi company default, reference countries, states, banks, partner bank, serta provenance/update policy data referensi; jangan mengklaim states lengkap bila hanya subset.

- **Prasyarat:** M0.08
- **Baca/periksa:** countries.ts; states.ts; bank/company models; data.ts.
- **Deliverable:** Reference-data policy dan tests.

### Langkah pelaksanaan

1. Audit dataset source/date/code uniqueness dan relasi default company.
2. Pisahkan required references dari demo bank/account; tampilkan subset coverage secara jujur.
3. Tetapkan update procedure yang mempertahankan references existing dan menangani renamed/deprecated code.

### Verifikasi dan syarat selesai

Unique constraints diuji; record referensi tidak hilang diam-diam; provenance tercatat.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.04.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.05 — Audit autentikasi: hashing, enumeration, throttling, refresh replay/concurrency, perubahan role/password, dan batas waktu revocation access token.

- **Prasyarat:** M0.02
- **Baca/periksa:** packages/auth/src; auth plugin/routes; session tests.
- **Deliverable:** Auth threat cases dan regression tests.

### Langkah pelaksanaan

1. Petakan token/session lifecycle dan attack surface.
2. Test password verify, common error response, rate limit, replay dan simultaneous refresh.
3. Tentukan kebijakan invalidation saat role/password/active berubah dan dokumentasikan window access token.

### Verifikasi dan syarat selesai

Session behavior sesuai kontrak; replay tidak menghasilkan family valid baru; sensitive fields tak bocor.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.05.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.06 — Test izin negatif CRUD/count/export/direct API dan isolasi company, termasuk relasi lintas-company.

- **Prasyarat:** M2.07, M0.02
- **Baca/periksa:** apps/api/src/auth/policy.ts; rules.ts; record-rules tests.
- **Deliverable:** Authorization matrix tests.

### Langkah pelaksanaan

1. Buat admin/member/outsider fixtures pada company A/B.
2. Uji CRUD/count/export dan eager relations lewat direct request.
3. Test forged company header, foreign key lintas-company dan endpoint self-service terhadap user lain.

### Verifikasi dan syarat selesai

Forbidden result tidak mengungkap data/total; relation assignment lintas-scope ditolak.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.06.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.07 — Batasi pagination, query cost, kedalaman eager relations, payload, sorting, dan filter; cegah mass assignment.

- **Prasyarat:** M0.01
- **Baca/periksa:** generic.routes.ts; base.model.ts; domain.ts.
- **Deliverable:** Query/input guardrails dan tests.

### Langkah pelaksanaan

1. Tetapkan batas request berdasarkan penggunaan nyata: limit, domain depth, eager depth, sort columns.
2. Validasi input sebelum query; whitelist writable fields per action.
3. Test malformed/extreme domain dan unknown fields tanpa raw SQL string concatenation.

### Verifikasi dan syarat selesai

Invalid input menghasilkan bounded 4xx, bukan query tak terbatas atau 500; normal UI tetap bekerja.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.07.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.08 — Pastikan field sensitif tidak muncul dalam JSON, export, audit, error, atau log.

- **Prasyarat:** M0.01
- **Baca/periksa:** Serialization; audit writer; export; logger redaction.
- **Deliverable:** Redaction/serialization regression.

### Langkah pelaksanaan

1. Definisikan sensitive field list/source metadata yang reusable.
2. Audit semua jalur output dan nested relation untuk password/token/credential.
3. Gunakan nilai sentinel test lalu scan response/export/log capture.

### Verifikasi dan syarat selesai

Sentinel tak muncul di output publik; debugging tetap mempunyai request ID dan safe error code.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.08.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.09 — Audit transaksi, constraint, indexes, concurrency edits, timezone, error mapping, dan rollback kegagalan upgrade programatis.

- **Prasyarat:** M4.02
- **Baca/periksa:** model-definition.ts; addon.ts; base.model.ts; DB errors.
- **Deliverable:** Data integrity tests dan policy.

### Langkah pelaksanaan

1. Audit unique/FK/index generation pada PostgreSQL dan backend supported.
2. Tetapkan concurrency editing policy sebelum menambah version field.
3. Test transaction failure, timezone boundary, duplicate write dan error mapping.

**Conflict contract:** Generic record updates use atomic transactions with audit/outbox writes. Concurrent writes follow last-commit-wins; there is no optimistic version token or stale-write conflict response yet. Clients that need conflict detection must serialize edits until a version contract is implemented.

### Verifikasi dan syarat selesai

Constraint error memiliki response aman; rollback tidak meninggalkan setengah data; chosen conflict behavior terdokumentasi.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.09.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.10 — Scheduler/worker: claim atomik, lease, heartbeat, retry/backoff, recovery setelah crash, cancellation, dead-letter, dan job history.

- **Prasyarat:** M0.01, M2.07
- **Baca/periksa:** packages/jobs/src; jobs routes/commands; runtime.test.ts.
- **Deliverable:** Jobs failure-mode suite.

### Langkah pelaksanaan

1. Petakan states job dan atomic claim query.
2. Uji dua worker mengambil job yang sama, worker crash, lease expiry dan reclaim.
3. Test attempts/backoff/cancel/dead-letter dan schedule timezone/DST/overlap sesuai dukungan runtime.

### Verifikasi dan syarat selesai

Hanya claim owner dapat acknowledge; job macet pulih; retry budget terbatas dan history terbaca.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.10.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.11 — Outbox: transactional enqueue, delivery retries, deduplication/idempotency, dan pengujian efek eksternal ganda; jangan mengklaim exactly-once tanpa bukti.

- **Prasyarat:** M4.10
- **Baca/periksa:** Outbox implementation; outbox-worker.ts; transaction API.
- **Deliverable:** Outbox integration suite.

### Langkah pelaksanaan

1. Pastikan enqueue dalam transaksi perubahan bisnis.
2. Inject failure sebelum/selesai external send lalu retry.
3. Gunakan stable event ID dan receiver dedupe fixture; catat at-least-once semantics.

### Verifikasi dan syarat selesai

Rollback business tidak menghasilkan event terkirim; duplicate delivery tidak menggandakan efek pada receiver idempotent.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.11.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.12 — Attachment: izin upload/download, size/MIME, filename/path traversal, storage ownership, dan retensi.

- **Prasyarat:** M4.06
- **Status:** Selesai untuk provider filesystem lokal; object-storage adapter, malware scanning, dan orphan sweeper tetap dicatat sebagai M9.02.
- **Bukti:** [M4.12](evidence/M4.12.md); kontrak runtime lengkap di [attachments.md](../engineering/attachments.md).

- **Baca/periksa:** Attachment model/routes/storage implementation dari inventory.
- **Deliverable:** Attachment hardening tests.

### Langkah pelaksanaan

1. Audit ownership dari upload sampai download/delete; upload dan download wajib menyelesaikan parent record melalui row/company scope request.
2. Terima byte stream terbatas 10 MiB, MIME allowlist, nama UTF-8 aman maksimal 255 karakter, key UUID server-generated, checksum SHA-256, serta tulis temp-file mode 0600 lalu rename atomik.
3. Sembunyikan object key dari REST/RPC, view, audit, dan client; larang create/write metadata lewat generic API.
4. Gunakan forced download + `nosniff`/private cache headers; batasi upload 20 request per menit per IP.
5. Semantik retensi: archive mempertahankan binary untuk restore; hard delete metadata diikuti penghapusan binary. Dokumentasikan konsekuensi storage lokal dan proses orphan/expiry yang masih belum tersedia.
6. Uji metadata palsu, MIME di luar allowlist, traversal, size, content round-trip, akses lintas user, transaksi gagal, dan penghapusan file.

### Verifikasi dan syarat selesai

Unauthorized download tidak berhasil; invalid upload tidak menulis file; kegagalan metadata membersihkan file; hard delete menghapus bytes dan archive mempertahankan bytes.

Batas dukungan provider dan pekerjaan storage terdistribusi dicatat eksplisit pada bukti M4.12 dan M9.02; ini tidak menghalangi kontrak lokal yang telah diuji.

## M4.13 — Operasional: graceful shutdown, DB pools/timeouts, request ID, redaksi log, readiness/liveness API dan worker.

- **Prasyarat:** M0.01
- **Baca/periksa:** server.ts; health.routes.ts; observability; worker commands.
- **Deliverable:** Runtime lifecycle tests.

### Langkah pelaksanaan

1. Pisahkan liveness dari readiness dependency.
2. Implementasikan stop accepting lalu drain in-flight sesuai timeout dan tutup pools.
3. Redact config/logs dan expose metrics low-cardinality tanpa data pribadi.

### Verifikasi dan syarat selesai

SIGTERM runner selesai dalam batas; readiness false saat dependency wajib down; no secret log.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.13.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.14 — Restore drill dengan data aplikasi, relasi, akun test dan integrity checks; tetapkan target pemulihan berbasis hasil pengukuran.

- **Prasyarat:** M4.02, M4.03
- **Baca/periksa:** backup-postgres.sh; restore-postgres.sh; PostgreSQL fixture.
- **Deliverable:** Application restore drill report.

### Langkah pelaksanaan

1. Seed company/users/partners/relations dengan credential sintetis; backup ke temp dir.
2. Restore ke database baru terisolasi dengan confirmation safeguards.
3. Verifikasi counts/external IDs/relations dan login fixture; ukur durasi backup/restore.

### Verifikasi dan syarat selesai

Restore mismatch confirmation ditolak; restored app integrity pass; tidak menyentuh DB sumber.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.14.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.15 — Tambahkan baseline load/query tests dan budget regresi realistis; ukur N+1 serta operasi yang memperbesar penggunaan memori.

- **Prasyarat:** M0.03, M0.06
- **Baca/periksa:** base.model.ts; generic routes; baseline datasets.
- **Deliverable:** Performance fixtures dan report.

### Langkah pelaksanaan

1. Buat dataset kecil/menengah deterministik untuk list/count/eager/job claim.
2. Ukur query count/latency/memory pada runner fixed semampunya.
3. Tetapkan relative budgets dan analisis EXPLAIN untuk hot paths, bukan optimasi spekulatif.

### Verifikasi dan syarat selesai

N+1 terdeteksi oleh query-count assertion; benchmark laporan menyebut environment dan variance.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.15.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M4.16 — Dokumentasikan compatibility policy API/addon, deprecation, dan upgrade guidance.

- **Prasyarat:** M0.07
- **Baca/periksa:** Public exports; client/types; addon contracts.
- **Deliverable:** Compatibility policy dan contract tests.

### Langkah pelaksanaan

1. Daftar public APIs dan supported semantics.
2. Tetapkan deprecation window serta upgrade instructions untuk change incompatible.
3. Tambah contract tests untuk client→API dan addon example→ORM.

### Verifikasi dan syarat selesai

Breaking contract terdeteksi sebelum release; upgrade guide menjelaskan data/session impact.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M4.16.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.
