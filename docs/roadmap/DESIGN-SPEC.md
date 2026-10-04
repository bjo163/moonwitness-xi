# Spesifikasi minimum design system

Ini kontrak deliverable, bukan izin untuk mengganti perilaku bisnis Board. Semua komponen baru harus dipakai oleh consumer nyata atau dibutuhkan oleh katalog; jangan menghasilkan ratusan variasi kosong.

## Struktur target

```text
packages/assets/
  package.json
  README.md
  manifest.json
  brand/             # SVG sumber logo dan lockups
  icons/             # SVG ikon framework-independent
  illustrations/     # empty/error/onboarding
  exports/           # hasil raster/static yang perlu didistribusikan
  licenses/          # provenance dan font/third-party licenses
packages/ui/
  package.json
  README.md
  src/styles/        # tokens/theme/base contract
  src/icons/         # typed React wrappers
  src/components/    # reusable visual primitives/composition
  stories/           # contoh dan state catalog
  tests/             # interaction/public contract
```

Katalog dapat ditempatkan sebagai app terpisah jika tooling memerlukannya. Charts diekstrak setelah reuse terbukti; keputusan menunda ekstraksi tidak berarti menghilangkan kebutuhan grafik.

## Token minimum

| Kelompok | Tokens/aturan wajib                                                |
| -------- | ------------------------------------------------------------------ |
| Surface  | page, panel, elevated, muted, overlay                              |
| Text     | primary, secondary, muted, inverse, link, disabled                 |
| Border   | default, strong, focus, invalid                                    |
| Status   | info, success, warning, danger; foreground dan background pasangan |
| Brand    | accent, accent-hover, accent-foreground                            |
| Spacing  | Scale tunggal, penggunaan antar-component terdokumentasi           |
| Type     | Family, size, line-height, weight; readable body dan table density |
| Shape    | Radius kecil/sedang/besar; pemakaian bukan nilai acak per halaman  |
| Motion   | Duration/easing sempit; prefers-reduced-motion respected           |
| Chart    | Palette kategorikal dan status; tidak bergantung warna saja        |

Nilai warna/font final ditentukan lewat contact sheet M5.01–M5.03, bukan menebak dalam implementasi tiap component. Tokens bukan berkas konfigurasi duplikat CSS+TS yang diedit manual; jika perlu keduanya, derive dari satu sumber.

## Inventaris asset minimum

| Jenis           | Variasi/deliverable                     | Verifikasi                                             |
| --------------- | --------------------------------------- | ------------------------------------------------------ |
| Brand symbol    | light/dark/mono                         | Terbaca 16, 24, 32px                                   |
| Wordmark/lockup | horizontal dan compact                  | Tidak clipped, ruang aman konsisten                    |
| Favicons        | Format browser yang dibutuhkan          | Berasal dari master, bukan gambar terpisah             |
| README banner   | Static SVG atau raster sesuai rendering | Teks terbaca di lebar README                           |
| Social image    | 1200×630 target awal                    | Tidak berisi status/version hardcoded yang cepat stale |
| Empty states    | no-records/no-results/no-activity       | Teks dan action tetap HTML dari consumer               |
| Error states    | forbidden/not-found/offline/error       | Tidak menyiratkan hilangnya data saat hanya offline    |
| Onboarding      | Satu visual utama dan pattern ringan    | Tidak mengganggu form login atau aksesibilitas         |

Untuk setiap asset, catat source path, output path, creator/provenance, license, intended usage dan ukuran. Buat SVG manual/programatis yang editable untuk vector. Jika raster generatif dipakai kemudian, simpan provenance dan jangan menjadikannya sumber ikon presisi yang tidak dapat diedit.

## Component contract

| Komponen           | Props/perilaku minimum                             | Test penting                                                |
| ------------------ | -------------------------------------------------- | ----------------------------------------------------------- |
| Button             | variant, size, disabled, loading, native type, ref | Loading tidak duplicate submit; type default terdokumentasi |
| Input/Textarea     | native props, ref, invalid/description association | Label fokus, disabled, required, server error               |
| Select             | controlled value, options/content, label, disabled | Keyboard, long labels, empty selection                      |
| Checkbox/Switch    | controlled checked, accessible label               | Space toggle, disabled, form integration                    |
| Badge/Avatar       | variants semantik; fallback avatar                 | Tidak mengandalkan warna; missing image                     |
| Dialog/Sheet       | controlled open, title/description, close behavior | Focus trap/restore, Escape, scroll                          |
| Dropdown/Tooltip   | trigger semantics, keyboard behavior               | Icon-only accessible name, focus                            |
| Field              | label/input association, hint/error                | aria-describedby benar dan ID unik                          |
| Empty/Error state  | title, description, optional action                | Retry/action milik consumer; gambar dekoratif               |
| PageHeader/Toolbar | title, description, action slots                   | Mobile wrapping dan heading hierarchy                       |
| Pagination         | page/count atau total contract yang jelas          | Boundary, perubahan filter, disabled controls               |
| Table primitives   | semantic table, sortable header contracts          | Header associations dan keyboard actions                    |

Jangan membuat komponen UI mengambil `User`, `Partner`, permission policy atau HTTP client. Board menyiapkan data dan action callback. Primitive accessibility library existing dapat dipertahankan; ciri khas brand berasal dari style, ikon dan composition, bukan menulis ulang focus management tanpa alasan.

## Chart contract

- Konsumen memberi data typed, formatter atau locale/timezone, labels dan state.
- Tidak fetch API di chart package.
- Support empty, loading, error, zero values, missing points dan negative values bila jenis grafik mengizinkan.
- Tooltip menyediakan unit dan waktu dengan benar; jangan mengubah timezone diam-diam.
- Sediakan table/summary alternatif, bukan aria-label generik “chart”.
- Jangan tampilkan sample metric seolah data production. Demo diberi label dan fixture.
- Ukur bundle cost dan gunakan lazy loading bila grafik tidak dibutuhkan pada initial route.

## Migrasi Board

1. Pertahankan baseline screenshot dan test sebelum migrasi.
2. Migrasikan tokens dan primitives terlebih dahulu.
3. Migrasikan shell, auth, profile/settings, lalu list/form dan widgets.
4. Periksa UI parity dan perbaikan visual dengan screenshot diff per kelompok.
5. Cari consumers lama melalui rg sebelum menghapus local component.
6. Hapus dependency ikon/style hanya ketika tidak ada pemakaian tersisa.
7. Laporkan perubahan bundle dan aksesibilitas; jangan mengklaim “lebih ringan” tanpa ukur.
