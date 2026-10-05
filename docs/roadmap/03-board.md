# M3 — Kartu kerja terperinci

Baca [protokol eksekusi](EXECUTION.md) terlebih dahulu. Status resmi tetap di [master checklist](../../ROADMAP.md); dokumen ini menjelaskan pekerjaan, bukan bukti bahwa fitur sudah ada. Path output yang belum ada adalah usulan deliverable. Semua path kode relatif terhadap root repository.

## M3.01 — Siapkan browser automation yang dapat dijalankan lokal dan GitHub runner; gunakan API dan PostgreSQL sungguhan untuk alur kritis.

- **Prasyarat:** M2.07
- **Baca/periksa:** apps/board/vite.config.ts; apps/api/src/app.ts; scripts root.
- **Deliverable:** E2E config, fixtures dan smoke test.

### Langkah pelaksanaan

1. Tambah harness Playwright atau padanan terpilih dengan webServer readiness dan port terkelola.
2. Start DB/API/Board test via config eksplisit; buat auth fixtures tanpa memakai akun pengguna.
3. Sediakan satu command lokal/CI dan cleanup process milik harness.

### Verifikasi dan syarat selesai

Fresh checkout dapat menjalankan satu login test; server yang gagal start menghasilkan error jelas.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.01.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.02 — Audit desktop/mobile, light/dark, overflow, fokus keyboard, kontras, label, dan navigasi screen reader dasar.

- **Prasyarat:** M3.01
- **Baca/periksa:** apps/board/src/pages; components/layout; index.css.
- **Deliverable:** Visual audit report dan fixes.

### Langkah pelaksanaan

1. Ambil screenshot 375px, 768px dan 1440px untuk login/dashboard/list/form/profile/settings.
2. Periksa keyboard order, focus trap, escape dialog, overflow dan label form.
3. Catat setiap finding dengan halaman, langkah reproduksi, severity dan screenshot; perbaiki lalu verifikasi.

### Verifikasi dan syarat selesai

Tidak ada horizontal overflow tak sengaja; kontrol utama dapat digunakan keyboard; automated a11y disertai audit manual.

Audit M3.02 menghasilkan 33 screenshot di `test-results/visual-audit/`: enam route (login, dashboard, list, form, profile, settings) pada 375/768/1440 px; lima route terlindungi juga direkam dalam tema terang dan gelap. E2E memeriksa overflow pada seluruh kombinasi, Axe WCAG 2.1 A/AA pada login semua ukuran dan seluruh route terlindungi pada desktop kedua tema, serta keyboard order form login, fokus pembukaan navigasi mobile, dan Escape. Job browser mengunggah screenshot audit bersama JUnit sebagai artifact dengan retensi terbatas.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.02.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.03 — Test login sukses/gagal, logout, reload, expiry, refresh bersamaan, sesi dicabut, dan user nonaktif.

- **Prasyarat:** M3.01
- **Baca/periksa:** use-auth.tsx; protected-route.tsx; auth routes.
- **Deliverable:** auth-session E2E spec.

### Langkah pelaksanaan

1. Test credentials salah/sukses serta redirect return URL yang aman.
2. Reload halaman private lalu verifikasi session recovery; logout menghapus cache/session.
3. Simulasikan expiry/refresh concurrency/revocation tanpa sleep panjang melalui fixture clock/token.

### Verifikasi dan syarat selesai

Tidak ada refresh loop, data private setelah logout, atau login bypass untuk inactive account.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.03.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.04 — Test sidebar, command palette, dashboard, direct URL, Development Mode dan persistensinya; semua mengikuti metadata/akses yang sama.

- **Prasyarat:** M3.01
- **Baca/periksa:** lib/navigation.ts; preferences.ts; app-shell.tsx; dashboard.
- **Deliverable:** navigation-access E2E spec.

### Langkah pelaksanaan

1. Bandingkan model/menu visible per role terhadap metadata API.
2. Toggle Development Mode lalu reload; search command palette harus mengikuti pilihan.
3. Buka URL menu terlarang secara langsung dan pastikan backend tetap menolak.

### Verifikasi dan syarat selesai

Normal mode menyembunyikan technical menu; dev mode tidak memberi izin baru; label/group/order konsisten.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.04.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.05 — Test profil sendiri, language/timezone, ganti password, login ulang, dan error validasi.

- **Prasyarat:** M3.01
- **Baca/periksa:** profile-page.tsx; settings-page.tsx; auth.routes.ts.
- **Deliverable:** account-settings E2E spec.

### Langkah pelaksanaan

1. Edit profil fixture sendiri lalu baca ulang via API/reload.
2. Ubah locale/timezone dan periksa persistensi; invalid timezone menghasilkan validasi.
3. Ubah password dengan current salah/benar, confirmation mismatch, lalu login ulang dengan password baru.

### Verifikasi dan syarat selesai

Akun lain tidak berubah; old password ditolak setelah sukses; pesan revocation sesuai perilaku token nyata.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.05.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.06 — Test list/search/filter/sort/pagination/count, termasuk regresi `partner,language` dan count PostgreSQL.

- **Prasyarat:** M3.01, M2.06
- **Baca/periksa:** model-page.tsx; list-view.tsx; query-builder-dialog.tsx.
- **Deliverable:** data-list E2E regression.

### Langkah pelaksanaan

1. Seed lebih dari satu page dengan nilai sort dan filter yang dapat diprediksi.
2. Ubah search/filter/order/page dan bandingkan rows serta count ke fixture.
3. Uji with=partner,language plus count=true pada PostgreSQL dan perubahan filter saat di halaman akhir.

### Verifikasi dan syarat selesai

Tidak ada error 400/42803; page reset/clamp konsisten; total tidak hanya jumlah current page.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.06.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.07 — Test create/edit/archive/delete sesuai kebijakan model, field relasi, serta filter country/state.

- **Prasyarat:** M3.01
- **Baca/periksa:** form-view.tsx; fields.tsx; one2many-widget.tsx.
- **Deliverable:** record-edit E2E spec.

### Langkah pelaksanaan

1. Gunakan satu model sederhana dan satu model berelasi untuk create/edit.
2. Test required field, duplicate unique value, server validation dan archive/delete permissions.
3. Ganti country dan verifikasi state tidak mempertahankan pilihan yang tidak cocok.

### Verifikasi dan syarat selesai

Save valid persist; invalid save tidak membuat partial record; unauthorized action ditolak API.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.07.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.08 — Test import/export, attachment, activities, dan fitur Board lain jika ditemukan dalam inventarisasi.

- **Prasyarat:** M3.01, M0.01
- **Baca/periksa:** import-wizard-dialog.tsx; chatter.tsx; tags-widget.tsx; inventory.
- **Deliverable:** extended-board E2E specs.

### Langkah pelaksanaan

1. Pilih fitur yang implemented dari matriks; jangan buat test placeholder untuk UI yang belum ada.
2. Uji import valid/invalid, export scope, attachment permission dan activity ownership dengan fixture kecil.
3. Tandai fitur belum implemented sebagai backlog spesifik dengan expected contract.

### Verifikasi dan syarat selesai

Setiap fitur existing memiliki happy/negative test; export tidak memuat row/field terlarang.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.08.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.09 — Uji error/empty/loading states, jaringan terputus, stale data, double submit, dan pencegahan kebocoran cache antar-user/company.

- **Prasyarat:** M3.01
- **Baca/periksa:** React Query usage; use-model.ts; error boundaries.
- **Deliverable:** resilience E2E dan cache fixes.

### Langkah pelaksanaan

1. Intercept satu request untuk loading/network/500 lalu pulihkan.
2. Double click submit dan navigasi cepat untuk menguji race dan stale response.
3. Ganti company/account lalu verifikasi cache key dan invalidation tidak menampilkan data sebelumnya.

### Verifikasi dan syarat selesai

Error dapat dicoba ulang; save tidak berganda; cache tidak bocor antar-scope.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.09.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.10 — Simpan screenshot/trace saat gagal; buat visual baseline setelah audit manusia dan jangan auto-accept perubahan baseline.

- **Prasyarat:** M3.02
- **Baca/periksa:** E2E config; visual report M3.02.
- **Deliverable:** Visual regression suite.

### Langkah pelaksanaan

1. Set trace/screenshot failure dan screenshot baseline pada runner deterministik.
2. Mask data/time dinamis secara sempit, bukan seluruh isi halaman.
3. Simpan baseline review workflow; update baseline memerlukan diff visual yang diperiksa.

### Verifikasi dan syarat selesai

Perubahan layout pada baseline terpilih menghasilkan diff; auth secrets tidak tersimpan dalam artefak publik. Gunakan `pnpm board:visual:update` hanya setelah memeriksa setiap perubahan screenshot secara visual.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.10.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M3.11 — Jalankan browser utama pada perubahan rutin dan browser tambahan pada regresi terjadwal; dokumentasikan coverage browser.

- **Prasyarat:** M3.03, M3.06, M0.06
- **Baca/periksa:** Support matrix M0.06; browser config.
- **Deliverable:** Browser matrix workflow.

### Langkah pelaksanaan

1. Jalankan Chromium pada per-change suite.
2. Jalankan Firefox/WebKit yang didukung pada scheduled full suite.
3. Catat perbedaan engine yang nyata dan jangan menyamakan emulasi viewport dengan pengujian device fisik.

### Verifikasi dan syarat selesai

Core auth/form/navigation lolos pada matrix yang didukung; unsupported environment terdokumentasi.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M3.11.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.
