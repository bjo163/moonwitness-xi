# MoonWitness UI Visual Transformation — Todo

Checklist ini menjadi rencana kerja untuk mendekatkan Home, Board, dan workbench keempat mockup MoonWitness. Centang tugas setelah hasilnya dibuat dan kriteria tahap terkait diperiksa. Untuk pekerjaan visual, catat path screenshot atau specimen UI Catalog sebagai buktinya.

## Keputusan desain

- [x] Identitas utama baru memakai crown dan brush wordmark; crescent lama dimigrasikan.
- [x] Gambar 2 menjadi komposisi utama homepage.
- [x] Gambar 1 menjadi acuan detail kartu, sticker, orbit, moon phases, dan kolase homepage.
- [x] Gambar 4 menjadi acuan shell serta dashboard Board.
- [x] Gambar 3 menjadi acuan komposisi story workbench.
- [x] Mockup mengarahkan visual; tidak otomatis menambahkan fitur produk.
- [x] Pertahankan satu app Next.js yang sudah ada; jangan menambah app atau package.
- [x] Gunakan `@moonwitness/ui` untuk token, komponen, interaksi, efek, ikon React, dan audio.
- [x] Gunakan `@moonwitness/assets` untuk master media, SVG canonical, artwork, font, suara, dan provenance.
- [x] Gunakan UI Catalog yang sudah ada untuk specimen dan review visual.
- [x] Pertahankan data, route, permission, dan alur produk yang tersedia.
- [ ] Tempatkan contoh konten/fitur fiktif hanya dalam UI Catalog dengan label “contoh desain”.

## Cara mengerjakan checklist

- [ ] Kerjakan tahap secara berurutan; generator aset harus aman sebelum aset baru ditambahkan.
- [ ] Selesaikan tiga specimen utama di UI Catalog sebelum merombak semua halaman produksi.
- [ ] Catat path screenshot/specimen di samping item visual yang sudah disetujui.
- [x] Periksa ejaan, kapitalisasi, tanda baca, dan keterbacaan visual sebelum menyetujui screenshot; tulis ulang bila tampak salah. Bukti cek terakhir: Home dan Board, baseline visual audit.
- [ ] Jangan mencentang hanya karena build, lint, atau gate JSX lolos.
- [ ] Anggap tugas visual selesai setelah side-by-side review pada viewport yang ditentukan.

## A. Baseline dan audit produk

### Screenshot dan inventaris

- [x] Ambil screenshot homepage pada ukuran referensi `1672×941`. Bukti: Playwright baseline `apps/board/e2e/visual-audit.spec.ts-snapshots/home-reference-1672-chromium-win32.png`.
- [x] Ambil screenshot homepage desktop `1440×900`. Bukti: `test-results/visual-audit/home-desktop-1440.png`.
- [x] Ambil screenshot homepage mobile `390×844`. Bukti: Playwright baseline `apps/board/e2e/visual-audit.spec.ts-snapshots/home-mobile-390-chromium-win32.png`.
- [ ] Ambil screenshot Board untuk role pengguna biasa.
- [x] Ambil screenshot Board untuk role admin. Bukti: `test-results/visual-audit/dashboard-desktop-1440-dark.png` (fixture E2E admin).
- [x] Ambil screenshot workbench dengan dokumen berisi; periksa ejaan brand, judul, label, hash, dan teks preview secara visual. Bukti: baseline `workbench-filled-desktop-1440`, `workbench-filled-tablet-1024`, dan `workbench-filled-mobile-390` di `apps/board/e2e/visual-audit.spec.ts-snapshots/`.
- [x] Ambil screenshot workbench saat story belum tersimpan; periksa copy langkah menyimpan revisi pertama. Bukti: baseline `workbench-empty-desktop-1440` dan `workbench-empty-mobile-390` di `apps/board/e2e/visual-audit.spec.ts-snapshots/`.
- [x] Ambil screenshot workbench saat API gagal; periksa pesan retry, tombol save nonaktif, ejaan, dan keterbacaan. Bukti: baseline `workbench-error-desktop-1440` dan `workbench-error-mobile-390` di `apps/board/e2e/visual-audit.spec.ts-snapshots/`.
- [ ] Inventarisasi halaman login, registrasi, Knowledge, profil, dan settings.
- [ ] Inventarisasi halaman daftar/detail model, dialog, menu, sheet, toast, dan tabel.
- [ ] Catat consumer logo, icon, token warna, efek, serta CSS lokal yang akan dimigrasikan.
- [ ] Petakan tiap bagian mockup sebagai fitur tersedia, presentasi reusable, dekorasi, atau specimen katalog.
- [ ] Catat data yang tersedia untuk setiap panel sebelum mengubah susunannya.
- [ ] Pastikan nilai nol, data belum dimuat, dan request gagal tampil sebagai state berbeda.

### Pemetaan produk ke mockup

- [ ] Petakan KPI ke Partners, Active Users, Companies, dan Planned Activities.
- [ ] Petakan panel operasional admin ke jobs, outbox, cron, dan audit yang tersedia.
- [ ] Petakan aktivitas user ke aktivitas terencana yang tersedia.
- [x] Petakan workbench ke navigator halaman kiri, editor/preview tengah, dan inspector revisi kanan. Bukti: screenshot populated desktop/mobile dan assertions pada `apps/board/e2e/visual-audit.spec.ts`.
- [ ] Tandai workbench sebagai internal dan pertahankan batas tanpa publishing/upload/export.
- [ ] Jangan menambahkan statistik crew, negara, reach, atau tren tanpa sumber data.
- [ ] Jangan menampilkan publishing pipeline, arsip publik, poster editor, atau peta live yang belum tersedia.
- [ ] Gunakan panel seperti itu hanya sebagai specimen katalog jika diperlukan.

## B. Perbarui UI Bible

UI Bible tunggal tetap `packages/ui/README.md`. `packages/ui/TOKENS.md` menjadi rincian token dan kontras. Checklist ini mencatat pekerjaan, bukan aturan desain baru yang menduplikasi Bible.

- [x] Ganti aturan logo crescent/wordmark lama dengan crown + brush wordmark.
- [x] Petakan gambar 1–4 dan jelaskan peran masing-masing.
- [x] Tetapkan art direction: tinta gelap, paper cream, magenta, cyan, kuning, manga, dan kolase.
- [x] Dokumentasikan penggunaan lockup logo, symbol, clear space, dan ukuran minimum.
- [x] Dokumentasikan hierarki brush display, condensed, body, dan monospace.
- [x] Tegaskan brush dipakai untuk logo dan judul pendek; body/data tetap terbaca.
- [x] Bedakan ikon aksi canonical dari doodle dekoratif.
- [x] Dokumentasikan torn edge, paper note, tape, speckle, halftone, dan ink frame.
- [x] Tetapkan intensitas dekorasi: expressive untuk hero, balanced untuk editorial, restrained untuk data/form.
- [x] Dokumentasikan lapisan komponen: foundation → primitive → composition → pattern/effect.
- [x] Tegaskan UI package tidak memiliki route, auth, data, atau aturan domain.
- [x] Dokumentasikan public import dan cara menambah komponen shared.
- [x] Dokumentasikan aksesibilitas, fokus, kontras, responsive, dan reduced motion.
- [x] Dokumentasikan loading, error, empty state, serta penggunaan SFX.
- [x] Tambahkan contoh benar dan salah untuk brush type, texture, chart, data, serta focus ring.
- [x] Tambahkan checklist review visual terhadap mockup.
- [x] Tautkan `todo-ui.md` dari dokumen transformasi lama tanpa menyalin isi checklist.

Bukti Bible: `packages/ui/README.md`, token/kontras: `packages/ui/TOKENS.md`; sumber roadmap lama: `docs/transform.md`.

**Syarat selesai:** Bible tidak lagi mengunci crescent lama dan mencakup aturan yang dibutuhkan implementer.

## C. Amankan asset inventory dan generator

- [x] Petakan output yang dimiliki masing-masing generator saat ini. Bukti: ownership mapping dan tes pada `packages/assets/scripts/manifest-ownership.mjs`.
- [x] Ubah generator brand agar tidak menghapus entry milik generator lain. Bukti: `packages/assets/scripts/manifest-ownership.mjs`, tes ownership lulus.
- [x] Ubah generator ilustrasi agar tidak menghapus aset manual/artwork baru. Bukti: `packages/assets/tests/manifest-ownership.test.mjs`.
- [x] Pertahankan manifest dan daftar lisensi yang sudah ada; jangan membuat inventory/contract JSON duplikat.
- [x] Catat source/master dan turunan SVG/raster/audio di inventory yang sama. Bukti: `packages/assets/manifest.json`.
- [x] Catat creator, proses pembuatan, upstream source, lisensi, ukuran, dimensi, dan format. Bukti: `packages/assets/licenses.json`; validator lulus.
- [x] Bedakan artwork original, berbantuan AI, font upstream, dan aset pihak ketiga. Bukti: `packages/assets/licenses.json`.
- [x] Validasi file tanpa entry inventory. Bukti: `pnpm assets:validate` dan tes aset lulus.
- [x] Validasi entry inventory tanpa file. Bukti: `pnpm assets:validate` dan tes aset lulus.
- [x] Ganti tes jumlah aset tetap dengan validasi aset wajib dan export public. Bukti: tes ikon UI membaca jumlah dari manifest; artwork diuji berdasarkan aset wajib.
- [x] Pastikan paket hasil build menyertakan fonts.css dan seluruh asset public. Bukti package export/consumer test: `pnpm test:assets` dan `pnpm test:ui`.
- [x] Pastikan master beresolusi besar tidak terkirim sebagai payload halaman. Bukti: copy Board dan exporter docs mengecualikan `kind: source`; tes export memastikan asset master tidak dipublikasikan.
- [x] Pastikan perubahan asset masuk ke alur ekspor docs yang sudah ada. Bukti: social-card docs disinkronkan saat render; asset manifest menguji export docs.
- [x] Jalankan regenerasi dua kali dan pastikan hasilnya deterministik. Bukti: dua eksekusi `pnpm assets:generate` menghasilkan hash file yang identik.

### SVG canonical dan React wrappers

- [x] Perbaiki generator icon agar menjaga atribut SVG root yang didukung. Bukti: parser `packages/ui/scripts/icon-svg-to-jsx.mjs`.
- [x] Jaga `fill`, `stroke`, `fillRule`, dan `clipRule` dari sumber canonical. Bukti: tes fixture dan render server di `packages/ui/tests/icons.test.mjs`.
- [x] Pertahankan transform grup atau ratakan sebelum generation. Bukti: `<g transform>` dipertahankan; diuji pada fixture SVG.
- [x] Beri error yang jelas untuk SVG yang strukturnya tidak didukung. Bukti: tes `defs` dan pesan file/elemen di `packages/ui/tests/icons.test.mjs`.
- [x] Bandingkan render canonical SVG dengan React wrapper. Bukti: tes membandingkan semua root presentation attributes pada 50 wrappers hasil render React.
- [x] Pastikan mask/clip ID aman saat SVG digunakan berulang. Bukti: generator menolak ID/mask/clip yang berpotensi bentrok dan memberikan arahan flatten path.
- [x] Pertahankan validasi SVG tanpa script, external reference, atau konten executable. Bukti: `pnpm test:assets` memvalidasi semua 82 SVG.
- [x] Pastikan geometri SVG canonical tidak terpotong oleh `viewBox`; audit Chromium mencakup semua 82 SVG dan mengecualikan hanya orbit luar social-card yang dinamai eksplisit. Bukti: `pnpm assets:check:bounds`, `packages/assets/scripts/check-svg-bounds.mjs`, serta render visual `docs/design/assets/brand-contact-sheet-current.png` / `icon-contact-sheet-current.png`.
- [x] Pastikan semua public export mempunyai file dalam hasil paket. Bukti: `pnpm test:ui` memeriksa package tarball dan subpath.

**Syarat selesai:** generator tidak membuang aset baru dan output wrapper mempertahankan bentuk sumber.

## D. Token warna, material, dan typography

### Warna dan permukaan

Gunakan nilai berikut sebagai starting point; finalisasi setelah specimen dan tes kontras.

| Peran       | Nilai awal |
| ----------- | ---------- |
| Tinta       | `#0D0D0D`  |
| Panel gelap | `#17171A`  |
| Paper cream | `#F3EFE4`  |
| Magenta     | `#FF2E88`  |
| Cyan        | `#00B8F0`  |
| Kuning      | `#FFE031`  |

- [x] Pisahkan warna material tetap dari semantic color yang berubah menurut theme.
- [x] Pastikan paper cream tetap krem pada Board dark theme.
- [x] Tetapkan pasangan foreground bagi magenta, cyan, kuning, tinta, dan paper.
- [x] Pisahkan brand accent dari arti success, warning, error, dan info.
- [x] Sediakan pasangan aksen editorial yang terbaca pada paper dan ink surface, lalu cek kontras di dua theme. Bukti: token `*-readable`, tes contrast, dan axe catalog lulus.
- [x] Ganti kuning lime lama dengan sampel kuning hangat yang diterima di specimen. Bukti: `docs/design/assets/brand-contact-sheet-current.png`.
- [ ] Migrasikan consumer alias warna lama ke token semantic.
- [ ] Hapus alias yang tidak lagi dipakai.
- [ ] Hindari literal warna baru di CSS halaman aplikasi.
- [ ] Pertahankan preferensi theme Board yang sudah digunakan.
- [ ] Gunakan art direction gelap untuk homepage publik.
- [ ] Tambahkan token gap, padding, tebal frame, content inset, dan rotasi dekoratif.
- [ ] Batasi rotasi pada note/tape/artwork, bukan tabel dan form.
- [ ] Pastikan tekstur berada di lapisan dekorasi dan tidak menutupi konten.
- [ ] Pastikan torn frame tidak memotong focus ring.

### Typography

Gunakan Road Rage sebagai brush display, Anton untuk judul condensed dan KPI, Space Grotesk untuk UI/body, dan JetBrains Mono untuk metadata teknis. Road Rage berlisensi SIL OFL; sertakan lisensi dan provenance di assets.

- [x] Tambahkan Road Rage lokal ke `@moonwitness/assets`.
- [x] Simpan upstream URL, lisensi, subset, dan hash font.
- [x] Tambahkan token brush display di UI package.
- [x] Pertahankan token condensed untuk KPI dan label panel.
- [x] Pertahankan font body yang terbaca untuk paragraph, form, dan tabel.
- [x] Gunakan monospace hanya untuk metadata/code/time yang sesuai.
- [x] Hindari synthetic bold untuk face yang hanya memiliki satu weight.
- [x] Tetapkan skala hero, masthead, section title, label, body, dan metadata.
- [x] Batasi lettering brush pada logo, judul pendek, dan CTA pendek.
- [ ] Uji teks bahasa Indonesia, angka, tanda baca, kata panjang, dan wrapping.
- [ ] Uji fallback font dan cegah layout shift.
- [ ] Muat font hanya pada route yang membutuhkannya.
- [ ] Preload hanya face yang dipakai pada viewport pertama.

**Syarat selesai:** token dan font bekerja di specimen Home, panel data, form, dan halaman Board.

## E. Brand vector, icon, dan ornamen

### Crown + wordmark

- [x] Buat master crown dengan tiga puncak asimetris dan bentuk tegas.
- [x] Pastikan crown tetap terbaca pada ukuran kecil. Bukti visual 16/24/32 px: `docs/design/assets/brand-identity-contact-sheet.png`.
- [x] Buat wordmark `MOONWITNESS` manual sebagai vector paths. Bukti visual semua varian dan ejaan yang dikoreksi: `docs/design/assets/brand-contact-sheet-current.png`.
- [x] Pastikan tulisan brand tampil sebagai `MoonWitness`/`MOONWITNESS` di Home dan shell Board. Bukti visual homepage `test-results/visual-audit/home-reference-1672.png`, workbench `test-results/playwright-visual/visual-audit-story-workben-c7f43-y-readable-across-viewports-chromium/workbench-desktop-1440-actual.png`, dan daftar Board `test-results/playwright-visual/visual-audit-responsive-pr-de65b-n-accessible-in-both-themes-chromium/board-list-desktop-1440-light-actual.png`; assertion ejaan/responsive di `apps/board/e2e/visual-audit.spec.ts`.
- [x] Bentuk ujung huruf tajam dengan distress tinta terkendali. Bukti: `docs/design/assets/brand-contact-sheet-current.png`.
- [x] Simpan source master editable dan output generated. Bukti: `packages/assets/brand/source/moonwitness-master.svg`.
- [x] Buat lockup horizontal crown + wordmark. Bukti: `docs/design/assets/brand-identity-contact-sheet.png`.
- [x] Buat lockup compact untuk sidebar Board. Bukti: `docs/design/assets/brand-identity-contact-sheet.png`.
- [x] Buat symbol crown tanpa wordmark. Bukti: `docs/design/assets/brand-identity-contact-sheet.png`.
- [x] Buat varian paper, ink, mono, magenta, cyan, dan kuning yang diperlukan. Varian theme/mono terlihat di contact sheet; aksen semantik ada di master/tokens.
- [x] Buat favicon dengan detail crown yang disederhanakan. Bukti 16/24/32 px: `docs/design/assets/brand-identity-contact-sheet.png`.
- [x] Generate favicon/app icon/social card dari master canonical. Bukti app icon 192 px: `packages/assets/brand/app-icon-192.png`; docs raster hash cocok dengan package.
- [x] Uji crown di 16, 24, 32, dan 48 px. Bukti ukuran: `docs/design/assets/brand-identity-contact-sheet.png`.
- [x] Uji wordmark di header desktop, header mobile, dan masthead. Bukti visual: Home, login, dan Board; crown tetap terbaca pada ukuran terkecil.
- [x] Tetapkan clear space dan ukuran minimum. Bukti: aturan penggunaan di `packages/ui/README.md` dan master/contact sheet brand.
- [x] Migrasikan Home, Board, login/register, favicon, social card, dan docs. Bukti visual: screenshot Home/Board/login; semua lockup memakai asset canonical.
- [ ] Hapus crescent lama setelah seluruh consumer berpindah.
- [ ] Bedakan bentuk crown logo dari crown doodle dekoratif.

### Ikon interaksi

- [ ] Inventaris semua icon yang digunakan Home, Board, dan auth.
- [ ] Satukan nama semantic yang memiliki arti aksi sama.
- [ ] Pertahankan grid canonical `24×24` dengan bobot tegas yang konsisten.
- [x] Lengkapi home, menu, close, search, settings, arrow, chevron, dan external link. Bukti visual 16–32 px: `docs/design/assets/icon-contact-sheet-current.png`.
- [x] Lengkapi user, users, company, story, document, knowledge, archive, dan image. Bukti: `docs/design/assets/icon-contact-sheet-current.png`.
- [x] Lengkapi play, pause, sound, mute, bell, save, edit, plus, dan trash. Bukti: `docs/design/assets/icon-contact-sheet-current.png`.
- [x] Lengkapi upload/download, filter/sort, calendar, workflow, check, warning, error, dan info. Bukti: `docs/design/assets/icon-contact-sheet-current.png`.
- [ ] Uji versi stroke/filled dan ukuran optiknya.
- [ ] Uji icon pada 16, 20, 24, dan 32 px, termasuk focus dan disabled.
- [x] Generate React wrappers typed dari sumber SVG canonical. Bukti: `pnpm test:ui` lulus; 50 ikon typed terbangun dari inventory.
- [ ] Migrasikan pemakaian icon library langsung di app ke canonical public UI icons.
- [ ] Hapus duplikasi setelah consumer bermigrasi.

### Material dan decorative vector

- [ ] Buat torn edge atas dan bawah.
- [ ] Buat torn edge kiri dan kanan.
- [ ] Buat empat corner yang bisa menyambung tanpa celah.
- [ ] Buat brush strip pendek untuk CTA dan panjang untuk ribbon.
- [ ] Buat paper note, tape strip, folded corner, dan stamp outline.
- [ ] Buat ink splatter kecil dan sedang.
- [ ] Buat tile halftone, speckle, scratch, dan scuffed border.
- [ ] Buat star scribble, lightning bolt, smiley, dan hand-drawn arrow.
- [ ] Buat underline, cross-out, orbit, globe grid, moon phases, dan eye/target motif.
- [ ] Pindahkan path doodle lokal ke asset canonical.
- [ ] Pastikan ornamen `aria-hidden`, tidak focusable, dan tidak menerima pointer.
- [ ] Gunakan koordinat deterministik untuk menjaga screenshot stabil.
- [ ] Buat contact sheet untuk review logo, icon, dan material.

**Syarat selesai:** logo/icon adalah vector asli; artwork manga kompleks tidak dipaksa menjadi SVG besar.

## F. Artwork dan ilustrasi

### Paket Home

- [x] Buat hero manga panorama: kota malam, bulan besar, karakter foreground. Bukti: `docs/design/assets/artwork-contact-sheet-current.png`.
- [x] Sisakan ruang copy di sisi kiri hero. Bukti crop desktop: `docs/design/assets/artwork-contact-sheet-current.png`.
- [ ] Tentukan posisi wajah, bulan, skyline, headline, dan CTA.
- [x] Buat crop mobile khusus agar wajah dan bulan tidak terpotong. Bukti: `docs/design/assets/artwork-contact-sheet-current.png`.
- [x] Buat artwork lorong merah untuk kartu editorial pertama. Bukti visual: `docs/design/assets/artwork-contact-sheet-current.png`.
- [x] Buat rooftop cyan untuk kartu kedua. Bukti visual: `docs/design/assets/artwork-contact-sheet-current.png`.
- [x] Buat figur shadow monokrom untuk kartu ketiga. Bukti visual: `docs/design/assets/artwork-contact-sheet-current.png`.
- [ ] Buat empat thumbnail ilustratif untuk filmstrip “cara kerja”.
- [ ] Buat artwork CTA bawah yang sesuai palet dan gaya hero.

### Paket Board dan katalog

- [x] Buat panorama masthead Board dengan karakter/kota/musik. Bukti: `docs/design/assets/artwork-contact-sheet-current.png`.
- [x] Buat panorama khusus Story workbench dengan ruang copy kiri dan fokus karakter/bulan di kanan. Bukti: `packages/assets/illustrations/story-workbench-masthead.webp`; preview: `test-results/visual-audit/workbench-desktop-1440.png`.
- [x] Daftarkan master, turunan, dimensi, dan provenance masthead workbench melalui pipeline artwork. Bukti: `packages/assets/manifest.json`, `packages/assets/licenses.json`, dan `packages/assets/scripts/prepare-artwork.mjs`.
- [ ] Buat potongan bulan dan skyline yang dapat digunakan ulang.
- [ ] Buat peta/orbit dekoratif tanpa data lokasi/statistik.
- [ ] Buat cover story, poster, dan portrait fiktif untuk UI Catalog saja.
- [ ] Beri label jelas “contoh desain” untuk seluruh fixture fiktif.
- [ ] Jangan memasukkan portrait fiktif sebagai anggota pengguna nyata.

### Mutu dan delivery

- [x] Buat artwork tanpa text, angka, tanggal, label, tombol, atau CTA tertanam. Bukti visual: `docs/design/assets/artwork-contact-sheet-current.png`.
- [x] Periksa artefak tulisan, wajah, tangan, anatomi, dan perspektif. Bukti visual: `docs/design/assets/artwork-contact-sheet-current.png`; tidak ada tipografi semu tertanam.
- [ ] Samakan palet, lighting, halftone, dan kualitas garis antar-artwork.
- [x] Simpan master berkualitas tinggi; optimalkan turunan WebP. Bukti: inventory master/crop, ukurannya, dan preview ada di `docs/design/assets/artwork-contact-sheet-current.png`.
- [ ] Catat focal point, dimensi, format, alt text, dan provenance di inventory.
- [ ] Tandai aset dekoratif agar screen reader mengabaikannya.
- [ ] Gunakan priority untuk hero saja.
- [ ] Lazy-load artwork di bawah fold dan artwork Board pada route Board saja.
- [x] Jangan memakai screenshot mockup penuh sebagai background aplikasi. Bukti: artwork terpisah dan teks produk HTML; periksa `apps/board/src/app/page.tsx`.

**Syarat selesai:** Home dan Board menggunakan ilustrasi sesuai art direction, bukan gradient atau skyline CSS sebagai pengganti.

## G. Perluasan komponen shared

Perluas komponen yang sudah ada; jangan membuat duplicate `MangaButton`/`MangaPanel`.

### API UI yang dituju

| API             | Perubahan terencana                                                         |
| --------------- | --------------------------------------------------------------------------- |
| `Button`        | Tambah `treatment="solid\|brush"`; pertahankan `variant`, `size`, `asChild` |
| `Panel`         | Tambah pilihan surface, frame `line\|torn`, density, dan heading level      |
| `Table`         | Tambah density compact/comfortable; pertahankan native table semantics      |
| `PageHeader`    | Tambah brush treatment dan pilihan heading level                            |
| `SectionRibbon` | Judul section, nomor opsional, accent, slot action                          |
| `PaperNote`     | Note/sticker presentasional; isi tetap teks HTML                            |
| `ArtworkFrame`  | Frame artwork landscape, portrait, dan square                               |
| `MetricTile`    | Label, value, icon, keterangan; kalkulasi tetap di app                      |
| Effects         | Motif canonical bernama, dekorasi konsisten dan dapat disetel               |
| Audio           | Pertahankan `SoundProvider`, `useSfx`, dan `SoundToggle` yang ada           |

Accent `magenta`, `cyan`, dan `yellow` bersifat dekoratif; accent tidak mengubah arti error/success.

- [x] Sertakan source dan output UI package pada pemindaian Tailwind consumer agar style Sheet/Dialog shared tersedia. Bukti: `apps/board/src/index.css` dan `apps/ui-catalog/src/styles.css`; E2E memeriksa posisi Sheet dan overlay.

### Primitive dan composition

- [x] Terapkan treatment brush ke Button tanpa mengubah perilaku tombol.
- [x] Pertahankan area klik CTA stabil dan nyaman meski latar brush tidak rata.
- [ ] Pertahankan `asChild` untuk Next Link dan perilaku disabled yang benar.
- [ ] Retheme Input, Textarea, Select, SelectField, Checkbox, Switch, Badge, Avatar, dan Label.
- [ ] Pertahankan validation, controlled value, caret, file input, dan textarea whitespace.
- [ ] Pertahankan checkbox indeterminate dan select empty value.
- [x] Tambahkan torn/ink/paper surface ke Panel yang ada.
- [x] Tambahkan density compact tanpa mengubah default consumer lama.
- [x] Buat SectionRibbon dengan judul, nomor opsional, dan action.
- [x] Buat SectionRibbon memilih warna nomor menurut material paper/ink agar kontras tetap benar. Bukti: prop `surface`, token contrast tests, dan UI Catalog Axe.
- [x] Buat PaperNote dengan teks yang selectable dan bukan gambar teks.
- [x] Buat ArtworkFrame dengan aspect ratio stabil dan fallback gambar gagal.
- [x] Buat MetricTile yang tidak menghitung data produk.
- [ ] Bedakan zero, loading, no data, dan request error.
- [ ] Tambahkan heading level opsional agar outline halaman tetap benar.
- [ ] Retheme Toolbar, Pagination, Table, EmptyState, dan Skeleton.
- [ ] Pertahankan sorting keyboard, select-all, pagination, dan overflow region.
- [ ] Retheme Dialog, Sheet, Popover, Dropdown, Command, Tooltip, Tabs, dan Toast.
- [ ] Periksa stacking layer, Escape, focus trap, dan pengembalian fokus.
- [ ] Gunakan effects yang sama di Home dan Board; hapus salinan app-local.
- [ ] Pastikan decorative effects tidak menerima pointer/fokus.

### Matriks komponen

- [ ] Tampilkan default, hover, active, focus-visible, dan disabled.
- [ ] Tampilkan loading/error/selected bila state itu berlaku.
- [ ] Tampilkan teks pendek dan panjang.
- [ ] Tampilkan light dan dark theme.
- [ ] Tampilkan desktop dan mobile.
- [ ] Periksa reduced motion.
- [ ] Dokumentasikan public props dan contoh import.

**Syarat selesai:** halaman dapat memakai public UI components tanpa menyalin CSS kontrol berulang.

## H. UI Catalog dan visual proof

- [x] Tambahkan section catalog Brand dengan lockup dan crown canonical. Bukti visual: `docs/design/ui-catalog/editorial-proof-desktop.png` dan `editorial-proof-mobile.png`.
- [x] Tambahkan section Typography. Bukti: specimen brush, condensed, sans, dan mono pada catalog.
- [x] Tambahkan section Materials dan Effects. Bukti: torn Panel, PaperNote, serta halftone dari token shared.
- [ ] Tambahkan contact sheet Icon/Decoration.
- [x] Tambahkan specimen Editorial.
- [x] Tambahkan specimen Board Dashboard dengan shell, masthead, KPI, planned activity, dan recent activity. Bukti visual desktop/mobile: `docs/design/ui-catalog/board-proof-desktop.png` dan `board-proof-mobile.png`.
- [ ] Tambahkan specimen Story Workbench.
- [x] Ganti brand lokal buatan katalog dengan asset canonical; tidak ada monogram teks buatan lokal. Bukti: sidebar menggunakan crown SVG canonical.
- [x] Buat hero proof berdasarkan gambar 2 dengan artwork canonical, headline HTML, PaperNote, CTA shared, dan crop mobile yang ditinjau visual. Bukti desktop/mobile: `docs/design/ui-catalog/editorial-proof-desktop.png` dan `editorial-proof-mobile.png`.
- [x] Buat dashboard proof berdasarkan gambar 4 menggunakan masthead serta komponen canonical/shared. Bukti visual desktop/mobile: `docs/design/ui-catalog/board-proof-desktop.png` dan `board-proof-mobile.png`.
- [x] Buat workbench proof berdasarkan gambar 3 menggunakan halaman produksi dan data fixture internal yang deterministik. Bukti: baseline populated desktop/mobile pada `apps/board/e2e/visual-audit.spec.ts-snapshots/`.
- [ ] Masukkan detail sticker/orbit dari gambar 1.
- [x] Gunakan komponen shared yang sama dengan halaman produksi pada hero proof (Button dan PaperNote); artwork dan lockup diambil dari `@moonwitness/assets`.
- [x] Gunakan data fixture deterministik berlabel “contoh desain”; semua angka dan aktivitas pada dashboard proof menyebut sample data dan bukan data produksi.
- [x] Pertahankan pemeriksaan layout/token katalog yang sudah ada; kontrak layout katalog dan pemeriksaan theme tetap lulus.
- [ ] Tambahkan screenshot visual regression untuk specimen utama.
- [x] Bandingkan specimen dengan referensi pada `1672×941`; review juga komposisi mobile `390×844`. Bukti: screenshot UI Catalog desktop/mobile.
- [x] Periksa silhouette, proporsi artwork, lettering, material, density, dan detail kecil pada dashboard proof. Bukti visual: `docs/design/ui-catalog/board-proof-desktop.png` dan `board-proof-mobile.png`.
- [ ] Perbaiki gap utama sebelum merombak semua route.
- [ ] Simpan screenshot specimen yang diterima sebagai baseline regression.

**Syarat selesai:** ketiga proof memiliki artwork, komposisi, material, dan hirarki typography yang mengarah jelas ke referensi.

## I. Homepage `/` berdasarkan gambar 2

Urutan: header → hero manga → tiga panel editorial → band koneksi → filmstrip → CTA/footer. Pada viewport referensi, gunakan kisaran awal header 64 px, hero 340 px, dan triptych 216 px; konten boleh bertambah tinggi agar terbaca.

### Header dan hero

- [x] Ganti lockup menjadi crown + brush wordmark. Bukti screenshot desktop/mobile: `docs/design/ui-catalog/homepage-filmstrip-desktop-1672.png`, `homepage-filmstrip-mobile-390.png`; ejaan visual terbaca `MOONWITNESS`.
- [x] Terapkan masthead gelap, garis/tepi tinta, dan underline active. Bukti visual/ejaan desktop dan menu mobile: `docs/design/ui-catalog/homepage-nav-desktop-1672.png` dan `homepage-nav-mobile-menu-390x844.png`.
- [x] Gunakan navigasi ke section yang benar-benar ada. Link Home, People, Knowledge, Stories, dan About memiliki target nyata; status aktif berubah saat scroll. Bukti: `apps/board/e2e/public-home.spec.ts` dan `docs/design/ui-catalog/homepage-nav-desktop-1672.png`.
- [x] Gunakan shared Button untuk CTA login. Bukti: CTA `Enter the board` memakai `Button` + Next `Link` di `apps/board/src/app/page.tsx`.
- [x] Tampilkan SoundToggle dengan label yang jelas. Bukti visual `homepage-filmstrip-desktop-1672.png`; accessible name diperiksa pada homepage.
- [x] Tampilkan search/language hanya jika kontrol punya aksi nyata. Home tidak menampilkan kontrol search atau language yang belum berfungsi.
- [x] Jadikan navigasi mobile sebagai menu accessible dari Sheet shared. Bukti visual ejaan dan isi menu: `docs/design/ui-catalog/homepage-mobile-menu-390.png`; keyboard open/close, focus trap, return focus, tautan section, posisi panel/overlay, dan CTA ke login diuji di `apps/board/e2e/public-home.spec.ts`.
- [x] Ganti hero geometris dua kolom dengan panorama collage. Bukti: `docs/design/ui-catalog/homepage-filmstrip-desktop-1672.png`.
- [x] Letakkan karakter besar di tengah/kanan dan beri negative space untuk copy. Bukti: screenshot desktop dan mobile di UI Catalog.
- [x] Render headline dan copy sebagai HTML yang dapat diakses/searchable. Bukti: h1 `MOONWITNESS` terdeteksi pada Playwright dan terbaca di screenshot.
- [x] Tambahkan ribbon kuning di bawah headline. Bukti: screenshot desktop/mobile homepage.
- [x] Tempatkan deskripsi di blok tinta dengan kontras cukup. Bukti: screenshot dan axe homepage tanpa pelanggaran.
- [x] Tambahkan satu CTA utama dan action sekunder bila perlu. Bukti: CTA register utama dan login sekunder di screenshot homepage.
- [x] Tambahkan note, sticker, crown/star/orbit pada area dekoratif. Bukti: paper note dan brand mark pada screenshot.
- [x] Pastikan artwork tidak menutupi teks, fokus, atau CTA. Bukti: screenshot desktop/mobile serta axe homepage.
- [ ] Sediakan fallback saat hero gagal dimuat.
- [x] Prioritaskan pemuatan hero saja. Hero memakai `fetchPriority="high"`; lockup header eager-load tanpa priority.

### Panel, band, filmstrip, dan footer

- [x] Buat panel People/Records dengan artwork pertama. Bukti: screenshot desktop/mobile homepage.
- [x] Buat panel Knowledge dengan artwork kedua. Bukti: screenshot desktop/mobile homepage.
- [x] Buat panel Stories berdasarkan capability internal yang tersedia. Copy menjelaskan Story Workbench yang ada; bukti screenshot homepage.
- [x] Tambahkan ribbon, eyebrow, heading, caption, arrow, dan CTA tiap panel. Bukti: triptych pada screenshot desktop/mobile.
- [x] Gunakan body font yang terbaca untuk deskripsi panel. Bukti visual di screenshot; teks body memakai font UI.
- [ ] Buat band orbit/map sebagai motif hubungan konseptual.
- [ ] Jangan tampilkan jumlah crew, negara, atau signal tanpa data.
- [x] Buat filmstrip sebagai urutan cara kerja, bukan arsip/timeline fiktif. Bukti: `docs/design/ui-catalog/homepage-filmstrip-desktop-1672.png`.
- [x] Gunakan thumbnail dekoratif dan caption penjelasan yang jujur. Bukti: empat tahap CONNECT/UNDERSTAND/SHAPE/REVIEW di screenshot desktop dan mobile.
- [ ] Buat pita CTA bawah dengan link login/register yang berfungsi.
- [ ] Jangan menambahkan video play/durasi tanpa media.
- [ ] Jangan menambahkan newsletter form tanpa backend pengiriman.
- [ ] Pertahankan metadata, canonical URL, dan social card.

### Mobile

- [x] Gunakan hero crop khusus mobile. Bukti: `docs/design/ui-catalog/homepage-filmstrip-mobile-390.png`.
- [x] Susun panel menjadi satu kolom dengan ukuran tap cukup. Bukti: screenshot mobile homepage.
- [x] Gunakan satu CTA utama yang menonjol. Bukti: screenshot mobile homepage.
- [x] Kurangi ornament density tanpa menghilangkan identitas. Bukti: screenshot mobile homepage.
- [x] Pastikan wordmark dan headline tidak terpotong; ejaan visual tepat `MOONWITNESS`. Bukti: screenshot mobile homepage.
- [x] Pastikan filmstrip bisa digeser dengan akses keyboard bila overflow. Bukti: keyboard smoke ArrowRight/Home, serta screenshot kartu terakhir `docs/design/ui-catalog/homepage-filmstrip-mobile-end-390.png`.
- [x] Pastikan tidak ada horizontal page overflow. Bukti: browser smoke pada 1672 px dan 390 px.

**Syarat selesai:** komposisi, artwork, lettering, material, dan detail Homepage mendekati gambar 2 dengan isi produk yang benar.

## J. Shell dan dashboard `/board` berdasarkan gambar 4

### Shell

- [ ] Buat sidebar dark editorial, lebar desktop awal sekitar 208 px.
- [ ] Pasang compact crown lockup.
- [ ] Gunakan active magenta strip dan icon canonical.
- [ ] Pertahankan menu model dinamis serta permission.
- [ ] Pertahankan company scope.
- [ ] Gunakan sheet sidebar pada viewport di bawah 1024 px.
- [ ] Rapikan masthead Board dengan artwork panorama yang lebih pendek dari hero Home.
- [ ] Atur search, company, notification, theme, sound, dan user menu dengan hierarki jelas.
- [ ] Pastikan dropdown, tooltip, dan sheet tampil di atas frame dekoratif.

### KPI dan panel dashboard

- [x] Gunakan MetricTile untuk Partners, Active Users, Companies, dan Planned Activities. Bukti visual: `test-results/visual-audit/dashboard-desktop-1440-dark.png`.
- [x] Gunakan angka condensed, icon canonical, caption, dan torn frame. Bukti: `@moonwitness/ui` MetricTile dan screenshot dashboard admin.
- [ ] Jangan mengarang tren persen tanpa data historis.
- [ ] Tampilkan skeleton hanya saat request berjalan.
- [ ] Tampilkan error dan retry berdasarkan request nyata.
- [ ] Susun desktop dengan grid 12 kolom dan ukuran panel asimetris.
- [ ] Gunakan shortcuts, activity, dan status yang tersedia.
- [ ] Tampilkan audit/job/outbox/cron hanya untuk role yang berhak.
- [ ] Pertahankan aksi retry, cancel, dan triage existing.
- [ ] Style chart existing tanpa menambah grafik palsu.
- [ ] Ganti elemen klik nonsemantic menjadi Button atau Link.
- [ ] Pastikan panel tetap dapat dipahami jika satu query gagal.
- [x] Susun ulang menjadi dua kolom tablet dan satu kolom mobile. Bukti: audit screenshot responsif dashboard pada 375, 768, dan 1440 px.
- [x] Uji angka besar, label panjang, dan status padat. Bukti: E2E visual audit Board pass pada viewport mobile/tablet/desktop.

**Syarat selesai:** density dan hierarchy menyerupai dashboard gambar 4 tanpa metrik atau modul palsu.

## K. Workbench dan halaman pendukung

### Story workbench berdasarkan gambar 3

- [ ] Buat banner/toolbar dengan gaya SHADOW/command-center yang sesuai brand baru.
- [x] Tempatkan page navigator di rail kiri desktop. Bukti visual: `apps/board/e2e/visual-audit.spec.ts-snapshots/workbench-filled-desktop-1440-chromium-win32.png`.
- [ ] Pertahankan add/remove/reorder dan batas jumlah halaman existing.
- [x] Tempatkan editor dan preview pada area tengah yang sama; pastikan teks fixture muncul dengan ejaan benar di keduanya. Bukti: populated desktop/mobile screenshot.
- [x] Tempatkan revision, visibility, dan digest pada inspector kanan; gunakan hash SHA-256 deterministik yang terbaca realistis. Bukti: populated desktop screenshot dan fixture test.
- [x] Verifikasi urutan halaman berubah saat aksi Move Up/Move Down dan teks halaman yang dipilih tetap benar. Bukti: interaksi pada `apps/board/e2e/visual-audit.spec.ts`.
- [ ] Gunakan brush untuk judul pendek; isi dokumen tetap UI/body font.
- [ ] Pertahankan whitespace textarea dan preview dengan tepat.
- [ ] Tampilkan history revisi yang tersedia.
- [ ] Tampilkan historical revision dalam mode read-only.
- [ ] Tampilkan save state hanya saat request sebenarnya berjalan/selesai.
- [ ] Pertahankan draft jika request gagal.
- [ ] Pertahankan label INTERNAL/private.
- [ ] Jangan tampilkan autosaved tanpa autosave.
- [ ] Jangan tampilkan upload, publish, poster editor, asset library, atau export yang belum tersedia.
- [ ] Gunakan artwork dekoratif pada banner/frame tanpa mengklaimnya sebagai media story tersimpan.
- [x] Posisikan inspector setelah editor/preview di kolom kedua pada tablet. Bukti: populated workbench pada 1024×900; test memeriksa grid dua kolom, posisi inspector, overflow, dan aksesibilitas.
- [ ] Ubah navigator dan inspector menjadi sheet/accordion pada mobile.

### Route lain

- [ ] Terapkan wordmark, artwork, dan paper form ke login/register.
- [ ] Pertahankan validation, password visibility, submit, dan return path lokal.
- [ ] Terapkan shared Toolbar/Table/Panel ke model list dan detail.
- [ ] Pertahankan sorting keyboard, pagination, select-all, dan indeterminate.
- [ ] Pertahankan filter, relational control, file input, dan row propagation.
- [ ] Retheme import wizard, query builder, chatter, dan workflow panel.
- [ ] Retheme Knowledge sebagai research dossier dengan citation terbaca.
- [ ] Terapkan Field dan Form control shared pada profile/settings.
- [ ] Pertahankan theme, bahasa, timezone, contact, dan password flow.
- [ ] Retheme not-found, error, access-denied, empty, dan offline states.

**Syarat selesai:** route existing mengikuti sistem visual sama dan interaksi/permission tetap berfungsi.

## L. Motion, loading, special FX, dan SFX

### FX dan loading

- [ ] Gunakan texture statis untuk speckle, halftone, dan tinta.
- [ ] Gunakan motion singkat hanya untuk feedback yang membantu.
- [ ] Jadikan orbit dekoratif statis sebagai default.
- [ ] Hentikan animasi saat elemen tidak terlihat.
- [ ] Hindari parallax atau animasi berulang pada workbench.
- [ ] Hindari filter berat yang diterapkan ke setiap panel.
- [ ] Hormati `prefers-reduced-motion` pada CSS dan JS.
- [ ] Pertahankan status bermakna tanpa animasi.
- [ ] Gunakan skeleton hanya untuk request nyata dan bentuk konten yang dikenal.
- [ ] Gunakan progress berlabel untuk operasi aktif.
- [ ] Jangan mengarang persentase progress.
- [ ] Tampilkan teks dan visual untuk success/error/empty.
- [ ] Hentikan loading setelah request berakhir.

### Suara

- [x] Pertahankan katalog bernama `success`, `alert`, dan `signal`.
- [x] Gunakan default mute bila belum ada preferensi. Bukti: tes `packages/ui/tests/audio.test.mjs`.
- [x] Mainkan SFX hanya setelah pengguna memilih mengaktifkan audio. Playback juga menunggu interaksi pertama.
- [x] Simpan preferensi mute lokal. Bukti persistensi localStorage: `packages/ui/tests/audio.test.mjs`.
- [x] Tampilkan SoundToggle di Home dan Board. Bukti: `apps/board/src/app/page.tsx`, `apps/board/src/components/layout/app-shell.tsx`.
- [x] Lazy-load audio saat cue dipakai. `Audio` dibuat hanya ketika cue dipanggil dan preferensi/aktivasi mengizinkan; dites di `packages/ui/tests/audio.test.mjs`.
- [x] Jangan bunyikan hover, scroll, atau setiap klik biasa. Pemanggilan produk saat ini hanya pada hasil sukses autentikasi.
- [ ] Batasi overlap cue ketika event berdekatan.
- [ ] Tangani audio hilang/diblokir tanpa mengganggu aksi UI.
- [ ] Audit clipping, durasi, channel, dan volume berkas.
- [ ] Gunakan format terkompresi bila pengukuran membuktikan manfaat.
- [ ] Catat source/provenance/lisensi di manifest yang ada.
- [x] Pertahankan batas gabungan audio 50 KB saat ini. Tiga cue WAV berukuran 27 KB gabungan.

**Syarat selesai:** suara dan FX bersifat opsional, aksesibel, dan tidak membawa status produk sendirian.

## M. Gate, visual regression, dan penerimaan

Pertahankan satu command manual/otomatis: **`pnpm board:ui:check`**.

### Gate shared UI

- [ ] Pertahankan larangan raw JSX button/input/select/textarea.
- [ ] Pertahankan larangan internal `@moonwitness/ui/dist` import.
- [ ] Pastikan checker meliputi homepage dan semua Board source.
- [ ] Tambahkan larangan impor icon library langsung setelah migrasi canonical selesai.
- [ ] Tambahkan pemeriksaan inline decorative SVG baru di app setelah asset canonical tersedia.
- [x] Pastikan komentar, string, dan komponen bernama tidak false positive. Bukti: `pnpm board:ui:check` tes checker lulus.
- [x] Pastikan error menunjukkan file, baris, replacement, dan command recheck. Bukti: tes raw control checker dan error output.
- [ ] Gunakan checker yang sama pada pre-push dan quality CI.
- [ ] Tegaskan bahwa gate menguji struktur, bukan kemiripan visual.
- [ ] Jadikan quality CI required check pada merge policy bila tersedia.

### UI, asset, dan accessibility

- [x] Uji pasangan warna dan focus contrast. Bukti: `pnpm test:ui` dan visual audit Axe lulus.
- [x] Uji keyboard-only dan accessible names. Bukti: `pnpm test:ui` dan `pnpm test:e2e:visual` lulus.
- [ ] Uji Dialog/Sheet focus trap, Escape, dan return focus.
- [ ] Uji Button as Link dan disabled behavior.
- [ ] Uji controlled/disabled/error/loading states.
- [ ] Uji Table sort, selection, pagination, dan overflow.
- [ ] Uji canonical SVG dan generated React wrapper.
- [ ] Uji inventory, lisensi, package exports, dan generator deterministik.
- [ ] Uji mute persistence, lazy load, dan playback failure.
- [ ] Uji reduced-motion tanpa kehilangan informasi state.
- [ ] Uji zoom 200%, font fallback, dan image load failure.

### Visual regression dan responsive

- [ ] Pertahankan layout/token snapshot katalog yang sudah tersedia.
- [x] Tambahkan screenshot baseline untuk Home dan login. Bukti: baseline Home 390/1672 dan screenshot login dalam visual audit.
- [ ] Tambahkan screenshot baseline dashboard user/admin.
- [x] Tambahkan screenshot baseline workbench kosong dan populated desktop/mobile; ejaan brand/copy, pemuatan artwork, overflow, accessibility, dan hash contoh diperiksa secara visual. Bukti: baseline `workbench-desktop-1440`, `workbench-mobile-390`, `workbench-filled-desktop-1440`, dan `workbench-filled-mobile-390` di `apps/board/e2e/visual-audit.spec.ts-snapshots/`.
- [ ] Tambahkan specimen tabel, form, overlay, dan state utama.
- [ ] Gunakan data, waktu, font, dan dekorasi deterministik.
- [x] Review di `1672×941`, `1440×900`, `1024×900`, `768×1024`, `390×844`, dan `320×700`. Bukti: screenshot homepage desktop/mobile dan `docs/design/ui-catalog/homepage-mobile-320.png`; tidak ada page overflow.
- [ ] Review light/dark dan reduced motion.
- [ ] Pastikan body tidak overflow horizontal; tabel memakai scroll region berlabel.
- [ ] Bandingkan side-by-side dengan referensi dan catat gap.
- [ ] Gunakan screenshot regression untuk menjaga implementasi yang diterima.
- [ ] Jangan gunakan persentase otomatis sebagai ukuran kesamaan terhadap mockup AI.

### Produk dan performa

- [x] Uji homepage public, metadata, dan CTA. Bukti: `apps/board/e2e/public-home.spec.ts` lulus pada homepage smoke (4/4).
- [ ] Uji login, return path lokal, dan penolakan redirect eksternal.
- [ ] Uji route protection dan legacy redirect/query string.
- [ ] Uji model/detail deep links.
- [ ] Uji permission admin/user dan company scope.
- [ ] Uji penyimpanan, error, dan pembacaan revisi workbench.
- [ ] Uji aksi Board yang tersentuh migrasi visual.
- [ ] Smoke test runtime Docker dan asset response.
- [ ] Pertahankan budget JS/CSS existing tanpa menaikkannya untuk menyembunyikan regresi.
- [ ] Target hero desktop maksimal sekitar 500 KB.
- [ ] Target hero mobile maksimal sekitar 220 KB.
- [x] Jaga masthead Board dan Story workbench pada target sekitar 180 KB. Bukti: `packages/assets/illustrations/board-masthead.webp` 168 KB; `packages/assets/illustrations/story-workbench-masthead.webp` 177 KB.
- [ ] Target font viewport awal maksimal sekitar 160 KB.
- [ ] Ukur transfer cold load, lazy assets, dan layout shift melalui browser.
- [ ] Pastikan asset Board tidak terunduh di homepage.
- [ ] Ukur dampak torn SVG/filter pada banyak panel.

### Visual acceptance

| Aspek      | Bukti yang harus dilihat reviewer                               |
| ---------- | --------------------------------------------------------------- |
| Identitas  | Crown dan brush wordmark konsisten di Home, Board, dan auth     |
| Artwork    | Manga character, moon, cityscape, dan collage benar-benar hadir |
| Material   | Torn edge, ink, paper note, tape, dan halftone satu sistem      |
| Typography | Headline ekspresif; tabel/form tetap mudah dibaca               |
| Home       | Urutan dan dominasi visual mendekati gambar 2                   |
| Dashboard  | Sidebar, masthead, KPI, dan panel mendekati gambar 4            |
| Workbench  | Navigator, editor, inspector mendekati gambar 3                 |
| Detail     | Icon, ribbon, caption, arrow, badge, focus, dan state selesai   |
| Mobile     | Komposisi disusun ulang, bukan hanya diperkecil                 |
| Kejujuran  | Produksi tidak memuat fitur atau metrik mockup yang belum ada   |

- [ ] Jangan terima neon recolor, border lurus, atau skyline geometris sebagai hasil akhir.
- [ ] Jangan terima dekorasi yang menurunkan contrast atau menutupi kontrol.
- [ ] Perbaiki gap visual utama sebelum checklist dinyatakan lengkap.

## N. Cleanup dan Bible final

- [ ] Hapus CSS skyline homepage yang sudah tidak dipakai.
- [ ] Hapus CTA style lokal yang sudah dipindah ke Button shared.
- [ ] Hapus logo/icon path duplikat setelah migration.
- [ ] Hapus token alias tanpa consumer.
- [ ] Hapus efek lokal yang sudah diganti komponen UI.
- [ ] Hapus aset runtime tanpa consumer; pertahankan source master.
- [ ] Perbarui `packages/ui/README.md` dengan API dan contoh final.
- [ ] Perbarui `packages/ui/TOKENS.md` dengan nilai/kontras yang telah diuji.
- [ ] Perbarui dokumentasi asset dengan provenance dan lisensi final.
- [ ] Perbarui screenshot baseline setelah review diterima.
- [ ] Catat command pemeriksaan serta hasilnya pada ringkasan implementasi.
- [ ] Biarkan item checklist terbuka jika bukti penyelesaian belum ada.

## Urutan kerja

1. **A–C:** baseline, pemetaan fitur, UI Bible awal, dan keamanan generator.
2. **D–F:** token, brand/icon vector, dan artwork.
3. **G–H:** komponen shared dan tiga proof UI Catalog.
4. **I–K:** homepage, dashboard, workbench, dan halaman pendukung.
5. **L–N:** motion/audio, gate dan visual acceptance, cleanup, serta Bible final.

## Definisi selesai

Home, Board, workbench, dan halaman pendukung memakai artwork, brush lettering, crown, material, icon, token, komponen, dan detail interaksi dari sistem bersama. Komposisi sudah direview terhadap referensi desktop dan mobile; alur produk/data/permission tetap benar; pipeline aset tidak merusak inventory; serta bukti screenshot dan pemeriksaan terkait tersedia.
