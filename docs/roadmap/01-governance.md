# M1 — Kartu kerja terperinci

Baca [protokol eksekusi](EXECUTION.md) terlebih dahulu. Status resmi tetap di [master checklist](../../ROADMAP.md); dokumen ini menjelaskan pekerjaan, bukan bukti bahwa fitur sudah ada. Path output yang belum ada adalah usulan deliverable. Semua path kode relatif terhadap root repository.

## M1.01 — Buat `dev` dari commit `main` yang tervalidasi, setelah memeriksa branch remote aktual.

- **Prasyarat:** M0.04
- **Baca/periksa:** git status; git ls-remote --heads origin; hasil CI main.
- **Deliverable:** dev terinisialisasi dan catatan bootstrap.

### Langkah pelaksanaan

1. Pastikan perubahan lokal tidak hilang dan SHA main telah lulus checks.
2. Jika dev belum ada, buat dari SHA main; jika sudah ada, bandingkan ancestry dan jangan reset.
3. Catat SHA kedua branch dan ubah target kerja berikutnya menjadi dev.

### Verifikasi dan syarat selesai

Remote hanya main/dev setelah bootstrap; existing branch tak dikenal dilaporkan, tidak dihapus diam-diam.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.01.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.02 — Batasi pembuatan branch selain `main`/`dev` melalui ruleset yang didukung repository.

- **Prasyarat:** M1.01
- **Baca/periksa:** Hasil M0.04; GitHub rulesets API.
- **Deliverable:** docs/engineering/repository-policy.json dan applied ruleset evidence.

### Langkah pelaksanaan

1. Siapkan konfigurasi rule restrict creation untuk semua branch dengan pengecualian refs/heads/main dan refs/heads/dev.
2. Periksa bypass aktor agar bot tidak bebas membuat branch tambahan.
3. Validasi payload dan aktifkan hanya setelah dev tersedia; uji API tanpa menciptakan branch terlarang nyata.

### Verifikasi dan syarat selesai

Pembacaan ulang ruleset cocok dengan desired config; tidak ada pengecualian wildcard bot.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.02.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.03 — Lindungi kedua branch dari deletion dan force-push; dokumentasikan akses darurat yang sempit dan dapat diaudit.

- **Prasyarat:** M1.01, M0.04
- **Baca/periksa:** Rulesets main/dev; daftar admin/App terverifikasi.
- **Deliverable:** Branch protection configuration dan emergency runbook.

### Langkah pelaksanaan

1. Larang deletion dan non-fast-forward update kedua branch.
2. Pisahkan aturan yang boleh dibypass bot dari aturan perlindungan branch.
3. Dokumentasikan prosedur emergency yang mencatat pelaku, alasan dan pemulihan rule.

### Verifikasi dan syarat selesai

Bot sinkronisasi tidak punya alasan untuk force-push; pembacaan rule menunjukkan protection aktif.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.03.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.04 — Batasi promosi `main` melalui PR `dev → main`; validasi sumber PR dengan check wajib.

- **Prasyarat:** M1.01, M2.05
- **Baca/periksa:** .github/workflows/ci.yml; metadata event pull_request.
- **Deliverable:** Promotion source check dan fixture tests.

### Langkah pelaksanaan

1. Tambahkan check yang memverifikasi base main, head dev dan repository asal sama.
2. Tolak PR fork yang kebetulan bernama dev untuk promosi stable.
3. Aktifkan required PR untuk main setelah source check dan ci-gate telah tersedia.

### Verifikasi dan syarat selesai

Fixture main←dev same repo pass; main←other dan fork/dev fail; dev CI tidak deadlock.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.04.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.05 — Buat satu PR promosi otomatis; gunakan merge commit dan jangan auto-delete `dev`.

- **Prasyarat:** M1.04, M8.04
- **Baca/periksa:** GitHub App setup; PR API; main/dev diff.
- **Deliverable:** Workflow promotion.yml idempotent.

### Langkah pelaksanaan

1. Cari PR open berdasarkan head/base; buat hanya jika ada diff dan belum ada PR.
2. Perbarui body dari release-plan dan status tanpa menimpa komentar reviewer.
3. Set merge method merge dan nonaktifkan delete branch otomatis untuk dev.

### Verifikasi dan syarat selesai

Dua run menghasilkan satu PR yang sama; no-diff tidak membuat PR; dev tetap ada setelah merge.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.05.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.06 — Tetapkan required checks yang stabil dan tidak deadlock akibat filter path atau job skipped.

- **Prasyarat:** M2.05, M1.04
- **Baca/periksa:** M2.05 ci-gate; current check names.
- **Deliverable:** Required checks policy.

### Langkah pelaksanaan

1. Enumerasi check names dan identitas App sumbernya dari run nyata.
2. Terapkan required checks pada main sesudah workflow berjalan; jangan require PR-only checks pada direct writes dev.
3. Uji docs-only, cancelled dan missing check pada fixture gate.

### Verifikasi dan syarat selesai

PR docs-only tetap memperoleh keputusan; missing job tidak menjadi green; jalur dev bot masih dapat memicu CI.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.06.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.07 — Atur CODEOWNERS untuk workflow, auth, akses, schema, dan release; tetapkan reviewer realistis sesuai jumlah maintainer.

- **Prasyarat:** M0.04
- **Baca/periksa:** Struktur package; akun maintainer yang benar-benar ada.
- **Deliverable:** .github/CODEOWNERS dan review policy.

### Langkah pelaksanaan

1. Tulis CODEOWNERS untuk auth, ORM, workflow, release dan docs/UI.
2. Periksa owner dapat mengakses repo dan jumlah reviewer tidak melebihi orang tersedia.
3. Tetapkan review untuk perubahan sensitif tanpa mengklaim CODEOWNERS sebagai enforcement sendiri.

### Verifikasi dan syarat selesai

GitHub tidak menampilkan invalid owner; ruleset review selaras dengan ownership.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.07.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.08 — Tentukan kebijakan promosi: patch/minor kompatibel bisa otomatis; breaking change, perubahan destruktif, dan perubahan kebijakan keamanan memerlukan persetujuan eksplisit.

- **Prasyarat:** M7.01, M1.07
- **Baca/periksa:** Release classification M7.01; CODEOWNERS.
- **Deliverable:** Promotion risk classifier dan tests.

### Langkah pelaksanaan

1. Tentukan input gate dari diff/commit/release plan, bukan hanya label yang bisa diubah penulis.
2. Izinkan auto-promotion hanya untuk kategori kompatibel yang seluruh checks-nya lulus.
3. Untuk breaking/schema destruktif/security policy, minta approval pada SHA terbaru dan batalkan jika diff berubah.

### Verifikasi dan syarat selesai

Fixture perubahan sensitif berlabel patch tetap memerlukan review; stale approval tidak dipakai.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.08.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.09 — Sinkronkan `main → dev` tanpa force-push; perubahan bersamaan atau konflik menghasilkan laporan, bukan overwrite.

- **Prasyarat:** M1.05
- **Baca/periksa:** main/dev history; merge strategy M1.05.
- **Deliverable:** Sync workflow/function dan conflict report.

### Langkah pelaksanaan

1. Fetch kedua head dan lakukan merge main ke dev di checkout bersih.
2. Push normal dengan cek SHA asal; jika dev bergerak, hitung ulang dari head baru.
3. Jika conflict, berhenti dan laporkan file/SHAs; jangan cherry-pick atau force overwrite otomatis.

### Verifikasi dan syarat selesai

Test history with concurrent dev commits mempertahankan seluruh commit dan tidak membuat loop sync.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.09.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.10 — Lindungi tag release dari pemindahan/penghapusan rutin; periksa drift ruleset dan settings.

- **Prasyarat:** M0.04
- **Baca/periksa:** Release tag naming M7; GitHub tag rulesets.
- **Deliverable:** Tag policy dan settings audit.

### Langkah pelaksanaan

1. Larang update/delete tag versi dan batasi aktor pembuatan tag.
2. Bandingkan desired settings dengan API aktual tanpa mengubah rule secara diam-diam.
3. Kirim drift sebagai report yang terdeduplikasi.

### Verifikasi dan syarat selesai

Tag existing tidak dipindahkan pada retry; drift terdeteksi pada fixture settings yang diubah.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.10.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.11 — Hapus alur staging/production deployment yang tidak digunakan; pertahankan smoke test lokal runner.

- **Prasyarat:** M0.04
- **Baca/periksa:** .github/workflows/deploy.yml; README; docker-compose.production.yml.
- **Deliverable:** Removal diff dan dokumentasi scope.

### Langkah pelaksanaan

1. Cari referensi staging/prod hook di workflows/docs.
2. Hapus workflow deployment aplikasi dan instruksi wajib staging; jangan hapus Dockerfile atau compose runtime.
3. Pastikan release/publish/Pages tidak mengirim request ke deploy hook.

### Verifikasi dan syarat selesai

rg workflows tidak menemukan stage deploy atau production deploy hook; container checks masih ada.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.11.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M1.12 — Pastikan updater dependency, generator docs, dan release bot tidak membuat branch ketiga; dokumentasikan keterbatasan strict two-branch untuk kolaborasi.

- **Prasyarat:** M0.07
- **Baca/periksa:** Release plan; dependency updater; Pages source.
- **Deliverable:** Branch creation audit.

### Langkah pelaksanaan

1. Inventarisasi setiap operasi create ref dari bot.
2. Gunakan dev untuk generated changes dan Actions artifacts untuk Pages.
3. Dokumentasikan bahwa PR dependency standar membutuhkan branch tambahan sehingga harus dimatikan/diganti.

### Verifikasi dan syarat selesai

Dry-run semua bot tidak merencanakan ref selain main/dev dan release tags.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M1.12.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.
