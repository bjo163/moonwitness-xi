# Jalur rilis aktif

**Diperbarui: 2026-10-15.** Jalur rilis pertama adalah prioritas/dependensi di dalam tujuan penuh 148 kartu roadmap; ia tidak menggantikan penyelesaian `ROADMAP.md` dan `docs/roadmap/`. Pada `dev` SHA `8aa46cfb5ad6b1f7954bbab69f662e9479c25113`, checklist master mencatat 101/148 kartu selesai dan 47 masih terbuka (9 `in_progress`, 38 belum dimulai/menunggu dependensi). Kartu post-release tetap bagian goal dan harus dikerjakan setelah prasyaratnya tersedia. Catatan batch lama dipindahkan ke [arsip eksekusi](EXECUTION-HISTORY-2026-10-15.md); estimasi lama 8–13 hari tidak dipakai karena mencampur pekerjaan wajib dan pengulangan verifikasi. Percepatan hanya mengubah urutan/pengulangan, bukan scope maupun acceptance.

## Batas waktu dan aturan berhenti mengulang

Kesan pekerjaan tiga hari berulang datang dari dua sumber berbeda: sebagian catatan evidence historis memang mencatat refresh parity beberapa kali pada SHA baru, sedangkan quality/browser/integration/container CI adalah lane terpisah yang menguji kegagalan berbeda. Jangan mengulang lane kedua tanpa alasan; perbaiki temuan aktualnya.

- **Iterasi biasa:** satu test yang membuktikan perubahan, lint/typecheck package terdampak bila kode berubah, lalu review diff. Perubahan docs/generated cukup `pnpm docs:check:built` setelah artifact dibangun dan `pnpm test:roadmap` jika roadmap ikut berubah. Jangan jalankan `pnpm verify`, release-plan parity, seluruh suite, atau browser matrix untuk perubahan docs-only.
- **Generated docs:** bangun input sekali, jalankan `pnpm docs:generate`, kemudian gunakan `pnpm docs:check:built` dan bila perlu `pnpm docs:build:built`. Hindari pasangan `pnpm docs:generate` + `pnpm docs:build` yang masing-masing membangun semua package; gabungkan dalam satu `pnpm docs:build` hanya ketika perlu membuktikan seluruh Pages artifact.
- **Area aplikasi:** jalankan focused suite dan PostgreSQL/Chromium journey hanya bila kode API/ORM/Board/setup yang relevan berubah. Satu hasil tetap berlaku selama source dan input terkait identik.
- **Kandidat rilis:** seluruh required exact-SHA checks tetap berjalan satu kali, termasuk typecheck, lint, security, PostgreSQL, browser, container, artifact/provenance dan approval. Jangan melewati gate untuk mengejar waktu.
- **Batas refresh evidence:** jangan menjalankan release prepare/dry-run hanya untuk mengganti fingerprint dokumentasi. Refresh parity sekali setelah ada perubahan material pada release policy atau input versi/changelog, bukan di setiap batch.
- **Parallel CI:** jalankan pekerjaan lokal independen saat CI berlangsung. Job CI yang berbeda tetap tunggu sebagai evidence kandidat; jika gagal, ambil langkah gagal saja dan reproduksi lokal satu kali. Jangan mengulang seluruh workflow untuk satu kegagalan.

Pada 2026-10-15, hosted quality menemukan empat generated reference stale. Output di-refresh dan `pnpm docs:build` lulus; hasil docs check setelah build lulus, `pnpm test:roadmap` lulus 94/94, dan PostgreSQL canonical integration suite lulus 15/15 pada DB disposable yang kemudian dihapus. Commit perbaikan docs ada pada SHA `9cc1cfce82886a1738e2547e7416a59f1760b173`. Tidak perlu mengulang suite tersebut untuk perubahan dokumentasi lain kecuali source/input-nya berubah atau exact-SHA candidate mewajibkannya.

## Diagnosis dan aturan percepatan

Yang membuat pekerjaan terasa berulang adalah: acceptance per model meski memakai guard yang sama; menjalankan ulang seluruh suite setelah perubahan dokumentasi atau perubahan test terisolasi; menjalankan release-plan parity pada setiap batch; menunggu CI hosted sebelum mulai pekerjaan lokal independen; serta menghitung audit visual, audit platform, dan ekspansi addon sebagai prasyarat rilis.

Untuk setiap batch, jalankan hanya tes yang membuktikan perilaku yang berubah, typecheck/build dan lint pada paket terdampak, serta pemeriksaan roadmap/diff bila dokumen evidence berubah. Gunakan hasil sebelumnya hanya jika source SHA dan input terkait identik. Jalankan rangkaian wajib lengkap sekali pada kandidat rilis exact-SHA. CI mulai setelah push dan tidak menahan kerja lokal lain. Jangan menghapus typecheck, lint, tes keamanan, gate wajib, PostgreSQL acceptance, atau CODEOWNER approval.

`pnpm verify` sekarang menggunakan build hasil typecheck untuk suite unit/docs/architecture pada run yang sama. Pertahankan jalur tersebut; jangan menambahkan build ulang tanpa perubahan input atau runner baru. Jangan mengulang browser matrix lintas engine dan seluruh fixture otorisasi untuk kontrak yang sudah terbukti.

Tes kebijakan automation di CI dibagi menjadi empat suite matrix paralel (`workflow`, `release`, `roadmap`, `platform`). Semuanya wajib lulus ketika terpilih; selector hanya menjalankan automation untuk perubahan shared config/script, `ROADMAP.md`, serta `docs/roadmap/**`, bukan perubahan package atau dokumentasi biasa yang sudah memiliki lane terdampak. Perubahan dengan source tak terklasifikasi tetap memilih quality, dan kegagalan membaca diff/workspace memilih full scope. Pemisahan gate memungkinkan lifecycle issue memakai hasil semua lane teknis exact-SHA tanpa menunggu CODEOWNER. `ci-gate` tetap status wajib promosi dan tetap menegakkan approval sensitif. CI teknis untuk `dev` berjalan melalui PR `dev` → `main`; push `dev` tidak lagi mengulang suite yang sama. Lifecycle memilih hanya run PR same-repository dengan head `dev`, base `main`, dan SHA persis saat ini. Push `main`, security scans pada PR/push `main`/jadwal/manual, dan Pages preview tetap tersedia. Pastikan ruleset `dev` tidak mensyaratkan status check sebelum mempertahankan penghapusan trigger push CI `dev`; ruleset yang terbaca saat migrasi hanya mensyaratkan check pada `main`.

## Jalur utama menuju rilis pertama

| Urutan                  | Pekerjaan yang harus ditutup                                                                                                                                                                                     | Pemilik                     | Kriteria selesai                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Candidate source     | Pilih satu SHA `dev`; pastikan tree bersih, version/changelog plan konsisten, tidak ada perubahan aplikasi tertinggal.                                                                                           | Maintainer lokal            | Satu SHA kandidat tercatat; tidak ada bump/release pada batch dokumentasi atau bukti.                                                      |
| 2. Core dan akses       | Pertahankan setup programmatic dan seed `system`, `superadmin`, serta contoh partner; tinjau hanya keluarga guard yang berbeda: tenant/company parent, admin grant, append-only audit, dan attachment lifecycle. | API/auth                    | Tiap keluarga punya satu kasus positif dan satu penolakan persisted yang relevan; tidak ada duplikasi per-model untuk jalur sama.          |
| 3. PostgreSQL dan Board | Pakai PostgreSQL lokal yang sudah tersedia. Jalankan canonical integration suite dan satu Chromium happy-path alur utama pada kandidat yang berubah.                                                             | API/Board                   | Seeded user login, akses company-scoped, alur request/approval tersimpan, audit/event terbukti; disposable DB dibersihkan.                 |
| 4. Keamanan             | Tinjau ulang temuan secret historis, rotasi bila terpapar, tetapkan pemilik incident/privacy, dan verifikasi pemindaian exact-SHA.                                                                               | Security owner + repo admin | Tidak ada temuan kredensial tanpa disposition; scanner wajib pass. Bukti histori memerlukan owner/security access.                         |
| 5. Docs dan Pages       | Periksa quickstart install/seed/login/Board dan hasil publik terhadap SHA kandidat; pertahankan source scan.                                                                                                     | Docs maintainer             | Pengguna baru dapat mengikuti alur; tautan/output aman dan build-info sama dengan kandidat. Pages dipublikasi setelah promosi terlindungi. |
| 6. Release gates        | Jalankan workflow kandidat satu kali: typecheck, lint, required unit/integration/browser/security checks; validasi artifact, SBOM/provenance, digest, changelog dan retry.                                       | Release maintainer + CI     | Semua required checks lulus untuk exact SHA dan artifact sama; tidak ada deployment aplikasi.                                              |
| 7. Promosi dan trace    | Tunggu review CODEOWNER dan branch protection, promosi melalui PR, lalu verifikasi release/Pages/issue projection.                                                                                               | CODEOWNER/repo admin        | Tidak ada bypass; release status baru complete sesudah artifact ada dan trace SHA cocok.                                                   |

Langkah 2–6 boleh dikerjakan paralel selama tidak mengubah file bersama. Dalam checkout yang sama, satu penulis untuk roadmap, root manifest, lockfile, dan evidence yang sama. Hindari membuat agent bekerja pada file bersama.

## Blocker yang memang menunggu pihak luar

- **CODEOWNER/repository admin:** review PR promosi, aturan branch dan required checks. Dampak: `main` tidak dapat diperbarui.
- **Security owner/admin:** disposition temuan kredensial historis, credential rotation, serta akses ke private alert/SARIF. Dampak: security readiness belum dapat dinyatakan selesai.
- **GitHub Actions permissions/admin:** token `issues:write`, Pages/schedule settings, akses log privat atau disposable hosted resources. Dampak: apply issue sync, publikasi Pages, dan hosted fault rehearsal menunggu. Dry-run serta konfigurasi lokal tetap boleh dikerjakan.
- **Data/privacy owner dan storage operator:** retention/legal-hold dan ketahanan provider. Dampak: klaim kebijakan retensi atau durability provider tidak dibuat sebelum owner/provider dipilih.

Tidak satu pun blocker tersebut alasan untuk menahan pekerjaan lokal independen. Jangan menulis langsung ke GitHub dengan melewati workflow yang memeriksa SHA, lifecycle snapshot, batching, dan serialisasi.

## Backlog: ditunda, bukan dihapus

Lihat daftar dan kondisi pembukaan kembali di [backlog yang ditunda](EXECUTION-BACKLOG.md). Kartu tetap tercatat pada roadmap; backlog ini mencegahnya menghambat rilis pertama.

## Bukti reusable dan pemilihan batch berikutnya

PostgreSQL canonical suite lulus 15/15 pada exact source `203d29a05fedcf8c3b34b2303fa71b9df5bb0681`; focused Chromium request journey lulus di source aplikasi `5cff67d`, yang tidak berubah sampai `203d29a`. Jangan ulang suite ini kecuali source aplikasi terkait berubah atau kandidat final memerlukan hosted exact-SHA acceptance. Jangan membuat fixture/model atau refresh plan baru hanya untuk menambah jumlah bukti. Untuk batch selanjutnya, pilih kartu lokal dengan gap acceptance paling kecil dan dependency sudah tersedia; bila seluruh gap lokal kartu itu ternyata sudah dibuktikan, pindahkan sisanya ke blocker/backlog dan lanjut tanpa memperpanjang audit. Setelah perubahan, jalankan cek terarah, review diff, commit dan push ke `dev`, catat SHA dan hasil; hosted CI tetap verifikasi asinkron.

## Goal eksekusi yang diperbarui — jalur tercepat tanpa mengurangi cakupan

Goal rilis tetap aktif. Untuk menghindari empat hari kerja berputar, gunakan status `in_progress` sebagai daftar penerimaan yang belum lengkap, bukan instruksi untuk mengulang implementasi atau suite yang sudah lulus. Audit status/evidence sekali di awal batch; setelah itu kerja berdasarkan dependency dan gap acceptance berikut.

### Aturan fast path mulai batch ini

- **WIP lokal maksimum satu batch.** Pilih satu kartu atau satu kelompok kartu yang berbagi kode dan acceptance; jangan membuka audit baru sebelum batch itu punya hasil, diff yang direview, dan keputusan berikutnya.
- **Urutan tiap batch:** tulis gap acceptance yang belum terbukti → ubah hanya area terkait → jalankan satu focused test dan lint/typecheck package terdampak bila kode berubah → review diff → commit/push `dev` → catat SHA dan hasil. Tes tambahan hanya jika hasil pertama gagal atau ada perubahan lintas batas yang belum dibuktikan.
- **Bukti dipakai ulang.** Bukti valid selama source dan input yang diuji tidak berubah. SHA commit yang maju karena docs/evidence saja tidak membuat PostgreSQL, Board, security, atau browser suite perlu diulang. Untuk kandidat rilis, jalankan required exact-SHA gate sekali.
- **Pindahkan pekerjaan tanpa jalur lokal keluar dari antrean aktif.** Jika satu-satunya gap adalah approval, hak akses, secret rotation, Pages/Release hosted run atau operator eksternal, catat pemilik, URL/kebutuhan akses, dampak, dan exit evidence pada blocker/backlog; lanjut ke kartu lokal independen. Jangan membuat simulasi tambahan untuk menggantikan aksi hosted.
- **Batas berhenti eksplorasi.** Jangan menambah model, fixture, addon, benchmark, atau bukti naratif baru kecuali kartu tertentu membutuhkan perilaku itu dan ada acceptance terukur yang belum terpenuhi. Tutup pekerjaan berdasarkan bukti, bukan banyaknya command atau panjang evidence.
- **Tidak ada antrean CI.** Setelah satu push, lanjutkan batch lokal berikutnya; ambil satu snapshot hosted saat checkpoint atau saat ada perubahan status/alert. Reproduksi hanya lane gagal yang konkret. Semua gate tetap harus lulus sebelum promosi.

### Release blockers (menahan promosi, bukan pekerjaan lokal)

1. **M10.03 — exact-SHA gates dan promosi:** setelah memilih kandidat `dev`, tunggu semua check wajib untuk SHA/PR kandidat, PostgreSQL, browser dan container, lalu review CODEOWNER; jangan merilis atau mempromosikan sebelum seluruh policy lulus. Pemilik: maintainer + CODEOWNER. Bukti tutup: hasil check pada SHA yang dipromosikan dan verifikasi ref `main`.
2. **M8.03/M8.11 — security disposition:** minta security owner/admin memeriksa alert/SARIF privat, temuan secret historis, status rotasi/revokasi, private reporting dan pemilik respons. Pemilik: security owner/repo admin. Bukti tutup: disposition tertulis untuk tiap finding dan kanal/role operasional terverifikasi. Scan lokal yang bersih tidak menggantikan ini.
3. **M6.08 — stable docs:** tunggu rilis stabil pertama dan Pages production run; manifest/retensi lokal dan test-nya sudah ada. Pemilik: release maintainer. Bukti tutup: arsip versi di Release, alias latest dan Pages cocok dengan versi/SHA rilis.

### Bisa dikerjakan lokal sekarang (urut dependensi, tanpa menunggu CI)

1. **M3.11:** workflow browser matrix sudah tersedia di `main` dan menerima `workflow_dispatch`. Lokal, seluruh engine/PG coverage sudah tercatat; gap tunggalnya adalah satu eksekusi dari `main` dan review artifact. Jangan jalankan ulang browser suite lokal. Periksa run terjadwal/dispatch yang ada sekali; bila belum ada dan konektor mengizinkan, dispatch satu kali; jika tool/izin tidak tersedia, pindahkan ke blocker GitHub Actions dengan URL workflow. Tutup hanya setelah semua engine pass dan artifact aman ditinjau.
2. **M8.09:** periksa kontrak planner/reconciler dan uji dry-run lokal yang belum punya evidence pada source saat ini. Jika workflow/code sudah lengkap, jangan membuat ulang: rekam evidence lokal singkat dan tunggu aktivasi default-branch/`issues:write`. Tutup setelah scheduled reconcile menghasilkan upsert/resolve yang terverifikasi tanpa duplikasi/spam.
3. **M9.03 + M9.06:** perlakukan sebagai satu jalur acceptance addon karena M9.06 bergantung pada engine M9.03. Implementation, seed, API, expiry, dan perjalanan PostgreSQL/Board sudah ada; audit hanya gap yang belum terbukti untuk source saat ini, tanpa membuat model/fixture baru. Jika tidak ada gap lokal material, jangan refresh suite: tandai sisa exact-SHA/review sebagai blocker dan lanjut.
4. **M9.08:** jangan mengejar angka before/after lama yang tidak punya baseline setara. Pertahankan bukti graph, consumer dan route budget yang ada; minta owner menetapkan apakah hasil tersebut cukup atau tunggu baseline sebelum ekstraksi berikutnya. Perlakukan sebagai keputusan owner/backlog, bukan pekerjaan implementasi rilis.

### Approval/akses GitHub yang harus diberi pemilik

| Kebutuhan                                                               | Pemilik yang diminta      | Dampak                                                        | Jalur lokal sementara                                             |
| ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| CODEOWNER review dan merge PR promosi                                   | CODEOWNER/repo admin      | Menahan perubahan `main` dan M10.03                           | Lanjut audit lokal dan siapkan bukti kandidat; jangan bypass      |
| Private alerts/SARIF, security reporting dan disposition historis       | Security owner/repo admin | Menahan penutupan M8.03/M8.11                                 | Pertahankan fail-closed policy dan catat bukti scan yang tersedia |
| `workflow_dispatch`, Actions artifact/log dan Pages production settings | GitHub Actions admin      | Menahan acceptance terjadwal M3.11/M8.09 dan rilis docs M6.08 | Validasi workflow/test lokal sekali; jangan mengulang suite       |
| `issues:write` untuk reconciler issue                                   | GitHub Actions admin      | Menahan remote upsert/resolve M8.09                           | Jalankan planner/dry-run dan cek deduplikasi lokal                |

### Item post-release/backlog

M9.08 controlled size comparison tetap ditunda sampai ada baseline same-runner/toolchain sebelum ekstraksi berikutnya atau owner produk menerima graph/size budgets sebagai keputusan final. Ekspansi addon di luar request/approval, audit visual/browser yang telah lulus, rehearsal lifecycle penuh M11.14, serta eksperimen fault/recovery yang memerlukan akses privat tidak menahan rilis pertama; syarat pembuka masing-masing tetap tercatat di `EXECUTION-BACKLOG.md`. Tidak ada item roadmap yang dihapus.

### Batas batch agar tidak mengulang pekerjaan

- Satu batch harus menyebut kartu, gap acceptance, file/jalur, satu focused command, serta bukti hasil. Bila audit memperlihatkan implementasi sudah benar dan yang tertinggal remote, batch lokal berhenti pada pencatatan gap; pindah ke item lokal independen.
- Jangan menjalankan suite aplikasi, browser matrix, `pnpm verify`, `release:prepare`, atau audit penuh hanya untuk memperbarui timestamp/fingerprint evidence. Gunakan ulang bukti bila source dan input relevan tidak berubah. Jalankan hanya failed lane setelah kegagalan.
- Untuk docs/roadmap saja: jalankan validasi roadmap dan formatting yang relevan. Untuk workflow saja: workflow policy tests/linter terarah. Jalankan full required gates satu kali pada kandidat final; tetap wajib, tidak boleh dilewati.
- Satu status snapshot GitHub per checkpoint; jangan polling berulang tanpa perubahan status. CI asinkron berjalan sesudah push dan tidak menghentikan batch lokal independen.
- Tiap batch selesai dengan review diff, commit dan push ke `dev`, lalu catat SHA serta pemeriksaan lokal. Jangan membuat branch ketiga atau mempromosikan ke `main` di luar PR/gate yang berlaku.

### Definisi selesai goal

Goal penuh belum selesai hanya karena implementasi lokal atau CI `dev` lulus, dan tidak selesai hanya dengan merilis subset awal. Selesai setelah seluruh 148 kartu master checklist punya acceptance/evidence yang sesuai, semua required owner/hosted blocker ditutup melalui akses dan gate resmi, promosi protected serta siklus version/release/docs/Pages/issue trace dibuktikan, dan tidak ada kartu yang diam-diam dipindahkan keluar dari scope. Post-release/backlog adalah urutan pengerjaan setelah rilis pertama, bukan pengecualian dari goal.
