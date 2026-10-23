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

| Issue | Task    | Kelas    | Sisa pekerjaan konkret                                                                                                                          |
| ----- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| #25   | M11.06  | LOCAL    | Apply push-triggered hijau tercatat sampai `3e31723` (read-back #25/#34/#29/#38); sisa: bukti hosted continuation dispatch saat selection > 5.  |
| #26   | M11.14  | EXTERNAL | Siklus penuh menutup hanya setelah promosi `main` dan rilis stabil pertama ada.                                                                 |
| #27   | M11.03  | LOCAL    | Hitung tes tercatat ulang (142/142); no-op apply hosted butuh dua dispatch `task_ids` pada head yang sama (aksi pemilik).                       |
| #28   | M11.04  | LOCAL    | Drift dibaca ulang di `3e31723` (6 entri, staleSource=71); sisa: backfill 141 create + 72 update dalam batch terbatas.                          |
| #29   | M11.09  | LOCAL    | Langkah 5 acceptance browser lulus (`b654c26`); sisa: probe Projects terautentikasi + read-back delivery di Pages stabil.                       |
| #30   | M7.05   | EXTERNAL | Butuh hosted apply idempotent + retry no-op; work lokal: re-pin SHA parity `2.0.0-rc.1` (27 berkas) di evidence + checklist.                    |
| #31   | M8.03   | EXTERNAL | Machinery scan/policy/exception lengkap; disposition alert CodeQL/Trivy privat dan temuan secret historis milik security owner.                 |
| #32   | M8.11   | EXTERNAL | Dokumen reporting/IR/rotasi/koreksi rilis sudah ada; verifikasi kanal privat + penunjukan owner masih aksi pemilik.                             |
| #33   | M10.01  | LOCAL    | Matriks kini 41 baris (`6ba6dbf`): tiga permukaan pasca-Next.js masuk dengan owner+prioritas; sisa: eksekusi temuan `AUTH-ENTRY-INDEXING`.      |
| #34   | M11.15  | LOCAL    | Runbook dikoreksi dan rute pemulihan tercatat; sisa: retry stale-sync hosted memakai `stale_sync_retry_count`.                                  |
| #35   | M7.16   | EXTERNAL | Artifact `release-plan` hosted belum pernah ada dan Release kosong; work lokal: tes plumbing `--channel`.                                       |
| #37   | M3.11   | LOCAL    | Evidence diukur ulang pada head kini: 37 tes, 35 lulus / 2 gagal; sisa: baseline Linux di runner + satu run hosted utuh (aksi pemilik).         |
| #38   | M9.08   | LOCAL    | Angka diukur ulang di `e6be76f` (stylesheet 76.838 B, lebih 11.302 B); sisa: keputusan anggaran oleh pemilik.                                   |
| #39   | M11.07  | LOCAL    | Isu tanpa marker teridentifikasi (#97, issue insiden); sisa: atribusi 29 closure + GitHub App preflight.                                        |
| #43   | M8.10   | EXTERNAL | Audit kode/test lengkap; baca registry+billing Actions (401/404) dan baseline bulanan pertama (2026-11-01) milik admin.                         |
| #44   | M7.14   | EXTERNAL | Adapter test lokal lengkap; race kredensial/registry hosted belum berjalan; perbaiki matriks evidence yang kontradiktif.                        |
| #45   | M10.06  | EXTERNAL | _suite_ lokal 18/18 hijau; rehearsal interupsi hosted di `main` milik Actions admin. Work lokal: peta guard orchestrator ke tes.                |
| #47   | M8.06   | EXTERNAL | Eksekutor + serialisasi terbukti lokal; dispatch `dependency-candidate` dan CI exact-SHA Node 22 belum ada.                                     |
| #48   | M9.06   | EXTERNAL | Addon request/approval nyata dan lulus test lokal; sisa acceptance adalah exact-SHA hosted, browser journey, M8.03, CODEOWNER.                  |
| #50   | M11.11  | EXTERNAL | Coordinator + 26/26 trust test hijau; PR #51 belum `auto_merge` dan berhenti pada approval CODEOWNER baru.                                      |
| #54   | M8.07   | LOCAL    | 12 kandidat major sudah punya bukti per kandidat (`fdfa432`, dibaca ulang `451be53`); sisa: keputusan upgrade TypeScript/Actions oleh pemilik.  |
| #59   | M10.03  | EXTERNAL | Memerlukan required checks lulus pada SHA yang dipromosikan + review CODEOWNER.                                                                 |
| #67   | M8.05   | LOCAL    | Batch dibatasi 3 kandidat per grup dan teks schedule kadaluarsa sudah dikoreksi (`fdfa432`, `1a3abd4`); sisa: eksekusi promosi batch di runner. |
| #70   | K3-005  | EXTERNAL | Acceptance review flow terimplementasi dan bertes; tunggu exact-SHA hosted, CODEOWNER, sign-off privasi.                                        |
| #71   | K3-006  | EXTERNAL | Explanation API lengkap lokal; gerbang hosted + penerimaan operasional/privasi oleh pemilik.                                                    |
| #72   | K3-007  | EXTERNAL | Kandidat duplikat bertes; target verifikasi "G3 009/012/013" butuh keputusan re-scope atau sumber ber-hak dari pemilik.                         |
| #74   | K4-003  | LOCAL    | Analyzer bernama + golden candidate source-derived + negatif false-positive + laporan reproduksi di `research/evaluations/`.                    |
| #75   | K4-004  | EXTERNAL | Skema/persistensi/rute baca selesai; mapping RUH/HIZAB butuh sumber teologi berlisensi dan approval kebijakan digest pemilik.                   |
| #76   | M10.05  | EXTERNAL | Job `containers` hosted + ikatan digest image↔candidate (M7.09); board image pindah ke runtime Next.js tanpa smoke terekam.                     |
| #79   | K5-002  | LOCAL    | Revocation baru menutup proyeksi pencarian sintetis; perlu derivatif lain + negatif jalur eksposur + keputusan retensi pemilik.                 |
| #82   | K8-001  | LOCAL    | Explorer sudah pindah Next.js; perlu jalan ulang journey di HEAD, tinjauan screen-reader, dan bukti hosted.                                     |
| #83   | K5-003  | LOCAL    | Domain + guard sintetis lengkap; endpoint akses purpose/consent non-superadmin belum ada.                                                       |
| #87   | K4-005  | EXTERNAL | Kontrak kandidat + store selesai; "empat tradisi" butuh saksi nyata/rights dan aturan review subject dari pemilik.                              |
| #88   | K5-004  | LOCAL    | Kontrak story/page lengkap; tidak ada model `episode` padahal judul kartu menyebutnya; dep K5-003 belum closed.                                 |
| #89   | M7.15   | EXTERNAL | Orchestrator baru ada di `dev`; `main` belum memilikinya dan environment `release` belum dibuat.                                                |
| #90   | K5-005  | LOCAL    | Validator hanya memeriksa struktur milik pemanggil; lookup keputusan tenant-scoped tepercaya + resolusi source belum ada.                       |
| #91   | K7-005  | LOCAL    | Boundary tool-free + fixture injeksi lolos dengan provider palsu; matriks fixture adversarial lebih luas masih lokal.                           |
| #92   | K7-002  | EXTERNAL | Survey + registry kosong + verifier ada; pemilik harus memilih, mengunduh, dan me-review lisensi artifact model.                                |
| #93   | K7-004  | LOCAL    | Envelope/store/rute ada; `research-review.routes.ts` belum punya binding kandidat (dep K3-005).                                                 |
| #94   | K7-006  | EXTERNAL | Baseline model-off jujur tercatat; metrik p50/p95 dan perbandingan source-tunggal mustahil sebelum #92 selesai.                                 |
| #95   | M6.07   | EXTERNAL | Preview artifact `dev` terbukti berulang; deploy `main` terpercaya pertama belum pernah sukses.                                                 |
| #96   | K8-002  | LOCAL    | Workbench + pratinjau komposisi ada; provenance original/derived, manajemen gambar, review, publikasi, halaman poster belum.                    |
| #97   | insiden | EXTERNAL | Koreksi kode sudah di `dev` (`d4f2d8a`, `8fc2dba`, `a2b6f21`); tutup hanya setelah `postgres-recovery` hijau di `main`.                         |

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

## Diagnosis dua lane CI yang merah pada `dev`

Lane `browser` (Board Playwright) merah dengan enam test gagal yang bukan satu penyebab:

- Satu assertion memang basi. `apps/board/e2e/public-home.spec.ts:12` mencari link bernama `/Open your workspace/`, sedangkan teks itu dihapus dari `apps/board/src/app/page.tsx` pada `1949751`. Perbaikan mengarahkan assertion ke CTA yang benar-benar ada, `Sign in to your workspace` dengan `href="/login"`. Dua arah sudah diverifikasi pada jalan lokal (platform `win32`, jadi tidak menyentuh baseline yang kalah): sebelum perbaikan `1 failed, 3 passed` dengan kegagalan tepat di `public-home.spec.ts:12:74`, sesudah perbaikan `4 passed (49.8s)` dan exit 0.
- Lima test lain (`visual-audit`) gagal karena baseline, bukan karena regresi tampilan. Inventory `apps/board/e2e/visual-audit.spec.ts-snapshots` mengukur 17 PNG: hanya 3 yang punya baseline `*-chromium-linux.png` (`board-list-desktop-1440-light`, `board-profile-desktop-1440-light`, `board-settings-desktop-1440-dark`, semuanya ditambahkan `336a19e` pada 2026-10-06), sedangkan 14 sisanya hanya ada untuk `win32`; `home-*` win32 ditambahkan `1949751` dan `workbench-*` win32 oleh `f038262`, keduanya hari ini. Artinya 11 snapshot yang benar-benar dibandingkan (`visual-audit.spec.ts:193-197` hanya memakai `toHaveScreenshot` untuk `home-mobile-390` dan `home-reference-1672`, sisanya 9 baseline `workbench-*`) tidak punya versi Linux; `home-tablet-768` dan `home-desktop-1440` memang tidak dibaseline, hanya disimpan sebagai screenshot audit.
- Ini melanggar aturan yang baru ditegakkan pada rentang `f6273b5`/`d9093dc`: baseline visual harus dirender runner (Linux), bukan workstation. `CI=true` menolak `--update-snapshots`, jadi tidak ada mekanisme yang menghasilkan baseline Linux dari kerja lokal; yang tersedia adalah dispatch capture di sisi runner, dan itu aksi pemilik. Mengopi PNG win32 ke nama linux atau menaikkan ambang toleransi akan membuat lane hijau tanpa membuktikan apa pun, jadi tidak dilakukan.

Lane `ui` merah karena satu anggaran, bukan kegagalan render: stylesheet `apps/ui-catalog` terukur 67.551 B raw terhadap `maxRawBytes` 65.536 B di `apps/ui-catalog/bundle-budget.json` (lebih 2.015 B) sementara gzip 13.300 B masih di bawah 16.384 B, dan JavaScript lolos kedua sisi (413.388 B dari 524.288 B; gzip 124.026 B dari 163.840 B). Budget tersebut dipasang sekali pada `b79cf3d` dan belum pernah dinaikkan. Pertumbuhannya terukur dari `packages/ui/src/styles/components.css` yang naik dari 16.691 B pada `main` (`9c9d5a3`) menjadi 27.416 B pada `dev`. Pilihannya adalah menaikkan `maxRawBytes` secara sadar atau memangkas ~2 KB CSS komponen; keduanya keputusan pemilik/desain, sehingga tidak diubah diam-diam oleh audit ini.

## Enam push setelah audit: lane yang jadi hijau dan satu anggaran yang memburuk

Push bertahap ke `dev` sejak audit ini ditulis: `1ee1a9d` (kelanjutan batch issue-sync yang melebihi cap), `6ba6dbf` (pengukuran ulang lane acceptance pasca-Next.js), `5277e31` (regenerasi referensi generated), `b654c26` (acceptance browser langkah 5 M11.09). Di antara keduanya ada kerja agen lain (`e697f1f`, `e6be76f` di `apps/ui-catalog`).

- Gerbang hosted `Roadmap issue sync` lulus pada setiap push: plan + apply success, dan read-back publik menunjukkan issue yang berubah saja yang ditulis. Run `39995402621` (head `b654c26`) memperbarui [#29](https://github.com/bjo163/moonwitness-xi/issues/29) pada 17:30:08Z dengan `Source SHA: b654c26…`; blok terkelolanya menampilkan `Work status: blocked` dengan blocker `Dependency M11.04 is not complete.` dan `Dependency M11.07 is not complete.`, sehingga acceptance langkah 5 yang baru tidak membuat issue ini bisa ditutup.
- Cabang continuation (`selection` > 5 task → `workflow_dispatch` lanjutan) masih belum terbukti secara hosted: daftar run `workflow_dispatch` sejak 17:00Z kosong (`total_count = 0`) karena setiap seleksi tetap di bawah cap. Yang terbukti hanyalah `prepare`/`dispatch` lokal (12 unit test) dan apply hosted yang benar-benar menulis.
- Lane CI pada run `39995617915` (head `e6be76f`): `quality` kini **hijau** — ini konfirmasi hosted bahwa regenerasi `5277e31` membereskan penyebab merah yang sebelumnya hanya bisa direproduksi lokal. `containers`, keempat job `automation`, `Gitleaks`, dan `CodeQL` juga hijau. `ui` gagal, `integration` dan `browser` masih berjalan saat catatan ini dibuat.
- Run berikutnya pada head `3e31723` (`39997107575`) menyelesaikan sebagian: `plan`, `quality`, `containers`, keempat `automation` **hijau**; `ui` **gagal**; `browser` **gagal**; `integration` masih berjalan saat read-back terakhir. Dua run sebelumnya (`39995411618`, `39995617915`) membatalkan `integration`/`browser` di tengah jalan, jadi sampai kini tidak ada satu pun verdict `integration` untuk head-head hari ini.
- Penyebab pembatalan itu struktural dan terlihat di source: `.github/workflows/ci.yml:17-19` memakai `group: ci-<base_ref>-<event>` dengan `cancel-in-progress: true`. Semua push ke `dev` berbagi satu grup, sehingga push berikutnya (punya saya maupun agen lain) selalu memotong lane panjang yang sedang jalan. Implikasi praktis untuk pemilik: satu verdict `integration`/`browser` yang utuh memerlukan jendela tanpa push, atau lane itu dijalankan sendiri lewat `browser-matrix`/`deep-regression` yang grupnya terpisah. Mengubah `cancel-in-progress` akan menambah konsumsi runner, jadi tidak dilakukan di sini.
- Job `ui` gagal tepat satu step (`Enforce tested JavaScript and CSS bundle budgets`) dan akibatnya step `Test UI catalog interactions, WCAG, and visual contract` berstatus `skipped` — pola yang sama dengan yang dicatat di [M9.08 evidence](M9.08.md), kini terlihat pada runner.
- Lane `browser` pada run yang sama: step `Run Board browser tests` (`ci.yml:269`) **failure** dengan tepat lima test `visual-audit` yang dinamai annotation-nya (`responsive protected screens…`, `empty and unavailable story workbench states…`, `story workbench editor and preview…`, `story workbench masthead…`, `homepage spelling, responsive layout, and reference screenshots`), dan step berikutnya `Test documentation portal routing, search, and responsive navigation` (`ci.yml:277`, yaitu `pnpm test:docs-portal`) berstatus `skipped`.
- Konsekuensi struktural yang perlu dicatat, bukan diperbaiki diam-diam: dua lane punya pola "step pertama merah menyembunyikan bukti berikutnya". Di `ui`, anggaran ukuran menekan bukti interaksi/WCAG/visual katalog; di `browser`, kegagalan step Board menekan seluruh acceptance portal dokumen — termasuk acceptance langkah 5 M11.09 yang baru lolos lokal. Annotation hanya menyebut nama test, jadi penyebab gagal tidak terbaca dari API anonim; yang terbaca adalah urutannya. Keduanya hanya bisa dibuka dari sisi runner (baseline Linux + keputusan anggaran), jadi tidak ada perubahan `if:`/order step yang dilakukan audit ini.
- Anggaran `ui-catalog` diukur ulang pada head yang sama (`pnpm --filter @moonwitness/ui-catalog build` lalu `node scripts/check-ui-catalog-budget.mjs`): Stylesheet **76.838 B** raw terhadap `maxRawBytes` 65.536 B (lebih **11.302 B**), gzip 14.999 B terhadap 16.384 B (lolos, sisa 1.385 B); JavaScript 423.868 B / 126.533 B lolos kedua sisi. Antara `5277e31` dan `e6be76f` satu-satunya sumber CSS yang berubah adalah `apps/ui-catalog/src/styles.css` (14.016 B → 20.574 B, +6.558 B) Sementara `packages/ui/src/styles/components.css` tetap 27.416 B. overrun ini karena itu didorong stylesheet demo katalog, bukan paket design-system bersama.
- Tidak ada guard yang dilonggarkan: `maxRawBytes` tidak dinaikkan, `blockExoticSubdeps` tidak dimatikan, dan ambang visual tidak diubah. Angka 11.302 B ini juga bergerak — dua commit `ui-catalog` hari ini menambah ~9 KB CSS, jadi keputusan pemilik perlu diukur ulang saat merge.
- Kelas `CLOSEABLE` tetap 0 dan tidak ada issue yang ditutup hari ini: tidak satu pun issue punya acceptance yang terbukti lengkap tanpa aksi pemilik (promosi `main`, akses Actions, Projects, Release baseline, keputusan konten/privasi).
- Empat baris tabel audit ini sendiri ternyata basi dan sudah dikoreksi, bukan dibiarkan: #67 dan #54 (pembatasan batch 3 kandidat dan bukti per kandidat major) sudah ada di source sejak `fdfa432` dengan teks schedule dikoreksi `1a3abd4`; #33 (matriks coverage) dan #37 (hitung tes Board) sudah diukur ulang di `6ba6dbf`. Barisnya ditulis ulang mengikuti keadaan source, sehingga sisa pekerjaannya terbaca benar oleh pemilik.

## Aksi yang ditunggu dari pemilik repo

1. Review dan merge PR #51 (`dev` → `main`) setelah semua check hijau — ini gerbang tunggal untuk #26, #50, #59, #97 dan aktivasi schedule `main`.
2. Berikan akses baca artifact/log + `workflow_dispatch` + `issues:write` untuk reconciler (#25, #28, #34, #47, #76, #95).
3. Disposition alert CodeQL/Trivy privat dan temuan credential historis (#31, #32, #43).
4. Terbitkan Release baseline untuk tag `v1.0.0-rc.1` (#30, #35, #89).
5. Keputusan konten: sumber RUH/HIZAB dan saksi empat tradisi (#75, #87), target verifikasi K3-007 (#72), kebijakan retensi/privasi (#79, #83), pemilihan artifact model lokal (#92 → #94).
6. Putuskan anggaran stylesheet `ui-catalog` pada `dev` terkini: raw 76.838 B terhadap 65.536 B (lebih 11.302 B, gzip masih lolos). Naikkan `maxRawBytes` secara sadar, atau minta potongan CSS demo katalog ≥ 11,3 KB; sampai salah satu dipilih, step interaksi/WCAG/visual katalog tetap `skipped` di lane `ui`.
7. Capture baseline visual `*-chromium-linux.png` di runner (`workflow_dispatch` capture) untuk snapshot Board yang belum punya baseline Linux, termasuk dua diff workbench; tanpa ini lane `browser` tidak bisa hijau.
8. Konfigurasikan GitHub App least-privilege atau persempit preflight intake, karena lane `ci-technical-gate`/intake memerah 22 run hanya karena preflight gagal membaca permission.
9. Jalankan probe GitHub Projects dengan token yang punya `projects: read` untuk menutup #29/M11.09 langkah 2 (upsert idempoten per node ID) — anonim selalu `403`.
