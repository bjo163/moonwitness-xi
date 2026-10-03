# M10 — Kartu kerja terperinci

Baca [protokol eksekusi](EXECUTION.md) terlebih dahulu. Status resmi tetap di [master checklist](../../ROADMAP.md); dokumen ini menjelaskan pekerjaan, bukan bukti bahwa fitur sudah ada. Path output yang belum ada adalah usulan deliverable. Semua path kode relatif terhadap root repository.

## M10.01 — Semua fitur inventarisasi punya status coverage; gap eksplisit mempunyai pemilik dan prioritas.

- **Prasyarat:** M0.02, M3.08, M4.16
- **Baca/periksa:** Feature matrix dan seluruh task evidence.
- **Deliverable:** Final feature coverage report.

### Langkah pelaksanaan

1. Cocokkan semua inventory features dengan actual tests dan remaining gaps.
2. Sampling test harus membaca assertions, bukan nama file saja.
3. Tetapkan owner/priority untuk gap dan jangan menandai mandatory gap sebagai selesai.

### Verifikasi dan syarat selesai

Setiap critical feature punya positive/negative assertions dan executed evidence.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.01.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.02 — Audit visual Board selesai dan bukti screenshot tersimpan; browser E2E tidak sekadar mengecek halaman terbuka.

- **Prasyarat:** M3.10, M5.14, M5.17
- **Baca/periksa:** Visual audit dan screenshot baselines.
- **Deliverable:** Final Board acceptance report.

### Langkah pelaksanaan

1. Jalankan audit final pada Board dengan UI package baru.
2. Bandingkan desktop/mobile/light/dark dan keyboard account/data flows.
3. Link screenshots, accessibility report dan fixes ke SHA final.

### Verifikasi dan syarat selesai

Tidak ada unresolved critical visual/usability finding; E2E memverifikasi persisted outcome.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.02.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.03 — Lint/types/build/tests dan seluruh required checks lolos pada commit yang dipromosikan.

- **Prasyarat:** M2.05, M7.07
- **Baca/periksa:** main/dev head; ci-gate; tests/typecheck/lint.
- **Deliverable:** Final CI evidence manifest.

### Langkah pelaksanaan

1. Pastikan checks berasal dari SHA promosi dan workflow identity benar.
2. Catat warnings/skip yang disetujui secara eksplisit.
3. Jangan memakai hasil run lama sebelum generated version/docs changes.

### Verifikasi dan syarat selesai

Semua mandatory checks success pada exact SHA; no missing jobs.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.03.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.04 — PostgreSQL integration benar-benar berjalan; upgrade, relasi/count, seed, dan izin negatif teruji.

- **Prasyarat:** M2.06, M4.02, M4.06
- **Baca/periksa:** PostgreSQL report; M4 install/access tests.
- **Deliverable:** PostgreSQL acceptance evidence.

### Langkah pelaksanaan

1. Pastikan DB integration count tidak nol dan tidak skipped.
2. Jalankan seed/upgrade/concurrent install/count-relations/negative access suite.
3. Verifikasi driver dan PostgreSQL version sesuai support policy.

### Verifikasi dan syarat selesai

Report menunjukkan executed cases dan isolated DB cleanup.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.04.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.05 — Image API/Board berjalan pada runner; health/readiness/shutdown dan konfigurasi container terverifikasi.

- **Prasyarat:** M7.09
- **Baca/periksa:** Release candidate containers; compose config.
- **Deliverable:** Container smoke evidence.

### Langkah pelaksanaan

1. Start DB/API/Board images di runner dengan test-only env dan isolated ports.
2. Poll readiness dengan timeout, test static page dan authenticated API request.
3. SIGTERM, drain dan cleanup tanpa akses server aplikasi.

### Verifikasi dan syarat selesai

Image digests sesuai candidate release; service starts/responds/shuts down; no deployment hooks.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.05.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.06 — Simulasi gagal membuktikan promosi/release diblokir; rerun tidak membuat duplikasi atau workflow loop.

- **Prasyarat:** M7.14
- **Baca/periksa:** Release/gate fault-injection suite.
- **Deliverable:** Automation failure acceptance report.

### Langkah pelaksanaan

1. Uji required check failure, skipped integration, stale approval, moved dev head dan partial publish.
2. Ulangi automation untuk input sama.
3. Catat remote writes yang direncanakan agar loops dan duplicate terbukti tidak terjadi.

### Verifikasi dan syarat selesai

Tidak ada promotion setelah failure; retry mempertahankan version/tag identity.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.06.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.07 — Satu siklus dev → main → version/tag/release/artifacts/Pages → sync dev terbukti dengan bukti SHA dan run URL.

- **Prasyarat:** M7.16, M6.07, M1.09, M10.03, M10.04, M10.05, M10.06
- **Baca/periksa:** Seluruh prasyarat M1–M8; first publish decision.
- **Deliverable:** End-to-end release trace.

### Langkah pelaksanaan

1. Jalankan satu perubahan releasable melalui dev preparation dan PR promotion.
2. Tautkan source/prepared/merged SHAs ke tag, image digest, release, Pages dan sync.
3. Jika salah satu stage gagal, lanjutkan via runbook lalu dokumentasikan recovery.

### Verifikasi dan syarat selesai

Satu release lengkap dari SHA tervalidasi dan dev tersinkron tanpa branch ketiga.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.07.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.08 — Hanya main/dev ada pada repository asal; tidak ada workflow deployment aplikasi yang aktif.

- **Prasyarat:** M1.02, M1.11, M1.12
- **Baca/periksa:** git ls-remote --heads; workflow inventory; rulesets.
- **Deliverable:** Governance acceptance snapshot.

### Langkah pelaksanaan

1. Baca remote branch list dan ruleset efektif.
2. Cari deploy application hooks/workflows dan bot ref writes.
3. Verifikasi Pages artifact source serta registry publication tidak deploy app.

### Verifikasi dan syarat selesai

Hanya main/dev pada repo asal dan tidak ada app deployment aktif.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.08.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.09 — README/Pages/asset catalog sesuai source dan release; tidak ada secret atau data pengguna dalam output publik.

- **Prasyarat:** M6.09, M5.15, M10.07
- **Baca/periksa:** Built docs/catalog/assets; release manifest.
- **Deliverable:** Documentation publication acceptance.

### Langkah pelaksanaan

1. Periksa logo/README links dan nested Pages routes pada published site.
2. Pastikan displayed version/source SHA sesuai policy stable/docs-only.
3. Scan public outputs dan cocokkan source asset mapping.

### Verifikasi dan syarat selesai

Dokumentasi dapat dibuka, konsisten, tanpa credential atau data pengguna.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.09.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M10.10 — Tetapkan recurring maintenance di bawah dan catat keterbatasan tersisa sebelum milestone dinyatakan selesai.

- **Prasyarat:** M8.08, M8.09, M8.10, M10.01, M10.02, M10.08, M10.09
- **Baca/periksa:** Maintenance schedule; evidence log; unresolved issues.
- **Deliverable:** Handoff report dan maintained roadmap.

### Langkah pelaksanaan

1. Tetapkan cadence, command/workflow, owner role dan escalation setiap rutin.
2. Catat limitations dan external setup secara spesifik beserta next action.
3. Update checklist hanya untuk task dengan bukti; jangan tutup future addon yang belum dibuat.

### Verifikasi dan syarat selesai

Maintainer baru dapat memilih task berikutnya dan menjalankan recovery tanpa konteks chat.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M10.10.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.
