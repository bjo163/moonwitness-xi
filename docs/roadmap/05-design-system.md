# M5 — Kartu kerja terperinci

Baca [protokol eksekusi](EXECUTION.md) terlebih dahulu. Status resmi tetap di [master checklist](../../ROADMAP.md); dokumen ini menjelaskan pekerjaan, bukan bukti bahwa fitur sudah ada. Path output yang belum ada adalah usulan deliverable. Semua path kode relatif terhadap root repository.

## M5.01 — Inventarisasi UI Board; tentukan arah visual MoonWitness dan audit contoh halaman representatif sebelum migrasi massal.

- **Prasyarat:** M0.05
- **Baca/periksa:** apps/board/src/components/ui; components/manga; index.css.
- **Deliverable:** docs/design/visual-direction.md.

### Langkah pelaksanaan

1. Inventarisasi komponen reusable, style hardcoded, ikon, font dan asset existing.
2. Buat contact sheet login/dashboard/list/form pada light/dark sebagai baseline.
3. Tentukan arah MoonWitness orbit/fase/pengamatan dalam spec sederhana; audit desain pada tiga layar sebelum ekstraksi.

### Verifikasi dan syarat selesai

Arah visual punya aturan yang dapat diukur dan daftar komponen asal; identitas existing tidak dibuang tanpa alasan.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.01.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.02 — Buat `@moonwitness/assets`: logo simbol/wordmark/lockup, versi terang/gelap/monokrom, favicon dan social image.

- **Prasyarat:** M5.01
- **Baca/periksa:** pnpm-workspace.yaml; existing branding; packages/assets (baru).
- **Deliverable:** packages/assets/brand dan export manifest.

### Langkah pelaksanaan

1. Buat package asset framework-independent dengan manifest ekspor dan README.
2. Gambar master SVG simbol/wordmark/lockup original; sediakan light/dark/mono serta favicon.
3. Ekspor raster banner/social secara deterministik dari master bila dibutuhkan.

### Verifikasi dan syarat selesai

Logo terbaca pada 16/24/32px dan banner; SVG valid dan tidak bergantung font yang tak tersedia.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.02.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.03 — Buat tokens warna/semantik, tipografi, spacing, radius, shadow, motion, dan reduced-motion; dokumentasikan aturan penggunaan.

- **Prasyarat:** M5.01
- **Baca/periksa:** apps/board/src/index.css; ui package baru.
- **Deliverable:** packages/ui/src/styles/tokens.css dan token guide.

### Langkah pelaksanaan

1. Definisikan semantic tokens untuk surface/text/border/accent/status/focus dan chart palette.
2. Tambahkan scale spacing/radius/type/shadow/motion dengan light/dark mapping.
3. Set reduced-motion dan fallback font; jangan membuat dua sumber tokens yang bisa drift.

### Verifikasi dan syarat selesai

Contrast text/control sesuai target aksesibilitas; theme switch tidak mengubah semantics status.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.03.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.04 — Buat ikon SVG konsisten untuk domain inti dan aksi umum; audit keterbacaan ukuran kecil serta identitas yang berbeda dari brand lain.

- **Prasyarat:** M5.01
- **Baca/periksa:** Asset manifest; icon usage dari Board.
- **Deliverable:** packages/assets/icons/*.svg dan icon inventory.

### Langkah pelaksanaan

1. Tetapkan viewBox 24, stroke defaults dan optical alignment yang konsisten.
2. Buat ikon partner/user/company/team/addon/model/field/relation/activity/attachment/notification/jobs/workflow/security dan aksi umum.
3. Audit rendered grid pada 16/20/24/32px; hindari menyalin logo produk lain.

### Verifikasi dan syarat selesai

Setiap ikon bernama stabil dan tanpa style inline yang memblokir theme; contact sheet direview.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.04.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.05 — Sediakan ikon React typed dengan currentColor, ukuran, title, dan aksesibilitas; gunakan static SVG untuk README.

- **Prasyarat:** M5.04, M5.08
- **Baca/periksa:** SVG sumber M5.04; React TypeScript config.
- **Deliverable:** packages/ui/src/icons.

### Langkah pelaksanaan

1. Generate atau tulis wrapper typed SVGProps tanpa any.
2. Gunakan currentColor, decorative aria-hidden default, accessible title/id bila diperlukan.
3. Pastikan named exports/subpaths tree-shakeable dan tidak mengimpor seluruh set saat memakai satu ikon.

### Verifikasi dan syarat selesai

Test accessible/decorative semantics dan duplikasi title ID; bundle satu ikon tidak memuat semua ikon.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.05.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.06 — Buat ilustrasi original empty/search/error/access denied/offline/onboarding serta pola latar ringan.

- **Prasyarat:** M5.02, M5.03
- **Baca/periksa:** Brand spec; Board empty/error contexts.
- **Deliverable:** packages/assets/illustrations dan usage guide.

### Langkah pelaksanaan

1. Buat ilustrasi no-records/no-results/no-activity/403/404/offline/onboarding dan background pattern.
2. Gunakan token palette terbatas, bentuk SVG sederhana dan varian dark.
3. Pisahkan ilustrasi dekoratif dari teks actionable yang tetap HTML.

### Verifikasi dan syarat selesai

Pesan tetap dapat dibaca saat gambar tidak dimuat; asset responsive dan tidak menambah layout shift.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.06.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.07 — Catat sumber/lisensi font dan asset; optimasi SVG, validasi script/external refs, dan cegah ID collision.

- **Prasyarat:** M5.02
- **Baca/periksa:** Semua SVG/font/asset sumber.
- **Deliverable:** Asset validation script dan licenses manifest.

### Langkah pelaksanaan

1. Catat creator/source/license/modifications serta metadata export.
2. Jalankan optimizer dengan config yang menjaga viewBox dan accessibility.
3. Tolak script/event attributes/foreignObject/external URL yang tak diizinkan; atur ID prefix atau React unique IDs untuk repeated inline SVG.

### Verifikasi dan syarat selesai

Malicious SVG fixtures gagal; dua ilustrasi sama dalam satu halaman tidak bertabrakan gradients/masks.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.07.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.08 — Buat `@moonwitness/ui` dengan exports jelas, tanpa dependency API/router/auth aplikasi dan tanpa side effect yang tidak terdokumentasi.

- **Prasyarat:** M0.07
- **Baca/periksa:** Existing Board ui files; workspace build conventions.
- **Deliverable:** packages/ui scaffold dan consumer smoke test.

### Langkah pelaksanaan

1. Buat package.json exports untuk components/icons/styles dan React peer dependency sesuai project.
2. Pindahkan primitive satu per satu; jangan masukkan client API/router/auth/business model.
3. Sediakan stylesheet entry eksplisit dan document consumer import/order.

### Verifikasi dan syarat selesai

Consumer fixture build berhasil; package graph tidak memiliki dependency ke apps atau auth/client.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.08.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.09 — Komponen dasar: button/input/select/checkbox/badge/avatar; interaksi: dialog/dropdown/tabs/tooltip/toast.

- **Prasyarat:** M5.08, M5.03
- **Baca/periksa:** button/input/select/dialog existing; design tokens.
- **Deliverable:** UI primitives dan interaction stories.

### Langkah pelaksanaan

1. Mulai dengan komponen existing dan pertahankan perilaku accessible library yang dipakai.
2. Definisikan variants terbatas dan forwarded refs/HTML props typed; buat stories default/disabled/loading/error.
3. Uji dialog focus trap/escape, select keyboard, button submit semantics dan tooltip name.

### Verifikasi dan syarat selesai

Semua primitive bekerja keyboard dan form; tidak ada event/aria prop yang hilang saat wrapper.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.09.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.10 — Komponen komposisi: field/help/error, card/skeleton/empty/error state, page header/toolbar/panel, pagination/table primitives.

- **Prasyarat:** M5.09
- **Baca/periksa:** Page/layout/view patterns pada Board.
- **Deliverable:** UI composition components.

### Langkah pelaksanaan

1. Ekstrak Field dengan id/description/error association; EmptyState dengan title/action yang diberikan konsumen.
2. Buat PageHeader/Toolbar/Panel/Pagination/Table primitives tanpa network fetching.
3. Pertahankan API yang composable; list domain filters tetap di Board.

### Verifikasi dan syarat selesai

Dua halaman berbeda menggunakan komponen tanpa kondisi model hardcoded; error dikaitkan aria-describedby.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.10.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.11 — Tetapkan theming dan compatibility policy komponen; hindari boolean props berlebihan dan barrel export yang membesarkan bundle.

- **Prasyarat:** M5.08
- **Baca/periksa:** ui exports; tsconfig; package graph.
- **Deliverable:** UI API contract dan export tests.

### Langkah pelaksanaan

1. Tentukan stable public exports dan aturan perubahan breaking.
2. Test stylesheet scoping agar Pages dan Board tidak saling merusak.
3. Ukur tree shaking serta cegah deep imports konsumen ke internal file.

### Verifikasi dan syarat selesai

Import public API build; internal changes tidak memerlukan edit semua consumers; CSS terisolasi sesuai kontrak.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.11.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.12 — Grafik data: tema, tooltip/legend, locale/timezone, loading/empty/error, tabel alternatif, dan responsivitas. Bentuk `@moonwitness/charts` hanya ketika reuse membenarkannya.

- **Prasyarat:** M5.03, M5.08
- **Baca/periksa:** Dashboard data yang benar tersedia; package reuse map.
- **Deliverable:** Chart components; ADR ekstraksi packages/charts.

### Langkah pelaksanaan

1. Implementasikan line/bar/status distribution sesuai kebutuhan riil memakai renderer terpilih.
2. Bungkus number/date/locale formatter, responsive container, legend/tooltip dan empty/error states.
3. Sediakan accessible summary/table; putuskan charts package setelah ada konsumsi Board dan docs showcase.

### Verifikasi dan syarat selesai

Nilai grafik cocok dengan fixture data; zero/missing values ditangani; theme dan locale konsisten.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.12.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.13 — Diagram arsitektur/relasi/alur: generate dari metadata bila tepat; kurasi diagram penjelasan agar terbaca.

- **Prasyarat:** M0.07, M4.01
- **Baca/periksa:** ORM metadata; ADR platform.
- **Deliverable:** docs/architecture/diagrams dan static exports.

### Langkah pelaksanaan

1. Generate diagram package dependencies dan model relation dari metadata tanpa nilai data.
2. Tulis diagram curated auth/refresh, jobs/outbox, addon install dan release lifecycle.
3. Ekspor SVG untuk README bila renderer markdown tidak mendukung bentuk sumber.

### Verifikasi dan syarat selesai

Diagram tidak merujuk package/model yang tidak ada; labels terbaca dan metadata source terlacak.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.13.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.14 — Migrasikan shell/login/profile/settings/list/form Board bertahap; hapus duplikasi dan dependency yang benar-benar tidak terpakai.

- **Prasyarat:** M5.09, M5.10, M3.01
- **Baca/periksa:** Board App/shell/pages/views; new ui exports.
- **Deliverable:** Board UI migration dan removal inventory.

### Langkah pelaksanaan

1. Migrasikan bertahap shell lalu auth/profile/settings lalu list/form; jangan sekaligus menulis ulang behavior.
2. Ganti imports melalui public package API dan hapus local duplicate hanya setelah semua consumers pindah.
3. Jalankan relevant E2E/visual diff setiap kelompok migrasi dan cek bundle delta.

### Verifikasi dan syarat selesai

UI parity terjaga; no duplicate token sources; Board tidak deep-import ui internals.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.14.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.15 — Gunakan sumber asset/tokens yang sama pada README dan Pages; ekspor statis sesuai kemampuan platform.

- **Prasyarat:** M5.02, M5.07
- **Baca/periksa:** README; docs portal; assets manifest.
- **Deliverable:** Branded README dan Pages assets.

### Langkah pelaksanaan

1. Gunakan paths publik/static yang benar untuk README dan Pages base path.
2. Ekspor banner/social dari master; jangan menyisipkan React ke README.
3. Tambahkan alt text dan varian dark/light yang sesuai dukungan target.

### Verifikasi dan syarat selesai

README render menampilkan gambar; Pages nested path bekerja; tidak ada copy asset tanpa source mapping.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.15.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.16 — Buat katalog komponen dengan variasi panjang teks, states, themes, keyboard dan ukuran layar; publikasikan bersama dokumentasi.

- **Prasyarat:** M5.09
- **Baca/periksa:** packages/ui; stories; docs portal routing.
- **Deliverable:** Storybook atau katalog setara yang dipilih dalam ADR.

### Langkah pelaksanaan

1. Buat katalog komponen dengan controls, usage examples dan source import.
2. Sertakan loading/disabled/error/long text/dark/mobile/reduced-motion stories.
3. Bangun static catalog pada subpath docs yang jelas; hindari menaruh test credentials di stories.

### Verifikasi dan syarat selesai

Build katalog membuka deep link dan assets di project Pages path; contoh compile typed.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.16.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.

## M5.17 — CI UI: typecheck, interaction/a11y, visual regression, SVG validation, export checks, dan bundle budget.

- **Prasyarat:** M5.16, M2.04
- **Baca/periksa:** UI stories; asset validator; CI graph.
- **Deliverable:** UI CI job dan report.

### Langkah pelaksanaan

1. Tambahkan UI typecheck/build/interactions/a11y/visual subset dan asset lint.
2. Tetapkan representative visual tests bukan snapshot semua kombinasi tanpa tujuan.
3. Laporkan bundle difference dan baseline review; link report ke workflow summary.

### Verifikasi dan syarat selesai

Broken aria label, invalid SVG dan perubahan layout fixture terdeteksi; legitimate baseline update dapat direview.

Catat command/test case, actual result, SHA sumber dan lokasi bukti dalam `docs/roadmap/evidence/M5.17.md` sesuai template. Jika kemampuan eksternal belum tersedia, pisahkan implementasi lokal yang selesai dari aktivasi yang terblokir; jangan centang item penuh. Jangan menonaktifkan check yang gagal agar item dianggap selesai.
