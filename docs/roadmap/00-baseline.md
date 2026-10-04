# M0 — Kartu kerja terperinci

Baca [protokol eksekusi](EXECUTION.md) terlebih dahulu. Status resmi tetap di [master checklist](../../ROADMAP.md); dokumen ini menjelaskan pekerjaan, bukan bukti bahwa fitur sudah ada. Path output yang belum ada adalah usulan deliverable. Semua path kode relatif terhadap root repository.

## M0.01 — Inventarisasi package, model, endpoint, view, menu, akses, seed, scheduler, worker, outbox, import/export, dan attachment yang benar-benar tersedia.

- **Prasyarat:** Tidak ada; pekerjaan read-only baseline dapat dimulai.
- **Baca/periksa:** package.json; pnpm-workspace.yaml; apps/api/src/routes; packages/orm-base/src/manifest.ts; packages/jobs/src.
- **Deliverable:** docs/engineering/inventory.md.

### Langkah pelaksanaan

1. Daftar semua workspace dan public exports.
2. Enumerasi endpoint, model, menu dan worker dari kode; tandai fitur UI yang tidak punya API dan sebaliknya.
3. Catat sumber file untuk setiap entri; jangan membaca nilai .env.

### Verifikasi dan syarat selesai

Setiap model manifest dan route terdaftar tepat sekali; entri yang tidak ditemukan diberi status missing.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M0.01.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M0.02 — Buat matriks fitur → role/company → skenario sukses/gagal → unit/integration/E2E → bukti → gap.

- **Prasyarat:** M0.01
- **Baca/periksa:** Hasil M0.01; apps/api/tests; packages/*/tests; apps/board/src/pages.
- **Deliverable:** docs/engineering/feature-matrix.md.

### Langkah pelaksanaan

1. Beri feature_id stabil untuk setiap perilaku pengguna.
2. Isi role/company, positive case, negative case, lapisan test, file test dan gap.
3. Bedakan implemented, tested, missing dan not-applicable beserta alasan.

### Verifikasi dan syarat selesai

Ambil login, count+relations dan ganti company sebagai sampel; telusuri dari layar ke assertion DB.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M0.02.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M0.03 — Rekam baseline typecheck, lint, format, build, test, coverage, bundle, performa, dan warning. Pisahkan kegagalan dari test yang skipped.

- **Prasyarat:** Tidak ada; pekerjaan read-only baseline dapat dimulai.
- **Baca/periksa:** package.json; apps/board/package.json; .github/workflows/ci.yml.
- **Deliverable:** docs/engineering/baseline.md.

### Langkah pelaksanaan

1. Jalankan script existing lint, format:check, build, test serta Board typecheck/lint secara terpisah.
2. Rekam exit code, jumlah pass/fail/skip, warning dan environment; coverage yang belum tersedia ditulis unavailable.
3. Catat ukuran output Board dan durasi tiap job tanpa mengubah threshold.

### Verifikasi dan syarat selesai

Laporan menyertakan command dan hasil asli; test skipped tidak dihitung pass.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M0.03.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M0.04 — Audit GitHub settings, workflows, permissions, Pages, registry, rulesets, status checks, dan ketersediaan fitur akun tanpa menampilkan secret.

- **Prasyarat:** Tidak ada; pekerjaan read-only baseline dapat dimulai.
- **Baca/periksa:** .github/workflows; gh repo view; gh api repos/{owner}/{repo}.
- **Deliverable:** docs/engineering/github-capabilities.md.

### Langkah pelaksanaan

1. Baca settings repository, branch/rulesets, Pages dan Actions permissions melalui API read-only.
2. Catat nama secret/variable yang diperlukan tanpa nilainya; bedakan unavailable karena izin dari belum dikonfigurasi.
3. Petakan kemampuan public repository dan GitHub App yang diperlukan ke item roadmap.

### Verifikasi dan syarat selesai

Semua kebutuhan ruleset/Pages/publish memiliki status supported, needs-setup atau unsupported dengan bukti.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M0.04.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M0.05 — Inventarisasi duplikasi, komponen besar, dependency tidak terpakai, siklus import, dan tanggung jawab yang masih membebani apps/api atau Board.

- **Prasyarat:** M0.01
- **Baca/periksa:** apps/api/src; apps/board/src; packages/*/src.
- **Deliverable:** docs/engineering/refactor-map.md.

### Langkah pelaksanaan

1. Kelompokkan tanggung jawab dan jalur dependency; cari implementasi serupa dengan rg.
2. Ukur file besar sebagai sinyal lalu periksa alasan kompleksitas; jangan memecah berdasarkan line count semata.
3. Buat kandidat ekstraksi dengan lokasi asal, konsumen, public contract dan risiko.

### Verifikasi dan syarat selesai

Setiap usulan package punya minimal satu masalah coupling atau dua penggunaan konkret.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M0.05.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M0.06 — Tetapkan versi runtime/database/browser yang didukung, anggaran durasi CI, retensi artefak, serta baseline performa yang terukur.

- **Prasyarat:** M0.03
- **Baca/periksa:** Dockerfile; .github/workflows/ci.yml; package.json; baseline M0.03.
- **Deliverable:** docs/engineering/support-policy.md.

### Langkah pelaksanaan

1. Inventarisasi versi Node/pnpm/PostgreSQL/browser yang benar-benar dipakai.
2. Tentukan matrix minimum dan full regression; tandai versi/tool yang tidak kompatibel.
3. Tetapkan anggaran berdasarkan pengukuran, retensi awal dan alasan; jangan menjanjikan performa sebelum benchmark.

### Verifikasi dan syarat selesai

Build lokal dan CI menggunakan runtime yang konsisten; setiap budget punya satuan dan command ukur.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M0.06.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M0.07 — Dokumentasikan keputusan arsitektur: versi monorepo bersama, dua branch, model promosi, sumber metadata, dan batas package.

- **Prasyarat:** M0.01, M0.04
- **Baca/periksa:** ROADMAP.md; M0.01–M0.06.
- **Deliverable:** docs/decisions/0001-platform-contracts.md.

### Langkah pelaksanaan

1. Tulis ADR untuk shared version, two-branch flow, generated metadata dan package boundaries.
2. Tentukan pemilik source of truth dan larangan duplikasi per keputusan.
3. Catat alternatif yang ditolak dan cara mengubah keputusan tanpa merusak kompatibilitas.

### Verifikasi dan syarat selesai

Tidak ada ADR yang mensyaratkan release branch atau deployment aplikasi.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M0.07.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M0.08 — Fresh install seed tepat 2 user + 10 partner (12 record utama); pertahankan partner existing pada upgrade, dan buktikan reinstall tidak menggandakan/menimpa edit.

- **Prasyarat:** M0.01
- **Baca/periksa:** packages/orm-base/src/data.ts; packages/orm-base/tests/addon.test.ts.
- **Deliverable:** Seed contract dan test regresi pada packages/orm-base/tests.

### Langkah pelaksanaan

1. Hitung user dan partner menurut external ID pada DB test baru, bukan label test.
2. Tetapkan dua user dengan partner masing-masing ditambah sepuluh partner contoh; system tetap mengikuti kebijakan akses teknis.
3. Rancang penambahan seed yang kurang memakai ID stabil tanpa menghapus/edit partner pengguna.

### Verifikasi dan syarat selesai

Fresh install menghasilkan 2 user dan 10 baris partner total (dua di antaranya profile user; 12 record utama bila user dan partner dihitung bersama). Reinstall mempertahankan sepuluh record dan edit; upgrade DB yang sudah berisi partner lama tidak menghapus record existing.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M0.08.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.
