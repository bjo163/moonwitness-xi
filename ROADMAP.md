# MoonWitness — Master Delivery Checklist

Dokumen ini adalah sumber utama rencana lintas milestone. Dibuat 2026-10-04 berdasarkan seluruh rencana yang disepakati. Checkbox kosong berarti belum diverifikasi selesai, termasuk fitur yang implementasi awalnya sudah ada.

**Panduan implementasi lengkap:** [docs/roadmap/README.md](docs/roadmap/README.md). Seluruh 148 ID di bawah mempunyai kartu kerja dengan prasyarat, source files, deliverable, langkah konkret, dan acceptance. Agen harus membaca [protokol eksekusi](docs/roadmap/EXECUTION.md) sebelum mengambil tugas. Dependensi terstruktur tersedia di [tasks.json](docs/roadmap/tasks.json); status resmi tetap checklist ini.

Urutan nomor bukan urutan aktivasi mutlak: misalnya required checks M1.06 baru diaktifkan setelah ci-gate M2.05 tersedia. Kontrak automation, spesifikasi UI/asset, skenario test minimum, dan template bukti ada pada panduan detail.

## Aturan tetap

- Hanya dua branch pada repository asal: `main` dan `dev`. Aturan ini menggantikan preferensi sebelumnya yang hanya memakai `main`.
- `dev` untuk integrasi; `main` untuk hasil stabil. Jangan membuat branch fitur, bot, release, hotfix, atau `gh-pages` pada repository asal.
- Tidak ada deployment aplikasi ke staging maupun production dalam scope ini. Publikasi GitHub Release, image GHCR, dan dokumentasi GitHub Pages tetap termasuk scope.
- Kode typed ketat: jangan menambahkan explicit `any`, type assertion tanpa dasar, atau pengecualian lint luas untuk melewatkan pemeriksaan.
- Schema dan seed dikelola programatis melalui addon; tidak memperkenalkan sistem migration SQL tradisional. Perubahan destruktif tetap membutuhkan rencana kompatibilitas dan pemulihan.
- Sentralisasi berdasarkan tanggung jawab nyata. Jangan menambah package atau abstraksi hanya untuk memindahkan kode.
- Semua addon baru mempunyai manifest, akses, view/menu yang relevan, dokumentasi, seed contoh yang aman, dan test perilaku.
- Seed teknis yang merepresentasikan aktivitas nyata, seperti audit log, tidak dipalsukan. Pisahkan data wajib dan data demo serta kontrol aktivasi demo.
- Automation harus idempotent, memiliki hak minimum, tidak menimpa perubahan pengguna, dan dapat dilanjutkan setelah kegagalan.
- Tidak ada klaim semua fitur teruji tanpa matriks cakupan dan bukti pemeriksaan.
- Setiap unit pekerjaan yang selesai harus diverifikasi, di-commit dan di-push ke dev; main melalui promotion gate. No-op tidak membutuhkan commit kosong. Version bump mengikuti substantive release batch, bukan setiap commit.
- GitHub Issues memproyeksikan task dan evidence secara idempotent; diskusi manusia dipertahankan. Pushed, in-main, complete, dan released tidak disamakan.

## Cara menggunakan checklist

- ID item stabil; gunakan ID dalam commit, laporan, dan issue terkait.
- Untuk menutup item, catat commit/PR, test atau workflow, serta keterbatasan yang masih ada pada log bukti di akhir dokumen.
- Status kerja: belum mulai, berjalan, terblokir, atau selesai. Hambatan harus menyebut dependensi atau informasi yang dibutuhkan.
- Fitur yang belum ditemukan dalam inventarisasi ditambahkan ke matriks, bukan diasumsikan tercakup.
- Keputusan yang berubah dicatat beserta alasan. Jangan menghapus pekerjaan tertunda hanya untuk menutup milestone.
- Jalur paralel: A GitHub/release; B Board/E2E; C backend; D docs/Pages; E design system; F Issues/delivery. Tetapkan kepemilikan file agar edit paralel tidak bertabrakan.
- Dokumen ini merupakan rencana; pembuatannya tidak mengaktifkan workflow, mengubah ruleset, atau menerbitkan release.

## M0 — Inventarisasi dan baseline (prasyarat semua jalur)

- [x] M0.01 Inventarisasi package, model, endpoint, view, menu, akses, seed, scheduler, worker, outbox, import/export, dan attachment yang benar-benar tersedia. Bukti: [M0.01](docs/roadmap/evidence/M0.01.md).
- [x] M0.02 Buat matriks fitur → role/company → skenario sukses/gagal → unit/integration/E2E → bukti → gap. Bukti: [M0.02](docs/roadmap/evidence/M0.02.md).
- [x] M0.03 Rekam baseline typecheck, lint, format, build, test, coverage, bundle, performa, dan warning. Pisahkan kegagalan dari test yang skipped. Bukti: [M0.03](docs/roadmap/evidence/M0.03.md).
- [x] M0.04 Audit GitHub settings, workflows, permissions, Pages, registry, rulesets, status checks, dan ketersediaan fitur akun tanpa menampilkan secret. Bukti: [M0.04](docs/roadmap/evidence/M0.04.md).
- [x] M0.05 Audit ukuran/duplikasi, penggunaan dependency, dan siklus tersedia di [refactor map](docs/engineering/refactor-map.md), dapat diulang dengan `pnpm audit:workspace`. Bukti: [M0.05](docs/roadmap/evidence/M0.05.md).
- [ ] M0.06 Versi Node/pnpm/PostgreSQL/browser, budget, dan retensi dicatat di [support policy](docs/engineering/support-policy.md); bukti kini mencakup Chromium dan 9 run full CI, tetapi butuh 10 sampel dan verifikasi retensi log sebelum item dicentang.
- [x] M0.07 Dokumentasikan keputusan arsitektur: versi monorepo bersama, dua branch, model promosi, sumber metadata, dan batas package. Bukti: [ADR 0001](docs/decisions/0001-platform-contracts.md).
- [x] M0.08 Fresh install seed tepat 2 user + 10 partner (12 record utama); pertahankan partner existing pada upgrade, dan buktikan reinstall tidak menggandakan/menimpa edit. Bukti: [M0.08](docs/roadmap/evidence/M0.08.md).

## M1 — Governance dua branch (jalur A; setelah M0)

- [x] M1.01 Buat `dev` dari commit `main` yang tervalidasi, setelah memeriksa branch remote aktual. Bukti: [M1.01](docs/roadmap/evidence/M1.01.md).
- [x] M1.02 Batasi pembuatan branch selain `main`/`dev` melalui ruleset yang didukung repository. Bukti: [M1.02–M1.06](docs/roadmap/evidence/M1.02-06.md).
- [x] M1.03 Lindungi kedua branch dari deletion dan force-push; dokumentasikan akses darurat yang sempit dan dapat diaudit. Bukti: [M1.02–M1.06](docs/roadmap/evidence/M1.02-06.md).
- [x] M1.04 Batasi promosi `main` melalui PR `dev → main`; validasi sumber PR dengan check wajib. Bukti: [M1.02–M1.06](docs/roadmap/evidence/M1.02-06.md).
- [x] M1.05 Buat satu PR promosi otomatis; gunakan merge commit dan jangan auto-delete `dev`. PR #1 auto-merged setelah `ci-gate`; bukti: [M1.02–M1.06](docs/roadmap/evidence/M1.02-06.md).
- [x] M1.06 Tetapkan required checks yang stabil dan tidak deadlock akibat filter path atau job skipped. Bukti: [M1.02–M1.06](docs/roadmap/evidence/M1.02-06.md).
- [ ] M1.07 Atur CODEOWNERS untuk workflow, auth, akses, schema, dan release; tetapkan reviewer realistis sesuai jumlah maintainer.
- [ ] M1.08 Tentukan kebijakan promosi: patch/minor kompatibel bisa otomatis; breaking change, perubahan destruktif, dan perubahan kebijakan keamanan memerlukan persetujuan eksplisit.
- [x] M1.09 Sinkronkan `main → dev` tanpa force-push; perubahan bersamaan atau konflik menghasilkan laporan, bukan overwrite. Push + rekonsiliasi terjadwal + trigger manual terbukti pada run 37172778791.
- [ ] M1.10 Lindungi tag release dari pemindahan/penghapusan rutin; periksa drift ruleset dan settings.
- [ ] M1.11 Hapus alur staging/production deployment yang tidak digunakan; pertahankan smoke test lokal runner.
- [ ] M1.12 Pastikan updater dependency, generator docs, dan release bot tidak membuat branch ketiga; dokumentasikan keterbatasan strict two-branch untuk kolaborasi.

## M2 — CI terpusat dan paralel (jalur A; kontrak M0)

- [x] M2.01 Sediakan reusable setup/workflow agar CI, release, dan scheduled checks memakai konfigurasi yang sama. Bukti: [M2.01](docs/roadmap/evidence/M2.01.md), [CI 37164299898](https://github.com/bjo163/moonwitness-xi/actions/runs/37164299898).
- [x] M2.02 Standarkan root scripts: typecheck, lint, format:check, test:unit, test:integration, test:e2e, docs:check, verify. Bukti: [M2.02](docs/roadmap/evidence/M2.02.md), [CI 37167792644](https://github.com/bjo163/moonwitness-xi/actions/runs/37167792644).
- [x] M2.03 Sertakan typecheck dan lint Board secara eksplisit; selaraskan ESLint/Oxlint agar aturan tidak saling bertentangan. Bukti: [M2.03](docs/roadmap/evidence/M2.03.md). _Cleanup seluruh overlap/warning masih terbuka._
- [x] M2.04 Pisahkan job quality, unit, PostgreSQL integration, browser, security, docs, container, dan release integrity. Bukti: [M2.04](docs/roadmap/evidence/M2.04.md), [CI 37167792644](https://github.com/bjo163/moonwitness-xi/actions/runs/37167792644). _Docs/security belum punya job hingga command/automation contract tersedia._
- [x] M2.05 Tambahkan `ci-gate` yang memahami success/failure/cancelled/skipped dan menjadi keputusan akhir. Bukti: [M2.05](docs/roadmap/evidence/M2.05.md). _Aktivasi sebagai required status check masih M1.06._
- [x] M2.06 Required PostgreSQL tests harus gagal jika konfigurasi test hilang; tidak boleh diam-diam skipped pada CI wajib. Bukti dan run: [M2.06](docs/roadmap/evidence/M2.06.md), [CI 37164074612](https://github.com/bjo163/moonwitness-xi/actions/runs/37164074612).
- [x] M2.07 Pakai database dan akun fixture terisolasi per run; seed deterministik, cleanup, dan jangan menyentuh database pengguna. Bukti: [M2.07](docs/roadmap/evidence/M2.07.md), [CI 37167792644](https://github.com/bjo163/moonwitness-xi/actions/runs/37167792644).
- [x] M2.08 Cache dependency/build; affected testing memperhitungkan transitive dependents dan shared config. Promosi menjalankan suite penuh. Bukti: [M2.08](docs/roadmap/evidence/M2.08.md), [full CI 37169257765](https://github.com/bjo163/moonwitness-xi/actions/runs/37169257765), [affected docs CI 37169412621](https://github.com/bjo163/moonwitness-xi/actions/runs/37169412621).
- [x] M2.09 Atur timeout, concurrency, pembatalan run usang, dan serialisasi penulisan branch/release. Bukti: [M2.09](docs/roadmap/evidence/M2.09.md), [stale CI cancellation 37171696638](https://github.com/bjo163/moonwitness-xi/actions/runs/37171696638), [release verify 37172005570](https://github.com/bjo163/moonwitness-xi/actions/runs/37172005570), [queued verify 37172007276](https://github.com/bjo163/moonwitness-xi/actions/runs/37172007276).
- [ ] M2.10 Hasilkan test report, coverage, job summary, serta log/trace yang disanitasi dengan retensi terbatas.
- [ ] M2.11 Validasi YAML/workflow dan shell scripts; periksa lockfile frozen dan reproducibility generator.
- [ ] M2.12 Terapkan kebijakan flaky tests: diagnosis, pemilik, tenggat; retry terbatas tidak boleh menyembunyikan regresi.
- [ ] M2.13 Ukur baseline coverage bagian kritis dan tetapkan threshold bertahap yang bermakna, bukan angka global arbitrer.

## M3 — Board: audit visual dan E2E (jalur B; paralel dengan A/C)

- [x] M3.01 Siapkan browser automation yang dapat dijalankan lokal dan GitHub runner; gunakan API dan PostgreSQL sungguhan untuk alur kritis. Bukti: [M3.01](docs/roadmap/evidence/M3.01.md), [CI 37167792644](https://github.com/bjo163/moonwitness-xi/actions/runs/37167792644).
- [ ] M3.02 Audit desktop/mobile, light/dark, overflow, fokus keyboard, kontras, label, dan navigasi screen reader dasar.
- [ ] M3.03 Test login sukses/gagal, logout, reload, expiry, refresh bersamaan, sesi dicabut, dan user nonaktif.
- [ ] M3.04 Test sidebar, command palette, dashboard, direct URL, Development Mode dan persistensinya; semua mengikuti metadata/akses yang sama.
- [ ] M3.05 Test profil sendiri, language/timezone, ganti password, login ulang, dan error validasi.
- [ ] M3.06 Test list/search/filter/sort/pagination/count, termasuk regresi `partner,language` dan count PostgreSQL.
- [ ] M3.07 Test create/edit/archive/delete sesuai kebijakan model, field relasi, serta filter country/state.
- [ ] M3.08 Test import/export, attachment, activities, dan fitur Board lain jika ditemukan dalam inventarisasi.
- [ ] M3.09 Uji error/empty/loading states, jaringan terputus, stale data, double submit, dan pencegahan kebocoran cache antar-user/company.
- [ ] M3.10 Simpan screenshot/trace saat gagal; buat visual baseline setelah audit manusia dan jangan auto-accept perubahan baseline.
- [ ] M3.11 Jalankan browser utama pada perubahan rutin dan browser tambahan pada regresi terjadwal; dokumentasikan coverage browser.

## M4 — Backend, ORM, base, dan reliability (jalur C)

- [ ] M4.01 Validasi semua model/field/relasi/view/menu/access dan kebijakan seed melalui matriks metadata.
- [ ] M4.02 Test instalasi bersih, restart idempotent, upgrade legacy, seed reference, pelestarian edit pengguna, dan startup multi-replica.
- [ ] M4.03 Verifikasi default system/superadmin, password awal dari konfigurasi, reset CLI/root script, dan tidak menimpa password yang sudah diubah.
- [ ] M4.04 Verifikasi company default, reference countries, states, banks, partner bank, serta provenance/update policy data referensi; jangan mengklaim states lengkap bila hanya subset.
- [ ] M4.05 Audit autentikasi: hashing, enumeration, throttling, refresh replay/concurrency, perubahan role/password, dan batas waktu revocation access token.
- [ ] M4.06 Test izin negatif CRUD/count/export/direct API dan isolasi company, termasuk relasi lintas-company.
- [ ] M4.07 Batasi pagination, query cost, kedalaman eager relations, payload, sorting, dan filter; cegah mass assignment.
- [ ] M4.08 Pastikan field sensitif tidak muncul dalam JSON, export, audit, error, atau log.
- [ ] M4.09 Audit transaksi, constraint, indexes, concurrency edits, timezone, error mapping, dan rollback kegagalan upgrade programatis.
- [ ] M4.10 Scheduler/worker: claim atomik, lease, heartbeat, retry/backoff, recovery setelah crash, cancellation, dead-letter, dan job history.
- [ ] M4.11 Outbox: transactional enqueue, delivery retries, deduplication/idempotency, dan pengujian efek eksternal ganda; jangan mengklaim exactly-once tanpa bukti.
- [ ] M4.12 Attachment: izin upload/download, size/MIME, filename/path traversal, storage ownership, dan retensi.
- [ ] M4.13 Operasional: graceful shutdown, DB pools/timeouts, request ID, redaksi log, readiness/liveness API dan worker.
- [ ] M4.14 Restore drill dengan data aplikasi, relasi, akun test dan integrity checks; tetapkan target pemulihan berbasis hasil pengukuran.
- [ ] M4.15 Tambahkan baseline load/query tests dan budget regresi realistis; ukur N+1 serta operasi yang memperbesar penggunaan memori.
- [ ] M4.16 Dokumentasikan compatibility policy API/addon, deprecation, dan upgrade guidance.

## M5 — Design system dan asset milik project (jalur E)

- [ ] M5.01 Inventarisasi UI Board; tentukan arah visual MoonWitness dan audit contoh halaman representatif sebelum migrasi massal.
- [ ] M5.02 Buat `@moonwitness/assets`: logo simbol/wordmark/lockup, versi terang/gelap/monokrom, favicon dan social image.
- [ ] M5.03 Buat tokens warna/semantik, tipografi, spacing, radius, shadow, motion, dan reduced-motion; dokumentasikan aturan penggunaan.
- [ ] M5.04 Buat ikon SVG konsisten untuk domain inti dan aksi umum; audit keterbacaan ukuran kecil serta identitas yang berbeda dari brand lain.
- [ ] M5.05 Sediakan ikon React typed dengan currentColor, ukuran, title, dan aksesibilitas; gunakan static SVG untuk README.
- [ ] M5.06 Buat ilustrasi original empty/search/error/access denied/offline/onboarding serta pola latar ringan.
- [ ] M5.07 Catat sumber/lisensi font dan asset; optimasi SVG, validasi script/external refs, dan cegah ID collision.
- [ ] M5.08 Buat `@moonwitness/ui` dengan exports jelas, tanpa dependency API/router/auth aplikasi dan tanpa side effect yang tidak terdokumentasi.
- [ ] M5.09 Komponen dasar: button/input/select/checkbox/badge/avatar; interaksi: dialog/dropdown/tabs/tooltip/toast.
- [ ] M5.10 Komponen komposisi: field/help/error, card/skeleton/empty/error state, page header/toolbar/panel, pagination/table primitives.
- [ ] M5.11 Tetapkan theming dan compatibility policy komponen; hindari boolean props berlebihan dan barrel export yang membesarkan bundle.
- [ ] M5.12 Grafik data: tema, tooltip/legend, locale/timezone, loading/empty/error, tabel alternatif, dan responsivitas. Bentuk `@moonwitness/charts` hanya ketika reuse membenarkannya.
- [ ] M5.13 Diagram arsitektur/relasi/alur: generate dari metadata bila tepat; kurasi diagram penjelasan agar terbaca.
- [ ] M5.14 Migrasikan shell/login/profile/settings/list/form Board bertahap; hapus duplikasi dan dependency yang benar-benar tidak terpakai.
- [ ] M5.15 Gunakan sumber asset/tokens yang sama pada README dan Pages; ekspor statis sesuai kemampuan platform.
- [ ] M5.16 Buat katalog komponen dengan variasi panjang teks, states, themes, keyboard dan ukuran layar; publikasikan bersama dokumentasi.
- [ ] M5.17 CI UI: typecheck, interaction/a11y, visual regression, SVG validation, export checks, dan bundle budget.

## M6 — Dokumentasi dan GitHub Pages (jalur D; kontrak metadata M0)

- [ ] M6.01 Buat struktur docs: quickstart, architecture, addon development, API, models, Board, jobs/outbox, security, troubleshooting, recovery, release/upgrade.
- [ ] M6.02 Buat generator deterministik package/scripts/env schema/model/field/relasi/menu/access/seed dan referensi endpoint yang benar-benar valid.
- [ ] M6.03 Pisahkan blok generated README dari penjelasan manual; jangan overwrite seluruh dokumen.
- [ ] M6.04 Standardisasi docs:generate, docs:check, docs:build, docs:links; gagal saat hasil generator stale.
- [ ] M6.05 Uji contoh executable dan tautan internal; link eksternal memakai kebijakan retry agar gangguan pihak lain tidak membuat flakiness berlebihan.
- [ ] M6.06 Buat portal responsif dengan search, base path repository, 404, branding, dan katalog UI.
- [ ] M6.07 Gunakan Actions artifact untuk Pages tanpa branch tambahan; dev hanya menghasilkan preview artifact.
- [ ] M6.08 Publikasikan dokumentasi stable yang sesuai release; tentukan retensi versi dokumentasi dan URL latest.
- [ ] M6.09 Scan konten publik agar tidak berisi secret, data pribadi, real environment values, atau internal artifacts.
- [ ] M6.10 Docs-only changes dapat dipublikasikan setelah verifikasi tanpa memaksa release aplikasi; source SHA harus terlacak.
- [ ] M6.11 Pisahkan retry Pages dari release aplikasi; kegagalan docs tercatat dan tidak menghasilkan tag/version baru.

## M7 — Version, changelog, release otomatis (jalur A; setelah gate siap)

- [ ] M7.01 Terapkan Conventional Commits dan definisi patch/minor/major/non-release secara konsisten.
- [ ] M7.02 Tetapkan satu versi monorepo bersama; sinkronkan root/workspaces/lockfile/metadata yang relevan.
- [ ] M7.03 Putuskan transisi `1.0.0-rc.1` ke stable secara eksplisit; jangan auto-publish stable hanya karena automation baru aktif.
- [ ] M7.04 Hitung versi dari release terakhir dan perubahan fungsional; abaikan commit generator/sync untuk mencegah release loop.
- [ ] M7.05 Siapkan version/changelog/docs pada dev tanpa release branch; persiapan berulang harus idempotent.
- [ ] M7.06 Changelog berisi fitur/fix/security/breaking/upgrade dan tautan commit/PR; breaking notes divalidasi.
- [ ] M7.07 Jalankan CI lengkap pada commit hasil persiapan; verifikasi lagi main merge SHA sebelum publikasi.
- [ ] M7.08 Gunakan concurrency lock dan pengecekan expected SHA sebelum bot menulis; perubahan dev baru membatalkan rencana lama.
- [ ] M7.09 Bangun sekali artefak release dari SHA tervalidasi lalu promosikan artefak yang sama; jangan rebuild tanpa verifikasi identitas.
- [ ] M7.10 Buat tag immutable, draft/release completion flow, changelog, checksums, GHCR API/Board, SBOM dan provenance attestations.
- [ ] M7.11 Tag image memakai versi/SHA; update latest hanya setelah seluruh artefak wajib berhasil. Tidak deploy aplikasi.
- [ ] M7.12 Verifikasi provenance/digest dan dokumentasikan cara konsumen memeriksanya.
- [ ] M7.13 Retry release yang sama melanjutkan aset kurang tanpa bump/tag/release duplikat atau overwrite aset berbeda.
- [ ] M7.14 Uji race, partial publish, upload gagal, token expired, tidak ada perubahan releasable, dan kegagalan sinkronisasi branch.
- [ ] M7.15 Rancang trigger eksplisit melalui reusable workflow/dispatch; jangan mengandalkan event GITHUB_TOKEN yang tidak memicu workflow berikutnya.
- [ ] M7.16 Sediakan dry-run/release-plan artifact sebelum publikasi pertama dan tautkan seluruh bukti ke release.

## M8 — Security dan maintenance automation (jalur A/C)

- [ ] M8.01 Default workflow read-only; scoped writes untuk bot/promosi/release/Pages dan gunakan GitHub App bila dibutuhkan.
- [ ] M8.02 Pin external Actions ke SHA tervalidasi, perbarui berkala; pisahkan eksekusi kode tak tepercaya dari job berkredensial.
- [ ] M8.03 Aktifkan code/dependency/secret scanning yang tersedia; scan container dan tetapkan severity policy serta exception beralasan dengan expiry.
- [ ] M8.04 Simpan dokumentasi satu kali konfigurasi App/settings; jangan menyimpan credential bot dalam repo.
- [ ] M8.05 Updater mingguan menyiapkan dependency runtime/dev/actions dalam kelompok; tidak membuat branch ketiga.
- [ ] M8.06 Uji kandidat update sebelum menulis ke dev; periksa SHA asal, serialisasi bot writes, dan jangan mencampur beberapa major upgrade.
- [ ] M8.07 Patch/minor tetap melewati suite penuh dan promosi; major update menghasilkan laporan kompatibilitas sebelum diterapkan.
- [ ] M8.08 Scheduled regression: browser tambahan, schema upgrade, jobs recovery, application restore drill, dan security rescan.
- [ ] M8.09 Jadwalkan issue pemeliharaan tanpa spam; deduplikasi failure issue, perbarui recovery, dan jangan auto-close laporan keamanan hanya karena sudah lama.
- [ ] M8.10 Audit retensi artifacts/logs, registry growth, biaya Actions, permission drift, dan toolchain end-of-support.
- [ ] M8.11 Definisikan security reporting, incident response, credential rotation, dan release correction procedure.

## M9 — Perluasan addon setelah fondasi terbukti

Gate: audit fitur existing sebelum membuat package. Jalankan berurutan berdasarkan kebutuhan; jangan mengembangkan seluruh domain sekaligus.

- [ ] M9.01 Evaluasi `orm-notification`: preferences, templates, inbox, delivery status; reuse jobs/outbox dan cegah pengiriman contoh ke penerima nyata.
- [ ] M9.02 Evaluasi `orm-storage`: storage adapters, attachment ownership/download/retention; migrasikan dengan kompatibilitas data existing.
- [ ] M9.03 Evaluasi `orm-workflow`: state transition, approval policy, authorization, history, timeout, dan audit.
- [ ] M9.04 Evaluasi `orm-integration`: webhook subscriptions, scoped credential references, signing, idempotency, delivery/retry; validasi tujuan request untuk menghindari SSRF.
- [ ] M9.05 Evaluasi `orm-organization`: departments, teams, positions, memberships dan manager berdasarkan kebutuhan produk.
- [ ] M9.06 Bangun satu addon bisnis contoh (request/approval atau CRM sederhana) untuk membuktikan extensibility tanpa perubahan core berulang.
- [ ] M9.07 Untuk tiap addon: manifest/dependencies, minimal public API, access isolation, views/menu, required/demo seeds, docs, upgrade path, tests, dan compatibility policy.
- [ ] M9.08 Audit ukuran base/API/Board setelah ekstraksi; package baru harus mengurangi coupling atau menghasilkan reuse yang terbukti.

## M10 — Acceptance dan pembuktian satu siklus nyata

- [ ] M10.01 Semua fitur inventarisasi punya status coverage; gap eksplisit mempunyai pemilik dan prioritas.
- [ ] M10.02 Audit visual Board selesai dan bukti screenshot tersimpan; browser E2E tidak sekadar mengecek halaman terbuka.
- [ ] M10.03 Lint/types/build/tests dan seluruh required checks lolos pada commit yang dipromosikan.
- [ ] M10.04 PostgreSQL integration benar-benar berjalan; upgrade, relasi/count, seed, dan izin negatif teruji.
- [ ] M10.05 Image API/Board berjalan pada runner; health/readiness/shutdown dan konfigurasi container terverifikasi.
- [ ] M10.06 Simulasi gagal membuktikan promosi/release diblokir; rerun tidak membuat duplikasi atau workflow loop.
- [ ] M10.07 Satu siklus dev → main → version/tag/release/artifacts/Pages → sync dev terbukti dengan bukti SHA dan run URL.
- [ ] M10.08 Hanya main/dev ada pada repository asal; tidak ada workflow deployment aplikasi yang aktif.
- [ ] M10.09 README/Pages/asset catalog sesuai source dan release; tidak ada secret atau data pengguna dalam output publik.
- [ ] M10.10 Tetapkan recurring maintenance di bawah dan catat keterbatasan tersisa sebelum milestone dinyatakan selesai.

## M11 — Roadmap Issues, commit/push dan auto-promotion (jalur F)

Jalur ini melengkapi M1/M7/M8, bukan membuat release pipeline kedua. Detail: [kartu M11](docs/roadmap/11-issues-delivery.md) dan [kontrak sinkronisasi](docs/roadmap/ISSUE-SYNC-CONTRACT.md).

- [ ] M11.01 Tetapkan kontrak sinkronisasi roadmap ↔ GitHub Issues dan otoritas setiap field.
- [ ] M11.02 Buat schema task tracking, identitas issue stabil, dan validator silang dokumen.
- [ ] M11.03 Buat planner dry-run dan apply mode untuk create/update issue tanpa duplikasi.
- [ ] M11.04 Sinkronkan isi issue lengkap, milestone, labels dan dependencies yang dapat ditelusuri.
- [ ] M11.05 Pelihara catatan manusia saat bot memperbarui issue.
- [ ] M11.06 Buat workflow sync terjadwal, push-triggered dan manual dengan batching/rate-limit handling.
- [ ] M11.07 Implementasikan lifecycle issue berdasarkan evidence, commit, CI, promosi dan release.
- [ ] M11.08 Terima perubahan status dari maintainer tanpa memberikan eksekusi kode melalui issue.
- [ ] M11.09 Buat dashboard kemajuan dan GitHub Projects projection bila tersedia.
- [ ] M11.10 Buat/perbarui PR dev → main otomatis dengan daftar task, hasil test, release plan dan risiko.
- [ ] M11.11 Aktifkan auto-merge profesional dengan expected SHA, required checks dan review policy.
- [ ] M11.12 Terapkan aturan commit dan push per unit pekerjaan yang selesai.
- [ ] M11.13 Gabungkan commit/push, version bump, docs dan issue sync tanpa release loop.
- [ ] M11.14 Uji seluruh siklus roadmap → issue → commit → CI → PR → merge → release → status.
- [ ] M11.15 Sediakan runbook audit/recovery dan pemeriksaan drift issue/roadmap.

## Pemeliharaan jangka panjang

| Frekuensi        | Pekerjaan                                                                             | Bukti                              |
| ---------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| Setiap perubahan | Quality, test relevan, docs drift, security checks                                    | CI summary pada SHA                |
| Setiap promosi   | Suite penuh, versi/changelog, kontrak/kompatibilitas                                  | Promotion gate                     |
| Setiap release   | Artefak immutable, provenance, Pages, sinkronisasi branch                             | Release manifest + run URL         |
| Mingguan         | Dependency candidates, security rescan, browser/regression tambahan                   | Maintenance summary                |
| Bulanan          | Restore drill, permission drift, flaky tests, bundle/performance trend, biaya/retensi | Review dengan tindakan             |
| Kuartalan        | Dukungan runtime, threat model, arsitektur package, aksesibilitas, relevance roadmap  | Keputusan dan prioritas diperbarui |

Jadwal GitHub bersifat best-effort; selalu sediakan manual dispatch dan pemeriksaan run yang terlewat. Automation tidak menggantikan pemantauan runtime aplikasi.

## Log bukti dan keputusan

| Tanggal    | Item        | Status  | Commit / run / artefak | Catatan                                        |
| ---------- | ----------- | ------- | ---------------------- | ---------------------------------------------- |
| 2026-10-04 | Master plan | Disusun | ROADMAP.md             | Belum mengaktifkan implementasi milestone baru |
