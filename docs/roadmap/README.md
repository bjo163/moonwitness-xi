# Panduan Roadmap MoonWitness

Roadmap ini terdiri dari 148 kartu kerja. Jangan mencoba mengimplementasikan seluruh isi sekaligus. Pilih satu kartu yang prasyaratnya selesai, kerjakan sampai bukti penerimaannya lengkap, lalu lanjutkan kartu berikutnya.

## Urutan membaca untuk agen baru

1. Baca [master checklist](../../ROADMAP.md) untuk scope, keputusan pengguna dan status terbaru.
2. Baca [EXECUTION.md](EXECUTION.md) untuk prosedur kerja, validasi, dan handoff.
3. Pilih ID melalui [tasks.json](tasks.json). Index ini berisi judul, dependensi, file detail dan deliverable; status bukan disimpan di JSON.
4. Buka kartu pada dokumen milestone di bawah dan baca sumber kode yang disebutkan.
5. Untuk pekerjaan automation, baca [AUTOMATION-CONTRACTS.md](AUTOMATION-CONTRACTS.md).
6. Untuk desain dan UI, baca [DESIGN-SPEC.md](DESIGN-SPEC.md).
7. Untuk test, baca [TEST-SCENARIOS.md](TEST-SCENARIOS.md).
8. Untuk Issues/auto-PR/commit-push, baca [ISSUE-SYNC-CONTRACT.md](ISSUE-SYNC-CONTRACT.md).
9. Salin [template evidence](evidence/TEMPLATE.md) untuk hasil pekerjaan.

## Kartu kerja

| File                                               | ID            | Fokus                                                      |
| -------------------------------------------------- | ------------- | ---------------------------------------------------------- |
| [Baseline](00-baseline.md)                         | M0.01–M0.08   | Inventarisasi, baseline, kontrak dan jumlah seed           |
| [Governance](01-governance.md)                     | M1.01–M1.12   | Dua branch, promosi, rulesets dan sinkronisasi             |
| [CI](02-ci.md)                                     | M2.01–M2.13   | Reusable verification, script root, gate dan artifacts     |
| [Board](03-board.md)                               | M3.01–M3.11   | Browser E2E, visual, aksesibilitas dan data flows          |
| [Backend](04-backend.md)                           | M4.01–M4.16   | ORM, auth, akses, jobs/outbox, restore dan performa        |
| [Design system](05-design-system.md)               | M5.01–M5.17   | Asset original, UI, grafik, katalog dan migrasi Board      |
| [Dokumentasi](06-documentation.md)                 | M6.01–M6.11   | Generated docs, README, portal dan Pages                   |
| [Release](07-release.md)                           | M7.01–M7.16   | Version/changelog, SHA, publication, recovery              |
| [Security/maintenance](08-security-maintenance.md) | M8.01–M8.11   | Least privilege, updater, scheduled jobs dan incident      |
| [Addon](09-addons.md)                              | M9.01–M9.08   | Notification, storage, workflow, integration, organization |
| [Acceptance](10-acceptance.md)                     | M10.01–M10.10 | Bukti satu siklus nyata dan handoff                        |

Lihat juga [Issues dan delivery — M11.01–M11.15](11-issues-delivery.md): issue sync, lifecycle, commit/push, auto-PR/merge dan recovery.

## Gelombang pelaksanaan

Nomor milestone bukan urutan serial mutlak. Gunakan dependsOn di index. Contoh: M1.06 harus menunggu M2.05 agar ruleset tidak mengunci repo sebelum check tersedia.

1. **Baseline:** M0.01, M0.03, M0.04 dapat dibaca paralel; lengkapi M0 lain dari hasil tersebut.
2. **Kontrak dan infrastruktur:** scaffold reusable CI, strict integration, test fixtures, App setup runbook, dev bootstrap. Belum mengaktifkan required checks yang belum pernah berjalan.
3. **Pengujian dan desain:** Board E2E, backend hardening, UI/asset foundations dan docs extraction dapat berjalan paralel dengan file ownership yang disepakati.
4. **Integrasi produk:** migrasi Board ke UI package, katalog, docs portal, full CI dan security checks.
5. **Release simulasi:** planner/version/changelog, writer coordination, fault injection, lalu rulesets dan promotion automation yang sudah terbukti.
6. **Aktivasi:** verifikasi first stable decision, publication dan Pages; buktikan M10.07 tanpa deployment aplikasi.
7. **Ekspansi:** implementasikan M9 setelah fondasi yang disebut dalam dependensinya siap. Acceptance platform tidak berarti semua addon masa depan sudah dibuat.

## Batas penyelesaian

- **Platform milestone:** M0–M8, M11 dan acceptance M10 yang relevan telah terbukti. Core Issues sync M11.01–M11.06 dapat berjalan paralel setelah baseline; end-to-end lifecycle M11.14 menunggu gate/release siap.
- **Extension milestone:** M9 diselesaikan per addon; jangan menandai seluruh master roadmap selesai ketika M9 masih pending.
- **Maintenance:** jadwal berulang merupakan operasi ongoing. Item setup selesai setelah workflow tersedia dan satu run terbukti; pekerjaan rutin tetap berlanjut.
- Roadmap hanya lengkap jika gap, tugas tertunda, unsupported capability, dan pemilik tindak lanjut tetap tercatat.
