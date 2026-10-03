# Kontrak automation yang harus diimplementasikan

Dokumen ini mendefinisikan perilaku target. Nama file/workflow adalah usulan; konsolidasikan jika beberapa tugas lebih jelas berada dalam satu workflow. Jangan membuat workflow hanya untuk menambah jumlah automation.

## Event dan efek yang diperbolehkan

| Event                     | Pemeriksaan                                  | Efek tulis yang diizinkan setelah gate                        |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Push dev                  | Quality dan tests sesuai scope               | Request preparation; tidak publish stable                     |
| Generated preparation dev | Full verification                            | Buat/perbarui satu promotion PR                               |
| PR dev → main             | Source check, full verification, risk policy | Auto-merge jika kategori dan izin memenuhi syarat             |
| Main merge                | Verifikasi exact SHA dan release plan        | Build candidate; publish stable sesuai version decision       |
| Docs-only main            | Docs dan relevant tests                      | Publish docs dengan source SHA, tanpa app tag                 |
| Scheduled update          | Plan/apply/test candidate di temp checkout   | Push valid update ke dev melalui coordinator                  |
| Scheduled regression      | Full tests/security/restore                  | Report; issue deduplicated bila perlu                         |
| workflow_dispatch         | Validasi input/ref/trust                     | Hanya operasi yang dipilih, dengan gate sama seperti otomatis |

Event bot tidak diasumsikan otomatis memicu run berikutnya. Tentukan workflow_call atau dispatch eksplisit dan uji jalur tersebut.

## Model data release plan

Implementasikan schema typed dengan validator runtime. Contoh bentuk, bukan nilai produksi:

```json
{
  "schemaVersion": 1,
  "baseReleaseTag": "v1.0.0-rc.1",
  "sourceHeadSha": "<full-input-sha>",
  "preparedHeadSha": "<full-prepared-sha-or-null>",
  "verifiedMainSha": "<full-main-sha-or-null>",
  "changeKind": "patch",
  "currentVersion": "1.0.0-rc.1",
  "nextVersion": "<calculated-after-first-stable-decision>",
  "channel": "prerelease",
  "requiresApproval": true,
  "approvalReasons": ["first-stable-decision-pending"],
  "changedPackages": ["@moonwitness/api"],
  "requiredArtifacts": ["api-image", "board-image", "checksums", "sbom", "provenance"],
  "operationKey": "<derived-from-base-tag-and-source-sha>"
}
```

Gunakan null yang tervalidasi, bukan string placeholder, pada implementasi. Versi dihitung dari base release dan substantive commits; jangan menghitung dari version file hasil prepare sebelumnya.

## State machine release

| State      | Masuk ketika                              | Keluar jika                          | Recovery                                              |
| ---------- | ----------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| planned    | Inputs dan base release valid             | Candidate changes tersedia           | Recompute jika source berubah                         |
| prepared   | Version/changelog/docs committed pada dev | Full prepared-SHA checks sukses      | Rerun checks; no extra bump                           |
| promotable | Checks dan approval policy memenuhi       | PR merged                            | Invalidate jika dev berubah                           |
| merged     | main SHA diketahui                        | Main verification sukses             | Gagal berarti tidak publish                           |
| verified   | Exact main SHA valid                      | Candidates built dan tested          | Rebuild hanya jika kandidat belum ada dan source sama |
| publishing | Draft/tag/assets mulai dibuat             | Semua mandatory assets terverifikasi | Reconcile remote state lalu upload yang kurang        |
| published  | Release immutable lengkap                 | Pages dan branch sync selesai        | Retry downstream tanpa tag baru                       |
| reconciled | Pages/sync/report selesai                 | Operasi selesai                      | No-op pada rerun identik                              |

`failed` bukan alasan menghapus state. Catat stage, error code dan retry action. Tag yang menunjuk SHA lain atau asset bernama sama dengan digest berbeda adalah konflik, bukan kasus retry biasa.

Pages failure tidak membatalkan release immutable; laporkan downstream incomplete. Pada M10.07 keseluruhan siklus baru dinyatakan lengkap setelah downstream pulih.

## Penulisan branch tanpa race

1. Ambil koordinasi eksklusif untuk writer repository.
2. Fetch dev terbaru dan simpan expectedHead.
3. Apply perubahan pada checkout sementara tanpa membuat remote branch.
4. Validasi generated output dan jalankan pemeriksaan yang diperlukan.
5. Baca remote head kembali. Jika berubah, buang candidate lokal yang obsolete dan hitung ulang.
6. Push normal; rejected push ditangani sebagai konflik concurrency, bukan dengan force.
7. Trigger verification secara eksplisit dan simpan operationKey.

GitHub concurrency tidak diperlakukan sebagai antrean FIFO yang menjamin semua request akan diproses. Coordinator harus dapat menggabungkan/recompute request yang tergantikan dan memeriksa pekerjaan tertunda pada run berikutnya. Human pushes tetap bisa terjadi sehingga expectedHead check selalu diperlukan.

## Required checks dan review tanpa deadlock

- Aktifkan ruleset setelah nama check benar-benar muncul pada run sukses.
- Seluruh event yang dapat mempromosikan main harus menghasilkan `ci-gate`.
- Job skipped hanya diterima jika planner relevance menyatakan optional pada mode tersebut.
- Full promotion mode mewajibkan PostgreSQL, browser core, container dan security policy sesuai kontrak.
- Bot tidak boleh memberi approval pada perubahan miliknya untuk memenuhi review manusia yang diwajibkan.
- Repository maintainer tunggal memerlukan keputusan review yang dapat dijalankan; jangan membuat rule dua reviewer yang tidak tersedia.
- Jangan memberikan bypass semua rules kepada release bot untuk menyelesaikan deadlock desain.

## Matrix trust dan permission

| Job                         | Hak default                                              | Tidak boleh                                    |
| --------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Test/build dari PR          | contents read                                            | Memakai token publikasi atau App writer        |
| Prepare dev trusted         | Scoped App contents write                                | Mengubah ruleset atau force-push               |
| Promotion PR                | pull requests write sesuai kebutuhan                     | Approve diri sendiri untuk sensitive review    |
| Release publish trusted SHA | contents/packages write, attestation scopes sesuai fitur | Menjalankan script dari arbitrary dispatch ref |
| Pages publish               | pages write dan identity permission yang diperlukan      | Membawa database dump atau .env                |
| Maintenance report          | issues write bila aktif                                  | Menyalin raw logs berisi secret                |

Periksa permission aktual dari dokumentasi resmi saat implementasi. Jika fitur tidak tersedia di akun, laporkan constraint dan fallback; jangan berpura-pura enforcement aktif.

## Kebijakan dependency update

- Default pull request updater yang membuat branch tambahan tidak diaktifkan.
- Updater membaca versi kandidat, memodifikasi manifest/lockfile di temp checkout, lalu menjalankan tests sebelum dev write.
- Gunakan versi dan changelog dari sumber resmi saat menilai major update.
- Paket auth/crypto/database/job runtime dianggap berdampak tinggi walau bump patch; wajib regression suite terkait.
- Tidak menulis credential package registry ke generated lockfile atau logs.
- No updates available menghasilkan success/no-op, bukan commit kosong.
- Satu batch gagal tidak mencampur rollback dengan perubahan manusia; jangan `git reset --hard` pada dev pengguna.

## Workflow acceptance fixture wajib

| Input                                          | Expected                                      |
| ---------------------------------------------- | --------------------------------------------- |
| required job failed                            | Gate fail; no promotion                       |
| required integration skipped                   | Gate fail                                     |
| docs-only dengan valid relevance               | Docs gate pass; no release bump               |
| first stable decision belum ada                | Stable publish blocked dengan alasan spesifik |
| source SHA berubah                             | Prepared plan stale; recompute                |
| repeated prepare input                         | Same version/diff; no duplicate commit        |
| existing tag same SHA                          | Reuse; continue reconcile                     |
| existing tag different SHA                     | Hard conflict; no move                        |
| existing asset same digest                     | Skip upload                                   |
| existing asset different digest                | Conflict; no overwrite                        |
| failed upload response setelah remote berhasil | Re-read; detect asset; no duplicate           |
| retry old release                              | Tidak menurunkan latest                       |
| Pages gagal                                    | Retry Pages; no version bump                  |
| dev sync conflict                              | Report paths; no force push                   |
| secret scan tool gagal                         | Unknown/error; bukan no findings              |
