# MoonWitness UI Visual Transformation — Todo

Checklist ini menjadi rencana kerja untuk mendekatkan Home, Board, dan workbench keempat mockup MoonWitness. Centang tugas setelah hasilnya dibuat dan kriteria tahap terkait diperiksa. Untuk pekerjaan visual, catat path screenshot atau specimen UI Catalog sebagai buktinya.

## Keputusan desain

- [x] Identitas utama baru memakai crown dan brush wordmark; crescent lama dimigrasikan.
- [x] Gambar 2 menjadi komposisi utama homepage.
- [x] Gambar 1 menjadi acuan detail kartu, sticker, orbit, moon phases, dan kolase homepage.
- [x] Gambar 4 menjadi acuan shell serta dashboard Board.
- [x] Gambar 3 menjadi acuan komposisi story workbench.
- [x] Mockup mengarahkan visual; tidak otomatis menambahkan fitur produk.
- [ ] Pertahankan satu app Next.js yang sudah ada; jangan menambah app atau package.
- [ ] Gunakan `@moonwitness/ui` untuk token, komponen, interaksi, efek, ikon React, dan audio.
- [ ] Gunakan `@moonwitness/assets` untuk master media, SVG canonical, artwork, font, suara, dan provenance.
- [ ] Gunakan UI Catalog yang sudah ada untuk specimen dan review visual.
- [ ] Pertahankan data, route, permission, dan alur produk yang tersedia.
- [ ] Tempatkan contoh konten/fitur fiktif hanya dalam UI Catalog dengan label “contoh desain”.

## Cara mengerjakan checklist

- [ ] Kerjakan tahap secara berurutan; generator aset harus aman sebelum aset baru ditambahkan.
- [ ] Selesaikan tiga specimen utama di UI Catalog sebelum merombak semua halaman produksi.
- [ ] Catat path screenshot/specimen di samping item visual yang sudah disetujui.
- [ ] Jangan mencentang hanya karena build, lint, atau gate JSX lolos.
- [ ] Anggap tugas visual selesai setelah side-by-side review pada viewport yang ditentukan.

## A. Baseline dan audit produk

### Screenshot dan inventaris

- [ ] Ambil screenshot homepage pada ukuran referensi `1672×941`.
- [ ] Ambil screenshot homepage desktop `1440×900`.
- [ ] Ambil screenshot homepage mobile `390×844`.
- [ ] Ambil screenshot Board untuk role pengguna biasa.
- [ ] Ambil screenshot Board untuk role admin.
- [ ] Ambil screenshot workbench dengan dokumen berisi.
- [ ] Ambil screenshot workbench saat kosong dan saat ada error.
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
- [ ] Petakan workbench ke navigator halaman, editor/preview, dan riwayat revisi.
- [ ] Tandai workbench sebagai internal dan pertahankan batas tanpa publishing/upload/export.
- [ ] Jangan menambahkan statistik crew, negara, reach, atau tren tanpa sumber data.
- [ ] Jangan menampilkan publishing pipeline, arsip publik, poster editor, atau peta live yang belum tersedia.
- [ ] Gunakan panel seperti itu hanya sebagai specimen katalog jika diperlukan.

## B. Perbarui UI Bible

UI Bible tunggal tetap `packages/ui/README.md`. `packages/ui/TOKENS.md` menjadi rincian token dan kontras. Checklist ini mencatat pekerjaan, bukan aturan desain baru yang menduplikasi Bible.

- [ ] Ganti aturan logo crescent/wordmark lama dengan crown + brush wordmark.
- [ ] Petakan gambar 1–4 dan jelaskan peran masing-masing.
- [ ] Tetapkan art direction: tinta gelap, paper cream, magenta, cyan, kuning, manga, dan kolase.
- [ ] Dokumentasikan penggunaan lockup logo, symbol, clear space, dan ukuran minimum.
- [ ] Dokumentasikan hierarki brush display, condensed, body, dan monospace.
- [ ] Tegaskan brush dipakai untuk logo dan judul pendek; body/data tetap terbaca.
- [ ] Bedakan ikon aksi canonical dari doodle dekoratif.
- [ ] Dokumentasikan torn edge, paper note, tape, speckle, halftone, dan ink frame.
- [ ] Tetapkan intensitas dekorasi: expressive untuk hero, balanced untuk editorial, restrained untuk data/form.
- [ ] Dokumentasikan lapisan komponen: foundation → primitive → composition → pattern/effect.
- [ ] Tegaskan UI package tidak memiliki route, auth, data, atau aturan domain.
- [ ] Dokumentasikan public import dan cara menambah komponen shared.
- [ ] Dokumentasikan aksesibilitas, fokus, kontras, responsive, dan reduced motion.
- [ ] Dokumentasikan loading, error, empty state, serta penggunaan SFX.
- [ ] Tambahkan contoh benar dan salah untuk brush type, texture, chart, data, serta focus ring.
- [ ] Tambahkan checklist review visual terhadap mockup.
- [ ] Tautkan `todo-ui.md` dari dokumen transformasi lama tanpa menyalin isi checklist.

**Syarat selesai:** Bible tidak lagi mengunci crescent lama dan mencakup aturan yang dibutuhkan implementer.

## C. Amankan asset inventory dan generator

- [ ] Petakan output yang dimiliki masing-masing generator saat ini.
- [ ] Ubah generator brand agar tidak menghapus entry milik generator lain.
- [ ] Ubah generator ilustrasi agar tidak menghapus aset manual/artwork baru.
- [ ] Pertahankan manifest dan daftar lisensi yang sudah ada; jangan membuat inventory/contract JSON duplikat.
- [ ] Catat source/master dan turunan SVG/raster/audio di inventory yang sama.
- [ ] Catat creator, proses pembuatan, upstream source, lisensi, ukuran, dimensi, dan format.
- [ ] Bedakan artwork original, berbantuan AI, font upstream, dan aset pihak ketiga.
- [ ] Validasi file tanpa entry inventory.
- [ ] Validasi entry inventory tanpa file.
- [ ] Ganti tes jumlah aset tetap dengan validasi aset wajib dan export public.
- [ ] Pastikan paket hasil build menyertakan fonts.css dan seluruh asset public.
- [ ] Pastikan master beresolusi besar tidak terkirim sebagai payload halaman.
- [ ] Pastikan perubahan asset masuk ke alur ekspor docs yang sudah ada.
- [ ] Jalankan regenerasi dua kali dan pastikan hasilnya deterministik.

### SVG canonical dan React wrappers

- [ ] Perbaiki generator icon agar menjaga atribut SVG root yang didukung.
- [ ] Jaga `fill`, `stroke`, `fillRule`, dan `clipRule` dari sumber canonical.
- [ ] Pertahankan transform grup atau ratakan sebelum generation.
- [ ] Beri error yang jelas untuk SVG yang strukturnya tidak didukung.
- [ ] Bandingkan render canonical SVG dengan React wrapper.
- [ ] Pastikan mask/clip ID aman saat SVG digunakan berulang.
- [ ] Pertahankan validasi SVG tanpa script, external reference, atau konten executable.
- [ ] Pastikan `viewBox` dan batas path mencegah bentuk terpotong.
- [ ] Pastikan semua public export mempunyai file dalam hasil paket.

**Syarat selesai:** generator tidak membuang aset baru dan output wrapper mempertahankan bentuk sumber.

## D. Token warna, material, dan typography

### Warna dan permukaan

Gunakan nilai berikut sebagai starting point; finalisasi setelah specimen dan tes kontras.

| Peran | Nilai awal |
|---|---|
| Tinta | `#0D0D0D` |
| Panel gelap | `#17171A` |
| Paper cream | `#F3EFE4` |
| Magenta | `#FF2E88` |
| Cyan | `#00B8F0` |
| Kuning | `#FFE031` |

- [ ] Pisahkan warna material tetap dari semantic color yang berubah menurut theme.
- [ ] Pastikan paper cream tetap krem pada Board dark theme.
- [ ] Tetapkan pasangan foreground bagi magenta, cyan, kuning, tinta, dan paper.
- [ ] Pisahkan brand accent dari arti success, warning, error, dan info.
- [ ] Ganti kuning lime lama dengan sampel kuning hangat yang diterima di specimen.
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

- [ ] Tambahkan Road Rage lokal ke `@moonwitness/assets`.
- [ ] Simpan upstream URL, lisensi, subset, dan hash font.
- [ ] Tambahkan token brush display di UI package.
- [ ] Pertahankan token condensed untuk KPI dan label panel.
- [ ] Pertahankan font body yang terbaca untuk paragraph, form, dan tabel.
- [ ] Gunakan monospace hanya untuk metadata/code/time yang sesuai.
- [ ] Hindari synthetic bold untuk face yang hanya memiliki satu weight.
- [ ] Tetapkan skala hero, masthead, section title, label, body, dan metadata.
- [ ] Batasi lettering brush pada logo, judul pendek, dan CTA pendek.
- [ ] Uji teks bahasa Indonesia, angka, tanda baca, kata panjang, dan wrapping.
- [ ] Uji fallback font dan cegah layout shift.
- [ ] Muat font hanya pada route yang membutuhkannya.
- [ ] Preload hanya face yang dipakai pada viewport pertama.

**Syarat selesai:** token dan font bekerja di specimen Home, panel data, form, dan halaman Board.

## E. Brand vector, icon, dan ornamen

### Crown + wordmark

- [ ] Buat master crown dengan tiga puncak asimetris dan bentuk tegas.
- [ ] Pastikan crown tetap terbaca pada ukuran kecil.
- [ ] Buat wordmark `MOONWITNESS` manual sebagai vector paths.
- [ ] Bentuk ujung huruf tajam dengan distress tinta terkendali.
- [ ] Simpan source master editable dan output generated.
- [ ] Buat lockup horizontal crown + wordmark.
- [ ] Buat lockup compact untuk sidebar Board.
- [ ] Buat symbol crown tanpa wordmark.
- [ ] Buat varian paper, ink, mono, magenta, cyan, dan kuning yang diperlukan.
- [ ] Buat favicon dengan detail crown yang disederhanakan.
- [ ] Generate favicon/app icon/social card dari master canonical.
- [ ] Uji crown di 16, 24, 32, dan 48 px.
- [ ] Uji wordmark di header desktop, header mobile, dan masthead.
- [ ] Tetapkan clear space dan ukuran minimum.
- [ ] Migrasikan Home, Board, login/register, favicon, social card, dan docs.
- [ ] Hapus crescent lama setelah seluruh consumer berpindah.
- [ ] Bedakan bentuk crown logo dari crown doodle dekoratif.

### Ikon interaksi

- [ ] Inventaris semua icon yang digunakan Home, Board, dan auth.
- [ ] Satukan nama semantic yang memiliki arti aksi sama.
- [ ] Pertahankan grid canonical `24×24` dengan bobot tegas yang konsisten.
- [ ] Lengkapi home, menu, close, search, settings, arrow, chevron, dan external link.
- [ ] Lengkapi user, users, company, story, document, knowledge, archive, dan image.
- [ ] Lengkapi play, pause, sound, mute, bell, save, edit, plus, dan trash.
- [ ] Lengkapi upload/download, filter/sort, calendar, workflow, check, warning, error, dan info.
- [ ] Uji versi stroke/filled dan ukuran optiknya.
- [ ] Uji icon pada 16, 20, 24, dan 32 px, termasuk focus dan disabled.
- [ ] Generate React wrappers typed dari sumber SVG canonical.
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

- [ ] Buat hero manga panorama: kota malam, bulan besar, karakter foreground.
- [ ] Sisakan ruang copy di sisi kiri hero.
- [ ] Tentukan posisi wajah, bulan, skyline, headline, dan CTA.
- [ ] Buat crop mobile khusus agar wajah dan bulan tidak terpotong.
- [ ] Buat artwork lorong merah untuk kartu editorial pertama.
- [ ] Buat rooftop cyan untuk kartu kedua.
- [ ] Buat figur shadow monokrom untuk kartu ketiga.
- [ ] Buat empat thumbnail ilustratif untuk filmstrip “cara kerja”.
- [ ] Buat artwork CTA bawah yang sesuai palet dan gaya hero.

### Paket Board dan katalog

- [ ] Buat panorama masthead Board dengan karakter/kota/musik.
- [ ] Buat potongan bulan dan skyline yang dapat digunakan ulang.
- [ ] Buat peta/orbit dekoratif tanpa data lokasi/statistik.
- [ ] Buat cover story, poster, dan portrait fiktif untuk UI Catalog saja.
- [ ] Beri label jelas “contoh desain” untuk seluruh fixture fiktif.
- [ ] Jangan memasukkan portrait fiktif sebagai anggota pengguna nyata.

### Mutu dan delivery

- [ ] Buat artwork tanpa text, angka, tanggal, label, tombol, atau CTA tertanam.
- [ ] Periksa artefak tulisan, wajah, tangan, anatomi, dan perspektif.
- [ ] Samakan palet, lighting, halftone, dan kualitas garis antar-artwork.
- [ ] Simpan master berkualitas tinggi; optimalkan turunan AVIF/WebP.
- [ ] Catat focal point, dimensi, format, alt text, dan provenance di inventory.
- [ ] Tandai aset dekoratif agar screen reader mengabaikannya.
- [ ] Gunakan priority untuk hero saja.
- [ ] Lazy-load artwork di bawah fold dan artwork Board pada route Board saja.
- [ ] Jangan memakai screenshot mockup penuh sebagai background aplikasi.

**Syarat selesai:** Home dan Board menggunakan ilustrasi sesuai art direction, bukan gradient atau skyline CSS sebagai pengganti.

## G. Perluasan komponen shared

Perluas komponen yang sudah ada; jangan membuat duplicate `MangaButton`/`MangaPanel`.

### API UI yang dituju

| API | Perubahan terencana |
|---|---|
| `Button` | Tambah `treatment="solid\|brush"`; pertahankan `variant`, `size`, `asChild` |
| `Panel` | Tambah pilihan surface, frame `line\|torn`, density, dan heading level |
| `Table` | Tambah density compact/comfortable; pertahankan native table semantics |
| `PageHeader` | Tambah brush treatment dan pilihan heading level |
| `SectionRibbon` | Judul section, nomor opsional, accent, slot action |
| `PaperNote` | Note/sticker presentasional; isi tetap teks HTML |
| `ArtworkFrame` | Frame artwork landscape, portrait, dan square |
| `MetricTile` | Label, value, icon, keterangan; kalkulasi tetap di app |
| Effects | Motif canonical bernama, dekorasi konsisten dan dapat disetel |
| Audio | Pertahankan `SoundProvider`, `useSfx`, dan `SoundToggle` yang ada |

Accent `magenta`, `cyan`, dan `yellow` bersifat dekoratif; accent tidak mengubah arti error/success.

### Primitive dan composition

- [ ] Terapkan treatment brush ke Button tanpa mengubah perilaku tombol.
- [ ] Pertahankan area klik CTA stabil dan nyaman meski latar brush tidak rata.
- [ ] Pertahankan `asChild` untuk Next Link dan perilaku disabled yang benar.
- [ ] Retheme Input, Textarea, Select, SelectField, Checkbox, Switch, Badge, Avatar, dan Label.
- [ ] Pertahankan validation, controlled value, caret, file input, dan textarea whitespace.
- [ ] Pertahankan checkbox indeterminate dan select empty value.
- [ ] Tambahkan torn/ink/paper surface ke Panel yang ada.
- [ ] Tambahkan density compact tanpa mengubah default consumer lama.
- [ ] Buat SectionRibbon dengan judul, nomor opsional, dan action.
- [ ] Buat PaperNote dengan teks yang selectable dan bukan gambar teks.
- [ ] Buat ArtworkFrame dengan aspect ratio stabil dan fallback gambar gagal.
- [ ] Buat MetricTile yang tidak menghitung data produk.
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

- [ ] Tambahkan section catalog Brand.
- [ ] Tambahkan section Typography.
- [ ] Tambahkan section Materials dan Effects.
- [ ] Tambahkan contact sheet Icon/Decoration.
- [ ] Tambahkan specimen Editorial.
- [ ] Tambahkan specimen Board Dashboard.
- [ ] Tambahkan specimen Story Workbench.
- [ ] Ganti brand lokal buatan katalog dengan asset canonical.
- [ ] Buat hero proof berdasarkan gambar 2.
- [ ] Buat dashboard proof berdasarkan gambar 4.
- [ ] Buat workbench proof berdasarkan gambar 3.
- [ ] Masukkan detail sticker/orbit dari gambar 1.
- [ ] Gunakan komponen shared yang sama dengan halaman produksi.
- [ ] Gunakan data fixture deterministik berlabel “contoh desain”.
- [ ] Pertahankan pemeriksaan layout/token katalog yang sudah ada.
- [ ] Tambahkan screenshot visual regression untuk specimen utama.
- [ ] Bandingkan specimen dengan referensi pada `1672×941`.
- [ ] Periksa silhouette, proporsi artwork, lettering, material, density, dan detail kecil.
- [ ] Perbaiki gap utama sebelum merombak semua route.
- [ ] Simpan screenshot specimen yang diterima sebagai baseline regression.

**Syarat selesai:** ketiga proof memiliki artwork, komposisi, material, dan hirarki typography yang mengarah jelas ke referensi.

## I. Homepage `/` berdasarkan gambar 2

Urutan: header → hero manga → tiga panel editorial → band koneksi → filmstrip → CTA/footer. Pada viewport referensi, gunakan kisaran awal header 64 px, hero 340 px, dan triptych 216 px; konten boleh bertambah tinggi agar terbaca.

### Header dan hero

- [ ] Ganti lockup menjadi crown + brush wordmark.
- [ ] Terapkan masthead gelap, garis/tepi tinta, dan underline active.
- [ ] Gunakan navigasi ke section yang benar-benar ada.
- [ ] Gunakan shared Button untuk CTA login.
- [ ] Tampilkan SoundToggle dengan label yang jelas.
- [ ] Tampilkan search/language hanya jika kontrol punya aksi nyata.
- [ ] Jadikan navigasi mobile sebagai menu accessible.
- [ ] Ganti hero geometris dua kolom dengan panorama collage.
- [ ] Letakkan karakter besar di tengah/kanan dan beri negative space untuk copy.
- [ ] Render headline dan copy sebagai HTML yang dapat diakses/searchable.
- [ ] Tambahkan ribbon kuning di bawah headline.
- [ ] Tempatkan deskripsi di blok tinta dengan kontras cukup.
- [ ] Tambahkan satu CTA utama dan action sekunder bila perlu.
- [ ] Tambahkan note, sticker, crown/star/orbit pada area dekoratif.
- [ ] Pastikan artwork tidak menutupi teks, fokus, atau CTA.
- [ ] Sediakan fallback saat hero gagal dimuat.
- [ ] Prioritaskan pemuatan hero saja.

### Panel, band, filmstrip, dan footer

- [ ] Buat panel People/Records dengan artwork pertama.
- [ ] Buat panel Knowledge dengan artwork kedua.
- [ ] Buat panel Stories berdasarkan capability internal yang tersedia.
- [ ] Tambahkan ribbon, eyebrow, heading, caption, arrow, dan CTA tiap panel.
- [ ] Gunakan body font yang terbaca untuk deskripsi panel.
- [ ] Buat band orbit/map sebagai motif hubungan konseptual.
- [ ] Jangan tampilkan jumlah crew, negara, atau signal tanpa data.
- [ ] Buat filmstrip sebagai urutan cara kerja, bukan arsip/timeline fiktif.
- [ ] Gunakan thumbnail dekoratif dan caption penjelasan yang jujur.
- [ ] Buat pita CTA bawah dengan link login/register yang berfungsi.
- [ ] Jangan menambahkan video play/durasi tanpa media.
- [ ] Jangan menambahkan newsletter form tanpa backend pengiriman.
- [ ] Pertahankan metadata, canonical URL, dan social card.

### Mobile

- [ ] Gunakan hero crop khusus mobile.
- [ ] Susun panel menjadi satu kolom dengan ukuran tap cukup.
- [ ] Gunakan satu CTA utama yang menonjol.
- [ ] Kurangi ornament density tanpa menghilangkan identitas.
- [ ] Pastikan wordmark dan headline tidak terpotong.
- [ ] Pastikan filmstrip bisa digeser dengan akses keyboard bila overflow.
- [ ] Pastikan tidak ada horizontal page overflow.

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

- [ ] Gunakan MetricTile untuk Partners, Active Users, Companies, dan Planned Activities.
- [ ] Gunakan angka condensed, icon canonical, caption, dan torn frame.
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
- [ ] Susun ulang menjadi dua kolom tablet dan satu kolom mobile.
- [ ] Uji angka besar, label panjang, dan status padat.

**Syarat selesai:** density dan hierarchy menyerupai dashboard gambar 4 tanpa metrik atau modul palsu.

## K. Workbench dan halaman pendukung

### Story workbench berdasarkan gambar 3

- [ ] Buat banner/toolbar dengan gaya SHADOW/command-center yang sesuai brand baru.
- [ ] Tempatkan page navigator di rail kiri desktop.
- [ ] Pertahankan add/remove/reorder dan batas jumlah halaman existing.
- [ ] Tempatkan editor atau preview pada area tengah yang sama.
- [ ] Tempatkan revision, visibility, dan digest pada inspector kanan.
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
- [ ] Lipat inspector di tablet.
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

- [ ] Pertahankan katalog bernama `success`, `alert`, dan `signal`.
- [ ] Gunakan default mute bila belum ada preferensi.
- [ ] Mainkan SFX hanya setelah pengguna memilih mengaktifkan audio.
- [ ] Simpan preferensi mute lokal.
- [ ] Tampilkan SoundToggle di Home dan Board.
- [ ] Lazy-load audio saat cue dipakai.
- [ ] Jangan bunyikan hover, scroll, atau setiap klik biasa.
- [ ] Batasi overlap cue ketika event berdekatan.
- [ ] Tangani audio hilang/diblokir tanpa mengganggu aksi UI.
- [ ] Audit clipping, durasi, channel, dan volume berkas.
- [ ] Gunakan format terkompresi bila pengukuran membuktikan manfaat.
- [ ] Catat source/provenance/lisensi di manifest yang ada.
- [ ] Pertahankan batas gabungan audio 50 KB saat ini.

**Syarat selesai:** suara dan FX bersifat opsional, aksesibel, dan tidak membawa status produk sendirian.

## M. Gate, visual regression, dan penerimaan

Pertahankan satu command manual/otomatis: **`pnpm board:ui:check`**.

### Gate shared UI

- [ ] Pertahankan larangan raw JSX button/input/select/textarea.
- [ ] Pertahankan larangan internal `@moonwitness/ui/dist` import.
- [ ] Pastikan checker meliputi homepage dan semua Board source.
- [ ] Tambahkan larangan impor icon library langsung setelah migrasi canonical selesai.
- [ ] Tambahkan pemeriksaan inline decorative SVG baru di app setelah asset canonical tersedia.
- [ ] Pastikan komentar, string, dan komponen bernama tidak false positive.
- [ ] Pastikan error menunjukkan file, baris, replacement, dan command recheck.
- [ ] Gunakan checker yang sama pada pre-push dan quality CI.
- [ ] Tegaskan bahwa gate menguji struktur, bukan kemiripan visual.
- [ ] Jadikan quality CI required check pada merge policy bila tersedia.

### UI, asset, dan accessibility

- [ ] Uji pasangan warna dan focus contrast.
- [ ] Uji keyboard-only dan accessible names.
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
- [ ] Tambahkan screenshot baseline untuk Home dan login.
- [ ] Tambahkan screenshot baseline dashboard user/admin.
- [ ] Tambahkan screenshot baseline workbench.
- [ ] Tambahkan specimen tabel, form, overlay, dan state utama.
- [ ] Gunakan data, waktu, font, dan dekorasi deterministik.
- [ ] Review di `1672×941`, `1440×900`, `768×1024`, `390×844`, dan 320 px.
- [ ] Review light/dark dan reduced motion.
- [ ] Pastikan body tidak overflow horizontal; tabel memakai scroll region berlabel.
- [ ] Bandingkan side-by-side dengan referensi dan catat gap.
- [ ] Gunakan screenshot regression untuk menjaga implementasi yang diterima.
- [ ] Jangan gunakan persentase otomatis sebagai ukuran kesamaan terhadap mockup AI.

### Produk dan performa

- [ ] Uji homepage public, metadata, dan CTA.
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
- [ ] Target Board masthead maksimal sekitar 180 KB.
- [ ] Target font viewport awal maksimal sekitar 160 KB.
- [ ] Ukur transfer cold load, lazy assets, dan layout shift melalui browser.
- [ ] Pastikan asset Board tidak terunduh di homepage.
- [ ] Ukur dampak torn SVG/filter pada banyak panel.

### Visual acceptance

| Aspek | Bukti yang harus dilihat reviewer |
|---|---|
| Identitas | Crown dan brush wordmark konsisten di Home, Board, dan auth |
| Artwork | Manga character, moon, cityscape, dan collage benar-benar hadir |
| Material | Torn edge, ink, paper note, tape, dan halftone satu sistem |
| Typography | Headline ekspresif; tabel/form tetap mudah dibaca |
| Home | Urutan dan dominasi visual mendekati gambar 2 |
| Dashboard | Sidebar, masthead, KPI, dan panel mendekati gambar 4 |
| Workbench | Navigator, editor, inspector mendekati gambar 3 |
| Detail | Icon, ribbon, caption, arrow, badge, focus, dan state selesai |
| Mobile | Komposisi disusun ulang, bukan hanya diperkecil |
| Kejujuran | Produksi tidak memuat fitur atau metrik mockup yang belum ada |

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
