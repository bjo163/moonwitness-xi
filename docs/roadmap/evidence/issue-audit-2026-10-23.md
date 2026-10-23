# Audit lintas seluruh issue terbuka — 2026-10-23

Basis pemeriksaan: branch `dev` HEAD `a6eb546` (plus koreksi `.gitattributes` `dfe8a3a`), `main` = `9c9d5a3`, PR #51 terbuka dari `dev` dengan head `a6eb546`. Metode: setiap issue dibaca bersama kartu pada `docs/roadmap/`, checkbox `ROADMAP.md`, berkas evidence terkait, kode/workflow/test nyata pada HEAD, dan hasil check publik yang dapat dibaca tanpa token.

Klasifikasi: `LOCAL` = sisa pekerjaan dapat dikerjakan di repo ini sekarang; `EXTERNAL` = membutuhkan aksi pemilik/hosted (CODEOWNER review, dispatch Actions, baca artifact/log, disposition alert keamanan, release pertama, keputusan lisensi/rights); `CLOSEABLE` = acceptance lengkap dan terbukti hari ini.

## Hasil ringkas

| Kelas     | Jumlah | Catatan                                                                                         |
| --------- | ------ | ----------------------------------------------------------------------------------------------- |
| CLOSEABLE | 0      | Tidak ada issue yang seluruh acceptancenya terbukti lengkap pada HEAD ini.                      |
| LOCAL     | 20     | Rinciannya pada tabel di bawah; sebagian kecil juga masih butuh bukti hosted.                   |
| EXTERNAL  | 24     | Gerbang utamanya review CODEOWNER pada PR #51 dan akses Actions.                                |
| Total     | 44     | Semua checkbox task terkait masih `[ ]` di `ROADMAP.md`, jadi proyeksi issue↔roadmap konsisten. |

## Tabel cross-check

| Issue | Task    | Kelas    | Sisa pekerjaan konkret                                                                                                            |
| ----- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| #25   | M11.06  | LOCAL    | Catat aktivasi cron `roadmap-issue-plan` yang sudah berjalan dan diagnosis apply run gagal pada push terbaru.                     |
| #26   | M11.14  | EXTERNAL | Siklus penuh menutup hanya setelah promosi `main` dan rilis stabil pertama ada.                                                   |
| #27   | M11.03  | LOCAL    | `test:roadmap` sudah 125/125; rekam ulang hitung tes pada evidence dan bukti no-op apply.                                         |
| #28   | M11.04  | LOCAL    | Proyeksi 213 task baru 72; lanjutkan batch terbatas dan catat read-back metadata/`metadataDrift=6`.                               |
| #29   | M11.09  | LOCAL    | Dashboard berjalan; implementasikan probe GitHub Projects atau catat acceptance ekivalen sesuai kartu.                            |
| #30   | M7.05   | EXTERNAL | Butuh hosted apply idempotent + retry no-op; work lokal: re-pin SHA parity `2.0.0-rc.1` (27 berkas) di evidence + checklist.      |
| #31   | M8.03   | EXTERNAL | Machinery scan/policy/exception lengkap; disposition alert CodeQL/Trivy privat dan temuan secret historis milik security owner.   |
| #32   | M8.11   | EXTERNAL | Dokumen reporting/IR/rotasi/koreksi rilis sudah ada; verifikasi kanal privat + penunjukan owner masih aksi pemilik.               |
| #33   | M10.01  | LOCAL    | Matriks coverage 38 baris (bukan 39 yang diklaim); tambahkan baris permukaan pasca-Next.js dengan owner + prioritas.              |
| #34   | M11.15  | LOCAL    | Runbook dan `docs/operations/roadmap-sync.md` masih menyebut schedule belum aktif; koreksi + rekam pemulihan run gagal.           |
| #35   | M7.16   | EXTERNAL | Artifact `release-plan` hosted belum pernah ada dan Release kosong; work lokal: tes plumbing `--channel`.                         |
| #37   | M3.11   | LOCAL    | Evidence lama mengukur SPA Vite 24 tes; Board kini Next.js dengan 34 tes, termasuk homepage publik yang belum pernah divisualkan. |
| #38   | M9.08   | LOCAL    | Angka budget/siklus hasil ekstraksi lama; ukur ulang `audit:workspace`, `architecture:check:built`, `board:budget` di HEAD baru.  |
| #39   | M11.07  | LOCAL    | 29 issue managed tertutup 2026-10-23 tetapi tanpa attribution run; tambahkan jejak penutupan pada evidence.                       |
| #43   | M8.10   | EXTERNAL | Audit kode/test lengkap; baca registry+billing Actions (401/404) dan baseline bulanan pertama (2026-11-01) milik admin.           |
| #44   | M7.14   | EXTERNAL | Adapter test lokal lengkap; race kredensial/registry hosted belum berjalan; perbaiki matriks evidence yang kontradiktif.          |
| #45   | M10.06  | EXTERNAL | _suite_ lokal 18/18 hijau; rehearsal interupsi hosted di `main` milik Actions admin. Work lokal: peta guard orchestrator ke tes.  |
| #47   | M8.06   | EXTERNAL | Eksekutor + serialisasi terbukti lokal; dispatch `dependency-candidate` dan CI exact-SHA Node 22 belum ada.                       |
| #48   | M9.06   | EXTERNAL | Addon request/approval nyata dan lulus test lokal; sisa acceptance adalah exact-SHA hosted, browser journey, M8.03, CODEOWNER.    |
| #50   | M11.11  | EXTERNAL | Coordinator + 26/26 trust test hijau; PR #51 belum `auto_merge` dan berhenti pada approval CODEOWNER baru.                        |
| #54   | M8.07   | LOCAL    | 10 kandidat major belum punya laporan kompatibilitas per kandidat; planner masih mencetak "release notes: not reported".          |
| #59   | M10.03  | EXTERNAL | Memerlukan required checks lulus pada SHA yang dipromosikan + review CODEOWNER.                                                   |
| #67   | M8.05   | LOCAL    | Langkah kartu "batasi batch" belum diimplementasikan di `scripts/dependency-update-plan.mjs`; koreksi teks schedule kadaluarsa.   |
| #70   | K3-005  | EXTERNAL | Acceptance review flow terimplementasi dan bertes; tunggu exact-SHA hosted, CODEOWNER, sign-off privasi.                          |
| #71   | K3-006  | EXTERNAL | Explanation API lengkap lokal; gerbang hosted + penerimaan operasional/privasi oleh pemilik.                                      |
| #72   | K3-007  | EXTERNAL | Kandidat duplikat bertes; target verifikasi "G3 009/012/013" butuh keputusan re-scope atau sumber ber-hak dari pemilik.           |
| #74   | K4-003  | LOCAL    | Analyzer bernama + golden candidate source-derived + negatif false-positive + laporan reproduksi di `research/evaluations/`.      |
| #75   | K4-004  | EXTERNAL | Skema/persistensi/rute baca selesai; mapping RUH/HIZAB butuh sumber teologi berlisensi dan approval kebijakan digest pemilik.     |
| #76   | M10.05  | EXTERNAL | Job `containers` hosted + ikatan digest image↔candidate (M7.09); board image pindah ke runtime Next.js tanpa smoke terekam.       |
| #79   | K5-002  | LOCAL    | Revocation baru menutup proyeksi pencarian sintetis; perlu derivatif lain + negatif jalur eksposur + keputusan retensi pemilik.   |
| #82   | K8-001  | LOCAL    | Explorer sudah pindah Next.js; perlu jalan ulang journey di HEAD, tinjauan screen-reader, dan bukti hosted.                       |
| #83   | K5-003  | LOCAL    | Domain + guard sintetis lengkap; endpoint akses purpose/consent non-superadmin belum ada.                                         |
| #87   | K4-005  | EXTERNAL | Kontrak kandidat + store selesai; "empat tradisi" butuh saksi nyata/rights dan aturan review subject dari pemilik.                |
| #88   | K5-004  | LOCAL    | Kontrak story/page lengkap; tidak ada model `episode` padahal judul kartu menyebutnya; dep K5-003 belum closed.                   |
| #89   | M7.15   | EXTERNAL | Orchestrator baru ada di `dev`; `main` belum memilikinya dan environment `release` belum dibuat.                                  |
| #90   | K5-005  | LOCAL    | Validator hanya memeriksa struktur milik pemanggil; lookup keputusan tenant-scoped tepercaya + resolusi source belum ada.         |
| #91   | K7-005  | LOCAL    | Boundary tool-free + fixture injeksi lolos dengan provider palsu; matriks fixture adversarial lebih luas masih lokal.             |
| #92   | K7-002  | EXTERNAL | Survey + registry kosong + verifier ada; pemilik harus memilih, mengunduh, dan me-review lisensi artifact model.                  |
| #93   | K7-004  | LOCAL    | Envelope/store/rute ada; `research-review.routes.ts` belum punya binding kandidat (dep K3-005).                                   |
| #94   | K7-006  | EXTERNAL | Baseline model-off jujur tercatat; metrik p50/p95 dan perbandingan source-tunggal mustahil sebelum #92 selesai.                   |
| #95   | M6.07   | EXTERNAL | Preview artifact `dev` terbukti berulang; deploy `main` terpercaya pertama belum pernah sukses.                                   |
| #96   | K8-002  | LOCAL    | Workbench + pratinjau komposisi ada; provenance original/derived, manajemen gambar, review, publikasi, halaman poster belum.      |
| #97   | insiden | EXTERNAL | Koreksi kode sudah di `dev` (`d4f2d8a`, `8fc2dba`, `a2b6f21`); tutup hanya setelah `postgres-recovery` hijau di `main`.           |

## Temuan yang membantah catatan lama

- Seluruh workflow berjadwal sudah ada di `main`, sehingga klaim "belum ada di main, schedule tidak dapat aktif" tidak berlaku lagi. Hasil pemeriksaan `git ls-tree origin/main` vs `origin/dev`: identik untuk `codeql.yml` (`63cd449`), `gitleaks.yml` (`c19886d`), `dependency-update-plan.yml` (`bc87dee`), `docs-links.yml`, `release-plan.yml`, `roadmap-progress.yml`, `ubuntu-runner-candidate.yml`, `visual-review.yml`; ada di `main` tetapi tertinggal dari `dev` untuk `dependency-candidate.yml` (`0cccd11`), `platform-audit.yml` (`dd051b0`), `browser-matrix.yml` (`9e5e2fc`), `deep-regression.yml` (`4ca17e3`), `roadmap-issue-plan.yml` (`687d470`), `roadmap-issue-intake.yml` (`7c451dd`), `ci.yml`, `pages.yml`, `promote.yml`, `release-prepare.yml`, `release.yml`, `sync-main-to-dev.yml`. Cron pada salinan `main`: planner Senin 06:23, CodeQL Senin 05:23, Gitleaks Senin 05:41, browser matrix Senin 03:37, deep regression Selasa 04:17, platform audit tanggal 1 pukul 07:17, issue sync harian 09:13. Hanya `dependency-candidate.yml` yang `workflow_dispatch` tanpa cron. Koreksi diperlukan pada `M8.05`, `M8.06`, `M8.07`, `M8.10`, `M11.06`, `M11.15` dan `docs/operations/roadmap-sync.md`.
- `pnpm test:roadmap` gagal 3/125 dan `@moonwitness/local-ai` gagal 2/33 di checkout Windows karena CRLF, bukan karena logika. Setelah `.gitattributes` memberi `text eol=lf` pada `.github/**/*.yml` dan `corpus/manifests/**`, keduanya lulus penuh (125/125 dan 33/33).
- Checkpoint `ACTIVE-PLAN.md` (basis `3bcb213`, 2026-10-18) tertinggal 34 commit; klaim "M3.11 local acceptance selesai, jangan ulang" menggambarkan SPA Vite dan tidak lagi berlaku untuk Board Next.js.
- Paritas rilis `prepare-release` kini `2.0.0-rc.1` dengan 27 berkas; `ROADMAP.md` masih mem-pin `c45fea6`/25 berkas.
- Nol GitHub Release; satu tag `v1.0.0-rc.1` → `93c341c`. Planner/orchestrator fail-closed `baseline-unpublished` selama Release baseline tidak diterbitkan.
- HEAD `a6eb546` memiliki check merah pada `ci-gate`, `ci-technical-gate`, `quality`, `ui`, `browser`, CodeQL, dan build dokumentasi. Sebab gagal belum dapat dibaca tanpa kredensial Actions (API anonim 403), sehingga koreksi dilakukan dengan reproduksi lokal.

## Koreksi yang masuk bersamaan dengan audit ini

Reproduksi lokal pada tree bersih menemukan tiga penyebab konkret atas lane merah, semuanya sudah diperbaiki dan diverifikasi di `dev` (`c758ba0` konfigurasi checkout/lint, `8c5c1fe` format Prettier, `296bd8b` sinkronisasi referensi generated):

- `pnpm format:check` gagal pada 13 berkas sumber (Board e2e specs, `global.css`, `index.css`, `dashboard-page.tsx`, script `packages/assets`, dua komponen `packages/ui`) yang belum pernah diformat Prettier. Sekarang seluruh repo lolos `prettier --check .` tanpa mengubah perilaku: `test:ui` 36/36, aset 18/18 + `assets:validate`, `board:ui:check`, `test:roadmap` 125/125.
- `pnpm lint` gagal karena `packages/assets/scripts/prepare-brand-master.mjs` memakai global Node `URL` yang tidak dideklarasikan pada blok globals `.mjs`, dan karena ESLint ikut memindai output build Next.js (`.next`, `.next-visual`) yang tidak termasuk `ignores`. Keduanya diperbaiki di `eslint.config.js`; `pnpm lint` kini keluar tanpa error.
- Referensi generated (`README.md`, `docs/guide/reference/generated-api.md`, `generated-models.md`, `generated-platform.md`, `generated-platform.json`) tertinggal dari `packages/assets/package.json` yang sudah memuat `artwork:prepare`, `brand:prepare`, `fonts:prepare`; `docs:generate` menyinkronkan dan fingerprint sumber diperbarui.
- `1949751` menghapus deliverable M5.01 `docs/design/visual-direction.md` tanpa dokumen pengganti, sehingga `pnpm docs:links` gagal ("Found 1 broken local Markdown link") dan langkah `docs:check` pada lane quality ikut merah; `docs/roadmap/05-design-system.md:9`, `docs/roadmap/tasks.json:572` serta evidence M3.10/M5.01/M5.15 tetap menunjuk berkas itu. Berkas dikembalikan persis dari commit `90d6b50` dan `pnpm docs:links` lulus lagi.
- `.gitattributes` kini menegakkan LF untuk seluruh berkas teks (`.github/**/*.yml`, `corpus/manifests/**`, lalu aturan global `* text=auto eol=lf`) sehingga `format:check`, test kontrak roadmap, dan verifikasi hash manifest corpus dapat direproduksi pada checkout Windows; sebelumnya 3/125 `test:roadmap` dan 2/33 test `@moonwitness/local-ai` gagal hanya karena CRLF.

Lane `ui` dan `browser` masih memerlukan baseline visual yang dirender pada runner Linux. Snapshot `win32` tidak dapat dipakai sebagai baseline, jadi keberhasilannya tetap bergantung pada akses Actions (`workflow_dispatch` + baca artifact) milik pemilik repo.

## Aksi yang ditunggu dari pemilik repo

1. Review dan merge PR #51 (`dev` → `main`) setelah semua check hijau — ini gerbang tunggal untuk #26, #50, #59, #97 dan aktivasi schedule `main`.
2. Berikan akses baca artifact/log + `workflow_dispatch` + `issues:write` untuk reconciler (#25, #28, #34, #47, #76, #95).
3. Disposition alert CodeQL/Trivy privat dan temuan credential historis (#31, #32, #43).
4. Terbitkan Release baseline untuk tag `v1.0.0-rc.1` (#30, #35, #89).
5. Keputusan konten: sumber RUH/HIZAB dan saksi empat tradisi (#75, #87), target verifikasi K3-007 (#72), kebijakan retensi/privasi (#79, #83), pemilihan artifact model lokal (#92 → #94).
