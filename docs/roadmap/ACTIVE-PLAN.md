# Jalur rilis aktif

**Diperbarui: 2026-10-15.** Tujuan dekatnya adalah satu rilis pertama yang dapat dipakai, bukan menyelesaikan 148 kartu satu per satu. Seluruh kartu tetap ada di `tasks.json`; catatan batch lama dipindahkan ke [arsip eksekusi](EXECUTION-HISTORY-2026-10-15.md). Estimasi lama 8–13 hari tidak dipakai lagi karena mencampur pekerjaan wajib dengan backlog dan pengulangan verifikasi.

## Diagnosis dan aturan percepatan

Yang membuat pekerjaan terasa berulang adalah: acceptance per model meski memakai guard yang sama; menjalankan ulang seluruh suite setelah perubahan dokumentasi atau perubahan test terisolasi; menjalankan release-plan parity pada setiap batch; menunggu CI hosted sebelum mulai pekerjaan lokal independen; serta menghitung audit visual, audit platform, dan ekspansi addon sebagai prasyarat rilis.

Untuk setiap batch, jalankan hanya tes yang membuktikan perilaku yang berubah, typecheck/build dan lint pada paket terdampak, serta pemeriksaan roadmap/diff bila dokumen evidence berubah. Gunakan hasil sebelumnya hanya jika source SHA dan input terkait identik. Jalankan rangkaian wajib lengkap sekali pada kandidat rilis exact-SHA. CI mulai setelah push dan tidak menahan kerja lokal lain. Jangan menghapus typecheck, lint, tes keamanan, gate wajib, PostgreSQL acceptance, atau CODEOWNER approval.

`pnpm verify` sekarang menggunakan build hasil typecheck untuk suite unit/docs/architecture pada run yang sama. Pertahankan jalur tersebut; jangan menambahkan build ulang tanpa perubahan input atau runner baru. Jangan mengulang browser matrix lintas engine dan seluruh fixture otorisasi untuk kontrak yang sudah terbukti.

Tes kebijakan automation di CI dibagi menjadi empat suite matrix paralel (`workflow`, `release`, `roadmap`, `platform`). Seluruh suite tetap menjadi satu job `automation` yang wajib sukses di `ci-gate`; perubahan ini hanya mengurangi antrean serial, bukan cakupan tes.

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

## Batch lokal berikutnya

PostgreSQL canonical suite lulus 15/15 pada exact source `203d29a05fedcf8c3b34b2303fa71b9df5bb0681`; focused Chromium request journey lulus di source aplikasi `5cff67d`, yang tidak berubah sampai `203d29a`. Jangan ulang suite ini kecuali source aplikasi terkait berubah atau kandidat final memerlukan hosted exact-SHA acceptance. Jangan membuat fixture/model atau refresh plan baru hanya untuk menambah jumlah bukti. Berikutnya kerjakan blocker lokal yang source-nya benar-benar belum terpenuhi; jika sisanya menunggu owner/akses GitHub, tandai dependensinya dan lanjutkan task lokal lain. Setelah perubahan, jalankan cek terarah, review diff, commit dan push ke `dev`, catat SHA dan hasil; hosted CI tetap verifikasi asinkron.
