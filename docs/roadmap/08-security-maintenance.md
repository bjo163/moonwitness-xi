# M8 — Kartu kerja terperinci

Baca [protokol eksekusi](EXECUTION.md) terlebih dahulu. Status resmi tetap di [master checklist](../../ROADMAP.md); dokumen ini menjelaskan pekerjaan, bukan bukti bahwa fitur sudah ada. Path output yang belum ada adalah usulan deliverable. Semua path kode relatif terhadap root repository.

## M8.01 — Default workflow read-only; scoped writes untuk bot/promosi/release/Pages dan gunakan GitHub App bila dibutuhkan.

- **Prasyarat:** M0.04
- **Baca/periksa:** GitHub permissions baseline; planned workflows.
- **Deliverable:** Workflow permission matrix.

### Langkah pelaksanaan

1. Set contents:read top-level dan per-job grants minimal.
2. Pisahkan App installation token untuk branch writes dari publication token.
3. Dokumentasikan permission setiap operation dan token lifetime; hindari PAT personal bila App cukup.

### Verifikasi dan syarat selesai

Read-only job tidak mendapat write credential; no credentials dalam artifacts.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.01.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.02 — Pin external Actions ke SHA tervalidasi, perbarui berkala; pisahkan eksekusi kode tak tepercaya dari job berkredensial.

- **Prasyarat:** M8.01
- **Baca/periksa:** uses entries; fork/PR triggers.
- **Deliverable:** Pinned workflows dan trust tests.

### Langkah pelaksanaan

1. Resolve action release ke verified immutable SHA dan catat human-readable version comment.
2. Jangan gunakan pull_request_target untuk menjalankan kode PR dengan secrets.
3. Filter downstream workflow_run source dan hindari cache poisoning trust crossing.

### Verifikasi dan syarat selesai

Validator menolak unpinned third-party action; fork execution tidak memperoleh publish privileges.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.02.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

`pnpm automation:check:action-pins` memeriksa seluruh `.github/**/*.yml` dan `.yaml`, termasuk composite action lokal. Setiap external `uses:` harus memakai SHA lowercase 40 karakter dan komentar versi yang terbaca; local `./...` action dikecualikan. Test negatif berjalan di automation CI.

## M8.03 — Aktifkan code/dependency/secret scanning yang tersedia; scan container dan tetapkan severity policy serta exception beralasan dengan expiry.

- **Prasyarat:** M0.04, M2.04
- **Baca/periksa:** Repository security availability; dependencies; Docker images.
- **Deliverable:** Security workflow dan policy.

### Langkah pelaksanaan

1. Aktifkan CodeQL untuk JavaScript/TypeScript dan GitHub Actions pada PR/push, jadwal mingguan, dan dispatch; scope `security-events:write` hanya pada job analisis.
2. Scan dependency graph dari lockfile serta image API dan Board hasil build pada lane container; block temuan CRITICAL yang actionable dan unggah tiap hasil SARIF.
3. Definisikan exception minimum (ID, owner, alasan, expiry ISO); exception kedaluwarsa atau format invalid menggagalkan CI. Scanner error harus fail-closed dan tidak boleh dinyatakan sebagai scan bersih.
4. Rekam status secret scanning/push protection dan keterbatasan alert/dependency settings dari GitHub; aktifkan dependency alerts yang tersedia setelah hak akses terkonfirmasi.

5. Jalankan Gitleaks atas seluruh riwayat pada PR/push ke `dev` dan `main`, jadwal mingguan, serta dispatch manual. Beri workflow `contents: read`, pin action ke SHA, jangan izinkan komentar atau upload laporan yang dapat membocorkan nilai; allowlist hanya baris fixture/local yang ditinjau.

### Verifikasi dan syarat selesai

Seeded vulnerable fixture terdeteksi; expired exception gagal; no false promise fitur akun unsupported.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.03.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.04 — Simpan dokumentasi satu kali konfigurasi App/settings; jangan menyimpan credential bot dalam repo.

- **Prasyarat:** M0.04, M8.01
- **Baca/periksa:** GitHub App required scopes; settings capability report.
- **Deliverable:** docs/operations/github-bootstrap.md.

### Langkah pelaksanaan

1. Tulis langkah create/install App, secret/variable names dan pemilik rotation.
2. Simpan hanya contoh placeholder; test authentication dengan read metadata.
3. Catat external setup yang belum ada sebagai blocked dependency, bukan success palsu.

### Verifikasi dan syarat selesai

Runbook bisa diikuti tanpa menebak scopes; log tidak mencetak private key/token.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.04.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.05 — Updater mingguan menyiapkan dependency runtime/dev/actions dalam kelompok; tidak membuat branch ketiga.

- **Prasyarat:** M0.01, M1.12
- **Baca/periksa:** Dependency graph; lockfile; action pins.
- **Deliverable:** Dependency update planner.

### Langkah pelaksanaan

1. Jalankan scheduled updater dalam temp checkout detached dari dev SHA.
2. Kelompokkan runtime/dev/actions; batasi batch dan daftar versions/changelogs.
3. Jangan enable default dependency PR creation yang membuat branch ketiga.

### Verifikasi dan syarat selesai

Update plan menunjukkan exact packages dan compatibility class; no remote write saat plan-only.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.05.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.06 — Uji kandidat update sebelum menulis ke dev; periksa SHA asal, serialisasi bot writes, dan jangan mencampur beberapa major upgrade.

- **Prasyarat:** M8.05, M7.08, M2.05
- **Baca/periksa:** Candidate updates; CI harness; bot coordinator.
- **Deliverable:** Dependency candidate executor.

### Langkah pelaksanaan

1. Apply satu batch, regenerate lockfile dengan package manager yang dipin, lalu run relevant/full gate.
2. Sebelum push periksa dev head; recompute jika berubah.
3. Tidak push kandidat gagal; report diff dan error untuk maintainer.

### Verifikasi dan syarat selesai

Failure tidak mengubah dev; parallel human commit tetap ada setelah successful update.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.06.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.07 — Patch/minor tetap melewati suite penuh dan promosi; major update menghasilkan laporan kompatibilitas sebelum diterapkan.

- **Prasyarat:** M8.06, M1.08
- **Baca/periksa:** Semver update class; support policy.
- **Deliverable:** Dependency promotion policy.

### Langkah pelaksanaan

1. Bedakan patch/minor dari major berdasarkan actual API/build compatibility, bukan angka saja.
2. Major menghasilkan report changes, migration tasks dan test impacts sebelum dipilih.
3. Semua applied changes tetap melewati promotion gate tanpa direct main write.

### Verifikasi dan syarat selesai

Major cannot auto-merge by label spoofing; patch failing E2E ditolak.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.07.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.08 — Scheduled regression: browser tambahan, schema upgrade, jobs recovery, application restore drill, dan security rescan.

- **Prasyarat:** M3.11, M4.10, M4.14
- **Baca/periksa:** Reusable full verify; maintenance schedule.
- **Deliverable:** Scheduled regression workflow.

### Langkah pelaksanaan

1. Jadwalkan full browsers, upgrades, jobs recovery, restore drill dan rescan pada waktu staggered.
2. Sediakan workflow_dispatch untuk semua scheduled jobs.
3. Catat last-success dan laporkan missing/stale runs; schedules bersifat best-effort.

### Verifikasi dan syarat selesai

Manual run menghasilkan laporan sama; missed schedule terdeteksi oleh audit berikutnya.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.08.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.09 — Jadwalkan issue pemeliharaan tanpa spam; deduplikasi failure issue, perbarui recovery, dan jangan auto-close laporan keamanan hanya karena sudah lama.

- **Prasyarat:** M2.10, M8.01
- **Baca/periksa:** Failure event payloads; GitHub Issues API.
- **Deliverable:** Maintenance issue reconciler.

### Langkah pelaksanaan

1. Buat key stabil workflow/category untuk dedup issue.
2. Update existing issue dengan latest SHA/run dan status; tutup hanya setelah recovery terverifikasi.
3. Redact log dan batasi frequency; security incident mengikuti disclosure policy terpisah.

### Verifikasi dan syarat selesai

Lima failure sama menghasilkan satu issue; recovery komentar/link benar.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.09.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.10 — Audit retensi artifacts/logs, registry growth, biaya Actions, permission drift, dan toolchain end-of-support.

- **Prasyarat:** M0.06, M8.01
- **Baca/periksa:** Actions usage; artifact/registry listings; support matrix.
- **Deliverable:** Monthly platform audit.

### Langkah pelaksanaan

1. Ambil snapshot API Actions yang dipaginasi untuk artifacts, workflow runs, retention, allowed actions, default token permission dan nilai repo override; simpan timestamp, SHA audit, perintah, dan keterbatasan akses.
2. Bandingkan runtime (Node, pnpm, Postgres, browser, runner image) dengan support upstream; sertakan pemilik, tanggal tindak lanjut, dan bukti validasi.
3. Buat report bulanan dengan baseline/trend/action owner. Registry atau billing yang tidak dapat dibaca harus ditulis sebagai unknown beserta permission yang kurang, bukan nol.
4. Cleanup harus berupa rencana dry-run dengan daftar ID, klasifikasi disposable/immutable, umur, dan alasan. Hapus hanya setelah tiap target lolos allowlist disposable; preserve released digests dan bukti penting.

### Verifikasi dan syarat selesai

Dry-run cleanup tidak memilih immutable releases; permissions drift ditampilkan.

Snapshot parsial 2026-10-05 ada di [evidence M8.10](evidence/M8.10.md). Jangan menandai milestone selesai sampai audit otomatis, baseline bulanan yang dapat dibandingkan, biaya/registry yang terukur atau terjelaskan, dan dry-run cleanup yang melindungi artifacts immutable tervalidasi.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.10.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M8.11 — Definisikan security reporting, incident response, credential rotation, dan release correction procedure.

- **Prasyarat:** M4.05, M8.04
- **Baca/periksa:** Auth/security architecture; release policy.
- **Deliverable:** SECURITY.md dan incident runbooks.

### Langkah pelaksanaan

1. Tulis vulnerability reporting channel yang benar-benar tersedia.
2. Buat runbook revoke/rotate App/JWT/provider credentials serta incident containment.
3. Release correction memakai versi baru dan disclosure sesuai risiko, tidak memindahkan published tags.

### Verifikasi dan syarat selesai

Tabletop scenario token leak punya langkah/pemilik/verifikasi recovery yang jelas.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M8.11.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.
