# Jalur rilis aktif

Diperbarui 2026-10-15. Goal penuh: 213 task (148 M-series + 65 K-series); tidak ada task atau acceptance yang dihapus. Gunakan `pnpm roadmap:progress -- --format json` untuk jumlah terkini, bukan snapshot angka dalam dokumen.

## Satu metode kerja

[EXECUTION.md](EXECUTION.md) adalah sumber aturan implementasi, pemeriksaan dan delivery. File ini hanya menentukan prioritas dan exit criteria. Riwayat metode dan bukti tetap tersedia di [arsip delivery](DELIVERY-PLAN-HISTORY-2026-10-15.md) dan evidence masing-masing task.

- Ambil satu batch release-critical dengan gap perilaku konkret. Jangan mengaudit ulang kartu yang sudah punya bukti valid.
- Jalankan focused test dan lint/typecheck area berubah. Setelah build terdampak, gunakan `pnpm release:preflight:built` untuk drift manifest Docker, diagram, generated reference/README dan kontrak roadmap. Command ini read-only dan tidak menggantikan required gates.
- Commit lokal atomik, push sekali per batch. Saat full candidate CI berjalan, lanjutkan pekerjaan lokal dan antrekan push; push perbaikan mendesak mengganti kandidat secara sadar. Jangan polling berulang tanpa perubahan status atau kebutuhan keputusan.
- Required gates dan fresh CODEOWNER approval harus lulus sebelum promosi. Tidak ada deployment aplikasi dalam goal ini; kesiapan rilis dibuktikan artifact dan source yang sama.
- Ekspansi knowledge/AI dan addon opsional tetap dikerjakan sesuai dependency dan approval setelah jalur inti tidak lagi tertahan pekerjaan lokal. Rinciannya tetap utuh di master roadmap dan backlog; jangan menambah scope itu sebagai syarat rilis inti.

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

### Release blockers (menahan promosi, bukan pekerjaan lokal)

1. **M10.03 — exact-SHA gates dan promosi:** setelah memilih kandidat `dev`, tunggu semua check wajib untuk SHA/PR kandidat, PostgreSQL, browser dan container, lalu review CODEOWNER; jangan merilis atau mempromosikan sebelum seluruh policy lulus. Pemilik: maintainer + CODEOWNER. Bukti tutup: hasil check pada SHA yang dipromosikan dan verifikasi ref `main`.
2. **M8.03/M8.11 — security disposition:** minta security owner/admin memeriksa alert/SARIF privat, temuan secret historis, status rotasi/revokasi, private reporting dan pemilik respons. Pemilik: security owner/repo admin. Bukti tutup: disposition tertulis untuk tiap finding dan kanal/role operasional terverifikasi. Scan lokal yang bersih tidak menggantikan ini.
3. **M6.08 — stable docs:** tunggu rilis stabil pertama dan Pages production run; manifest/retensi lokal dan test-nya sudah ada. Pemilik: release maintainer. Bukti tutup: arsip versi di Release, alias latest dan Pages cocok dengan versi/SHA rilis.

### Bisa dikerjakan lokal sekarang (urut dependensi, tanpa menunggu CI)

1. **M3.11:** verifikasi lokal browser matrix sudah tercatat dan tidak perlu diulang. Koneksi GitHub pada sesi ini tidak menyediakan pembacaan daftar Actions run atau `workflow_dispatch`; REST anonim terkena rate limit, sehingga run `main` dan artifact belum dapat diperiksa. Pindahkan ke blocker akses GitHub Actions: pemilik perlu memberi akses baca run/artifact dan dispatch satu kali pada `main`. Tutup hanya setelah semua engine pass dan artifact aman ditinjau.
2. **M8.09:** pemeriksaan lokal terbaru sudah tercatat pada SHA `1dcdbe15bb10a3d67eda7e75bfefe28e12db71c5` dan diverifikasi ulang pada batch evidence `7041a40d19d6f40a1608103f7452bf71fe800ebe`: planner/reconciler 13/13 dan workflow trust 24/24 lulus. Jangan mengulang tes lokal. Sisa tunggal ialah aktivasi default-branch dan satu verifikasi hosted yang membuktikan upsert/resolve kategori tepat tanpa duplikasi/spam; tutup hanya setelah artifact/log dan isu hasilnya diperiksa.
3. **M9.03 + M9.06:** perlakukan sebagai satu jalur acceptance addon karena M9.06 bergantung pada engine M9.03. Implementation, seed, API, expiry, dan perjalanan PostgreSQL/Board sudah ada; audit hanya gap yang belum terbukti untuk source saat ini, tanpa membuat model/fixture baru. Jika tidak ada gap lokal material, jangan refresh suite: tandai sisa exact-SHA/review sebagai blocker dan lanjut.
4. **M9.08:** jangan mengejar angka before/after lama yang tidak punya baseline setara. Pertahankan bukti graph, consumer dan route budget yang ada; minta owner menetapkan apakah hasil tersebut cukup atau tunggu baseline sebelum ekstraksi berikutnya. Perlakukan sebagai keputusan owner/backlog, bukan pekerjaan implementasi rilis.

### Approval/akses GitHub yang harus diberi pemilik

| Kebutuhan                                                               | Pemilik yang diminta      | Dampak                                                        | Jalur lokal sementara                                             |
| ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| CODEOWNER review dan merge PR promosi                                   | CODEOWNER/repo admin      | Menahan perubahan `main` dan M10.03                           | Lanjut audit lokal dan siapkan bukti kandidat; jangan bypass      |
| Private alerts/SARIF, security reporting dan disposition historis       | Security owner/repo admin | Menahan penutupan M8.03/M8.11                                 | Pertahankan fail-closed policy dan catat bukti scan yang tersedia |
| `workflow_dispatch`, Actions artifact/log dan Pages production settings | GitHub Actions admin      | Menahan acceptance terjadwal M3.11/M8.09 dan rilis docs M6.08 | Validasi workflow/test lokal sekali; jangan mengulang suite       |
| Baca daftar Actions run dan dispatch M3.11 dari `main`                  | GitHub Actions admin      | Menahan tinjauan artifact browser matrix dan acceptance M3.11 | Workflow ada di `.github/workflows/browser-matrix.yml`; butuh koneksi berizin untuk membaca run/artifact serta dispatch satu kali. Jangan ulang browser suite lokal. |
| `issues:write` untuk reconciler issue                                   | GitHub Actions admin      | Menahan remote upsert/resolve M8.09                           | Jalankan planner/dry-run dan cek deduplikasi lokal                |

## Backlog dan definisi selesai

[EXECUTION-BACKLOG.md](EXECUTION-BACKLOG.md) menyimpan item tertunda, alasan, pemilik/dependency dan syarat pembukaan ulang. K0-004/K0-005 memiliki owner `bjo163` dan kebijakan umum yang disetujui. K0-006 sudah mematok delapan ref publik dan memetakan notice hak yang tersedia; file sumber yang dipilih, hash data per file, ID historis, dan pemetaan ID masih perlu diverifikasi. Hak per sumber dan consent per data tetap wajib sebelum impor. Repo desain privat tidak dibuka.

Goal lengkap hanya selesai bila seluruh acceptance master terbukti. Selesainya kode lokal berbeda dari acceptance hosted: M3.11, M8.09, release/Pages, security disposition dan promosi tetap terbuka selama bukti eksternalnya belum ada. Tidak membuat fixture atau simulasi kedua untuk menggantikan aksi hosted.
