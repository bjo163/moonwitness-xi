# Protokol eksekusi untuk agen

## 1. Konteks minimum

Project merupakan pnpm monorepo dengan API Fastify, ORM Objection/Knex, PostgreSQL, dan React/Vite Board. Baca file sumber untuk memastikan versi dan kontrak aktual; jangan mengandalkan ringkasan ini untuk memilih API dependency.

Scope saat dokumen ini dibuat adalah perencanaan. Kartu di sini bukan instruksi untuk langsung menerbitkan release atau mengubah repository settings ketika pengguna hanya meminta memperbarui rencana.

Jika pelaksanaan sudah diminta, kerjakan kartu dalam scope yang diotorisasi. Tidak perlu menanyakan kembali keputusan yang sudah eksplisit: dua branch main/dev, tidak ada deploy aplikasi, typed strict, programmatic schema/seed, dan identitas UI reusable. Keputusan stable release pertama tetap ditangani sesuai M7.03.

## 2. Pilih satu pekerjaan yang siap

1. Baca `git status --short --branch` dan status master roadmap. Jangan reset atau membuang perubahan yang tidak dibuat sendiri.
2. Pilih task dengan semua `dependsOn` terbukti selesai. Jika dependency belum selesai, kerjakan dependency yang diizinkan atau laporkan apa yang dibutuhkan.
3. Baca kartu, source files, related tests, dan evidence task sebelumnya.
4. Konfirmasi keberadaan file dengan `rg --files`. Output baru pada kartu adalah rencana, bukan bukti file sudah tersedia.
5. Jika kartu terlalu besar untuk satu sesi, bagi menjadi `<ID>/a`, `<ID>/b`, dan seterusnya dalam evidence, tanpa mengubah ID utama.
6. Catat batas edit dan deliverable sebelum mengubah kode. Satu kartu tidak memberi alasan mengerjakan area lain yang belum diperlukan.

## 3. Pola pengerjaan setiap kartu

1. **Inspect:** temukan public contract, caller dan test existing.
2. **Reproduce:** untuk bug, buat reproduksi minimal atau test gagal yang relevan. Untuk dokumen/desain sederhana, tidak perlu membuat test artifisial.
3. **Implement:** perubahan paling kecil yang memenuhi kontrak; reuse primitive/helper yang sudah benar.
4. **Verify:** jalankan test khusus perubahan, types/lint package terkait, kemudian integration jika kontrak lintas-package berubah.
5. **Review:** baca diff untuk secret, any, leftover debug, duplicate implementation, undocumented public change dan generator drift.
6. **Record:** isi evidence actual result. Jangan menulis pass jika command belum dijalankan.
7. **Close:** centang master hanya setelah acceptance lengkap; jika external activation belum dilakukan, tetap unchecked dan tulis partial.

8. **Deliver:** pada setiap unit selesai, commit perubahan task yang sudah diperiksa dan push ke `dev` tanpa force. Verifikasi remote SHA dan catat CI status. `main` diperbarui melalui promotion PR setelah gate siap. Jangan membuat empty commit pada no-op, memasukkan file pengguna yang tak terkait, atau menaikkan versi untuk setiap commit; bump mengikuti release planner. Lihat [kontrak delivery](ISSUE-SYNC-CONTRACT.md).

## 4. Perintah yang sudah tersedia pada baseline

Verifikasi `package.json` sebelum memakai daftar ini karena implementasi berikutnya dapat mengubahnya.

```powershell
git status --short --branch
pnpm lint
pnpm format:check
pnpm build
pnpm test
pnpm --filter @moonwitness/board typecheck
pnpm --filter @moonwitness/board lint
pnpm --filter @moonwitness/api exec vitest run tests/auth.test.ts
pnpm --filter @moonwitness/orm-base test
git diff --check
```

`typecheck`, `test:unit`, `test:integration`, `test:e2e`, `docs:*` dan `verify` pada root adalah deliverable roadmap jika belum tersedia. Jangan melaporkan command tersebut sukses sebelum dibuat dan dijalankan. Local PostgreSQL tests yang skipped tidak membuktikan integration lolos.

Jangan mencetak `.env`. Baca schema konfigurasi dan nama variable yang diperlukan; gunakan fixture credential sintetis. DB test harus terisolasi dan ditentukan eksplisit. Jangan menjalankan reset password terhadap akun pengguna saat menguji CLI.

## 5. Batas perubahan per jalur paralel

| Jalur        | File utama                                             | Koordinasi wajib                                                 |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------------- |
| A automation | `.github`, `scripts/release`, root scripts/config      | Root package/lockfile, token contract, generation writes         |
| B Board      | `apps/board`, E2E specs                                | UI public API dengan E; API fixture dengan C                     |
| C backend    | `apps/api`, `packages/orm`, `auth`, `jobs`, `orm-base` | Metadata dengan D, fixture dengan B                              |
| D docs       | docs portal, docs generator, README                    | Generated source dengan C; assets dengan E                       |
| E design     | `packages/ui`, `packages/assets`, katalog              | Migrasi imports Board dengan B; root workspace/lockfile dengan A |

File bersama seperti root `package.json`, lockfile, tsconfig dan README harus punya satu penulis pada saat yang sama. Agen lain mengirim kebutuhan perubahan, bukan menimpa file. Parallel tidak berarti masing-masing membuat branch baru.

## 6. Aturan types dan package

- Public input tidak tepercaya bertipe `unknown` lalu divalidasi; jangan mengganti any dengan cast berantai.
- Definisikan union states yang exhaustif untuk job/release/UI ketika relevan.
- Public exports harus explicit. Consumer tidak deep-import internal file package lain.
- `ui` tidak boleh mengambil data API, membaca auth token, atau mengetahui `base.user`.
- `assets` tidak bergantung React. Wrapper React berada di `ui`.
- Core ORM tidak mengimpor addon bisnis. Addon bergantung core melalui contract.
- Jangan memindahkan implementasi sekaligus mengubah perilaku tanpa test yang membedakan keduanya.

## 7. Jika pemeriksaan gagal

| Kejadian                                  | Tindakan                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Lint/types gagal                          | Perbaiki penyebab; jangan menonaktifkan rule global                               |
| DB tidak tersedia                         | Laporkan environment, jangan tulis integration pass; gunakan runner DB terisolasi |
| Flaky browser                             | Simpan trace dan diagnosis; retry terbatas tetap dilaporkan                       |
| dev berubah saat bot menulis              | Baca head baru, rebase perhitungan, jalankan ulang verifikasi; jangan force-push  |
| Permission GitHub tidak tersedia          | Selesaikan config/dry-run lokal, tulis permission minimum yang kurang             |
| Tag/aset sudah ada                        | Baca source/digest; lanjut jika identik, berhenti jika berbeda                    |
| Generator mengubah manual docs            | Perbaiki delimiters dan test; jangan menerima overwrite                           |
| Screenshot baseline berubah               | Periksa diff; jangan otomatis update baseline untuk melewatkan test               |
| Aturan dokumen bertentangan dengan source | Catat discrepancy, periksa tujuan pengguna, perbarui plan/ADR dengan alasan       |

## 8. Handoff minimum

Gunakan format berikut agar agen berikutnya tidak perlu membaca seluruh chat:

```text
Task ID:
Status: todo / in-progress / blocked / complete
Source SHA / branch:
Tujuan dan kontrak yang diterapkan:
File yang berubah:
Perubahan belum committed yang perlu dipertahankan:
Command + exit code + ringkasan hasil:
Tests skipped dan alasannya:
Evidence path / CI run:
Masalah tersisa / dependensi eksternal:
Langkah berikutnya yang konkret:
Commit hasil pekerjaan / pushed remote SHA:
GitHub issue / promotion PR / CI status:
```

Selesai coding, selesai verifikasi lokal, dan selesai aktivasi remote adalah tiga kondisi berbeda. Tuliskan kondisi yang sebenarnya.
