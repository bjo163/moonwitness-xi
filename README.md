# MoonWitness Monorepo

![MoonWitness — every model, one board](packages/assets/brand/readme-banner.svg)

Rencana pengembangan dan checklist jangka panjang: [Master Roadmap](ROADMAP.md).

Diagram arsitektur, relasi model base, dan alur runtime tersedia di
[Architecture diagrams](docs/architecture/diagrams/README.md) dan diperiksa
otomatis agar tetap mengikuti metadata workspace.

Panduan developer untuk quickstart, addon, API/metadata, Board, jobs, security, recovery, dan
troubleshooting tersedia di [Developer guide](docs/guide/index.md).

<!-- BEGIN GENERATED WORKSPACE REFERENCE -->

## Generated workspace reference

Monorepo version: `1.0.0-rc.1` · metadata fingerprint: `267efb96c8883314a6863787ba83ae61b6c1d4e48fe58ac8e77f8985484bbc71`.

| App/package                     | Kind    | Version      | Workspace scripts                                                                                                                                                                    |
| ------------------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@moonwitness/api`              | App     | `1.0.0-rc.1` | `attachments:reconcile`, `build`, `dev`, `jobs:outbox`, `jobs:scheduler`, `jobs:worker`, `reset:superadmin-password`, `revoke:auth-sessions`, `start`, `test`, `visual-audit:server` |
| `@moonwitness/board`            | App     | `1.0.0-rc.1` | `build`, `dev`, `lint`, `preview`, `typecheck`                                                                                                                                       |
| `@moonwitness/docs`             | App     | `1.0.0-rc.1` | `dev`, `portal:build`, `preview`, `test`, `typecheck`                                                                                                                                |
| `@moonwitness/ui-catalog`       | App     | `1.0.0-rc.1` | `build`, `dev`, `preview`, `test`                                                                                                                                                    |
| `@moonwitness/assets`           | Package | `1.0.0-rc.1` | —                                                                                                                                                                                    |
| `@moonwitness/auth`             | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/client`           | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/eslint-config`    | Package | `1.0.0-rc.1` | —                                                                                                                                                                                    |
| `@moonwitness/jobs`             | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/logger`           | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm`              | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-base`         | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-integration`  | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-notification` | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-organization` | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-request`      | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-storage`      | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/orm-workflow`     | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |
| `@moonwitness/types`            | Package | `1.0.0-rc.1` | `build`                                                                                                                                                                              |
| `@moonwitness/ui`               | Package | `1.0.0-rc.1` | `build`, `test`                                                                                                                                                                      |

Root commands: `pnpm architecture:check`, `pnpm architecture:generate`, `pnpm assets:check:docs`, `pnpm assets:export:docs`, `pnpm assets:generate`, `pnpm assets:generate:illustrations`, `pnpm assets:render`, `pnpm assets:validate`, `pnpm attachments:reconcile`, `pnpm audit:workspace`, `pnpm automation:check:action-pins`, `pnpm automation:check:action-tags`, `pnpm automation:check:roadmap`, `pnpm automation:check:secrets`, `pnpm automation:check:ubuntu-runner-candidate`, `pnpm automation:check:workflow-trust`, `pnpm board:budget`, `pnpm board:visual:update`, `pnpm build`, `pnpm ci:affected`, `pnpm dependency:candidate`, `pnpm dependency:plan`, `pnpm dev`, `pnpm dev:board`, `pnpm docs:build`, `pnpm docs:change:classify`, `pnpm docs:check`, `pnpm docs:examples:check`, `pnpm docs:generate`, `pnpm docs:links`, `pnpm docs:links:external`, `pnpm docs:publication:check`, `pnpm format`, `pnpm format:check`, `pnpm jobs:outbox`, `pnpm jobs:scheduler`, `pnpm jobs:worker`, `pnpm lint`, `pnpm lint:fix`, `pnpm platform:audit`, `pnpm promotion:approval-check`, `pnpm promotion:risk`, `pnpm readme:check`, `pnpm readme:generate`, `pnpm release:changelog`, `pnpm release:check`, `pnpm release:classify`, `pnpm release:dry-run`, `pnpm release:plan`, `pnpm release:prepare`, `pnpm release:verify-attestations`, `pnpm reset:superadmin-password`, `pnpm revoke:auth-sessions`, `pnpm roadmap:issues:audit`, `pnpm roadmap:issues:plan`, `pnpm roadmap:progress`, `pnpm test`, `pnpm test:action-pins`, `pnpm test:action-tags`, `pnpm test:addon-conformance`, `pnpm test:affected`, `pnpm test:architecture`, `pnpm test:artifact-safety`, `pnpm test:assets`, `pnpm test:board-budget`, `pnpm test:ci-gate`, `pnpm test:coverage-policy`, `pnpm test:dependency-candidate`, `pnpm test:dependency-plan`, `pnpm test:docs-navigation`, `pnpm test:docs-portal`, `pnpm test:docs-publication`, `pnpm test:e2e`, `pnpm test:e2e:diagnostics`, `pnpm test:e2e:visual`, `pnpm test:e2e:visual:matrix`, `pnpm test:expected-ref`, `pnpm test:flaky-policy`, `pnpm test:integration`, `pnpm test:maintenance-incidents`, `pnpm test:package-manager`, `pnpm test:platform-audit`, `pnpm test:promotion-policy`, `pnpm test:promotion-report`, `pnpm test:release-asset-reconcile`, `pnpm test:release-classification`, `pnpm test:release-dry-run`, `pnpm test:release-image-publish`, `pnpm test:release-latest-policy`, `pnpm test:release-plan`, `pnpm test:release-prepare`, `pnpm test:release-prepare-workflow`, `pnpm test:release-verify-attestations`, `pnpm test:release-workflow`, `pnpm test:render-changelog`, `pnpm test:restore-drill`, `pnpm test:roadmap`, `pnpm test:secrets`, `pnpm test:security-policy`, `pnpm test:ubuntu-runner-candidate`, `pnpm test:ui`, `pnpm test:ui-budget`, `pnpm test:ui-catalog`, `pnpm test:unit`, `pnpm test:unit:ci`, `pnpm test:versioned-docs`, `pnpm test:workflow-trust`, `pnpm test:workspace-version-policy`, `pnpm typecheck`, `pnpm ui:budget`, `pnpm ui:visual:update`, `pnpm verify`.

Generated model, field, relation, access, environment-name, and endpoint references are in the [developer guide](docs/guide/index.md).

<!-- END GENERATED WORKSPACE REFERENCE -->

Panduan sumber brand, token bersama, serta asset statis untuk dokumentasi:
[Brand assets](docs/design/brand-assets.md).

Katalog interaktif untuk seluruh primitive UI:
[UI component catalog](docs/design/ui-catalog.md).

Arsitektur monorepo berkinerja tinggi menggunakan **pnpm workspaces** yang memisahkan core ORM, shared types, konfigurasi linter, dan service API.

---

## 📁 Struktur Monorepo

```text
moonwitness/
├── .env                        # Single environment configuration (root level)
├── .env.example                # Template environment
├── docker-compose.yml          # PostgreSQL database container (root level)
├── pnpm-workspace.yaml         # Definisi workspace (apps/*, packages/*)
├── package.json                # Root scripts (build, test, lint, format)
├── tsconfig.base.json          # Shared TypeScript base configuration
├── eslint.config.js            # Centralized ESLint flat config
├── .prettierrc                 # Shared code formatting rules
│
├── apps/
│   └── api/                    # 🚀 @moonwitness/api (Fastify API Service)
│       ├── src/
│       │   ├── app.ts          # Fastify app builder (Swagger, CORS)
│       │   ├── server.ts       # Entry point HTTP server
│       │   ├── config/         # Config database & environment
│       │   ├── database/       # Knex connection & setup
│       │   ├── plugins/        # Fastify plugin orm
│       │   └── routes/         # Dynamic REST & JSON-RPC routes
│       └── tests/              # API Integration tests
│
└── packages/
    ├── types/                  # 📦 @moonwitness/types (Shared Types & DTOs)
    │   └── src/
    │       ├── domain.ts       # Domain query & filter types
    │       ├── api.ts          # API response & pagination types
    │       ├── jsonrpc.ts      # JSON-RPC 2.0 schemas
    │       └── index.ts
    │
    ├── orm/                    # 📦 @moonwitness/orm (Reusable Base ORM Engine)
    │   ├── src/
    │   │   ├── base.model.ts   # Core BaseModel (Objection.js)
    │   │   ├── domain.ts       # Polish notation Domain Expression Parser
    │   │   ├── environment.ts  # Environment container (env, trx, context)
    │   │   ├── registry.ts     # Model Registry & decorator
    │   │   ├── model-definition.ts # fields → types, validation and relations
    │   │   ├── addon.ts        # Shared schema sync and external-ID seed loader
    │   │   ├── types.ts        # Re-export @moonwitness/types
    │   │   └── index.ts        # Package entrypoint
    │   └── tests/              # Unit tests domain parser
    │
    ├── orm-base/               # 🧩 Declarative base addon
    │   └── src/
    │       ├── manifest.ts     # Metadata, models and data
    │       ├── models/user.ts  # Account fields and profile relation
    │       ├── models/partner.ts # Profile fields
    │       ├── data.ts         # Default records with stable external IDs
    │       └── index.ts        # Public exports
    │
    └── eslint-config/          # 📦 @moonwitness/eslint-config (Centralized Linter)
        ├── package.json
        └── index.js            # Shared Flat ESLint rules
```

## Addon dasar

`@moonwitness/orm-base` hanya mendeklarasikan model, manifest, dan data. Field cukup
ditulis sekali; mesin `@moonwitness/orm` menghasilkan tipe TypeScript, validasi,
kolom database, constraint, dan relasi. Field `id`, `active`, dan audit diwarisi otomatis.

```ts
export const User = defineModel('base.user', {
  table: 'users',
  fields: {
    login: fields.string({ required: true, unique: true }),
    password: fields.password(),
    partner: fields.belongsTo(Partner, { required: true, unique: true }),
    role: fields.enum(['system', 'superadmin', 'user'], { default: 'user' }),
  },
});

export const Company = defineModel('base.company', {
  fields: { name: fields.string({ required: true, unique: true }) },
});

export const manifest = defineAddon({
  name: 'base',
  version: '1.0.0',
  models: [
    Country,
    Currency,
    Language,
    Company,
    Partner,
    User,
    Tag,
    TagLink,
    Attachment,
    Activity,
    Sequence,
  ],
  data,
});
```

API cukup memanggil `await installAddons(db, [manifest])`. Installer mengurutkan
dependensi addon/model, membuat tabel, menambah kolom yang aman, dan memasang data
dalam satu transaksi. Tidak ada `schema.ts`, SQL migrasi, atau hook instalasi pada
addon. Kolom lama tidak dihapus, diganti nama, atau diubah tipenya otomatis.
Penambahan field wajib tanpa default atau field unik pada tabel berisi data
ditolak; lakukan backfill eksplisit terlebih dahulu. Relasi opsional dapat
ditambahkan dengan nilai kosong pada record lama. Jalankan instalasi dari satu
proses saat mengubah skema.

Data menggunakan ID stabil dan referensi:

```ts
seed(User, 'base.user_system', {
  login: 'system',
  role: 'system',
  partner: ref('base.partner_system'),
});
```

Installer menyimpan pemetaan ID dalam tabel internal `_orm_data`. Perubahan email
atau login tidak membuat record baru, dan nilai yang sudah diedit tidak ditimpa.
Pada pemasangan pertama, record lama dapat diadopsi melalui field unik. Referensi
yang hilang atau konflik identitas membatalkan transaksi.

Data bisnis awal: **1 company** (`MoonWitness`), **2 user** (`system`, `superadmin`),
**10 partner**, serta **249 negara/area** berkode ISO 3166-1 alpha-2. Company
default menggunakan United States, USD, English (US), dan UTC. Daftar negara
memuat nama Inggris dan dapat ditambah/diperbarui melalui `src/countries.ts`.
Company default terhubung ke profil partner kedua user.
User dapat memilih bahasa dan zona waktu sendiri; nilai kosong mengikuti
pengaturan company dari profil partner, lalu fallback aplikasi `en-US` dan `UTC`.
Company dan Partner menyimpan alamat ringkas (`street`, `city`, `postal_code`,
dan country). Semua model mewarisi timestamp serta UID pembuat/pengubah;
UID terisi dari `Environment.withUser()` saat actor tersedia.
Nama, email, dan telepon hanya disimpan di Partner. Profil dan company dimuat melalui
`GET /api/base.user?with=partner.company`. Role `system` memiliki akses administrasi
penuh; `superadmin` mengelola akun lain tetapi tidak dapat membuat atau mengubah akun
`system`; `user` hanya membaca model bisnis dan tidak dapat membaca `base.user`.
Record nonaktif tidak tampil di pencarian standar dan dapat dipulihkan dengan
`action_unarchive`. API menolak pengarsipan/penghapusan record referensi yang masih
dipakai serta menolak user aktif dengan partner nonaktif.

### Kategori dan alamat partner

`base.partner_category` menyimpan kategori reusable seperti Customer dan Vendor;
`base.partner_category_link` menghubungkan banyak kategori ke satu partner. Alamat
dipisah ke `base.partner_address`, dengan tipe contact/invoice/delivery/other,
alamat jalan, kota, state/province, kode pos, negara, dan penanda alamat utama.
Field alamat lama pada `base.partner` tetap tersedia agar record lama tidak rusak;
record baru sebaiknya memakai model alamat terstruktur. Seed contoh menghubungkan
Acme Studio ke kategori Customer dan menyediakan alamat Headquarters di San Francisco.
Graph profile dapat dimuat dengan `with=addresses.country,category_links.category`.

### Model tambahan base

`base.tag` menyimpan label bersama dan `base.tag_link` menghubungkannya ke record
dengan pasangan `resource_model`/`resource_id`. API memeriksa bahwa model sudah
terpasang dan record tujuan ada; addon boleh memakai relasi yang sama tanpa
mengubah skema addon base. Tag dapat dibaca semua user, sedangkan perubahan tetap
memerlukan role administrator.

`base.attachment` menyimpan metadata file dan kunci objek penyimpanan saja; konten
file tetap berada di storage provider. `base.activity` menyediakan pengingat dengan
jenis, tenggat, status, penanggung jawab, dan target record. API memvalidasi target
polimorfik dan mencegah target yang masih direferensikan dihapus.

`base.sequence` menyimpan prefix, padding, dan penghitung berikutnya. Kode addon
mengambil nomor melalui helper transaksi agar pemanggilan bersamaan tidak
menghasilkan nomor yang sama:

```ts
const reference = await nextSequence('sales.order'); // e.g. SO-0001
```

Instalasi base menyertakan contoh data untuk seluruh model tambahan: tag Customer
dan tautannya ke Acme Studio, metadata attachment contoh, aktivitas tindak lanjut,
sequence `sales.order`, membership superadmin, serta grant baca partner untuk grup
`user`. Attachment contoh hanya metadata; file tidak otomatis dibuat di storage.

`base.access_group` dan `base.group_membership` mengelompokkan user; pendaftaran
otomatis memasukkan user baru ke grup `user`. `base.model_access` memberi izin
read/create/write/unlink per model kepada grup. Role `system` dan `superadmin`
mempertahankan hak admin; model akun, audit, dan pengaturan akses tidak bisa
dibuka melalui grant grup. Hak dibaca ulang dari database pada setiap request.

### Isolasi multi-company dan audit

`base.company_membership` adalah sumber izin company. `X-Company-Id` hanya diterima
bila user memiliki membership aktif; tanpa header, request memakai membership default.
Record ber-company dibatasi ke company terpilih untuk semua role. Record-rule addon
ditambahkan sebagai syarat AND sehingga tidak dapat menghapus batas tenant. Relasi
ke record milik company lain dan perpindahan record antar-company ditolak. Endpoint
admin juga memeriksa role secara eksplisit.

Mutasi generic REST, action, dan JSON-RPC menjalankan perubahan record, audit log,
dan event `base.outbox_event` dalam satu transaksi database. Kegagalan salah satu
langkah membatalkan semuanya. Payload audit/outbox menyimpan snapshot terbatas dan
menghapus nilai yang menyerupai password, token, secret, credential, atau hash.
Dispatcher outbox bersifat at-least-once; consumer harus memakai `eventId` sebagai
idempotency key untuk efek eksternal.

### Versi addon dan upgrade programmatic

Installer membuat ledger internal `_orm_addons` dan mencatat versi addon pada
transaksi instalasi. Schema sync tetap additive: kolom lama tidak dihapus atau
diubah otomatis, dan kolom wajib tanpa default/unik pada tabel berisi data ditolak.
Untuk perubahan data yang membutuhkan backfill, manifest dapat menyertakan hook
programmatic yang berjalan di transaksi installer:

```ts
defineAddon({
  name: 'sales',
  version: '1.1.0',
  models,
  upgrade: {
    '1.0.0': async (trx) => {
      await trx('sales_orders').whereNull('state').update({ state: 'draft' });
    },
  },
});
```

Hook menerima Knex transaction; tidak ada runner migrasi SQL. Versi turun ditolak.
Schema sync tidak melakukan perubahan destructive otomatis.

### Job queue, scheduler, dan kontrol operasi

`@moonwitness/jobs` menyediakan model `base.job`, `base.job_run`, `base.cron`, dan
`base.outbox_event`. Payload job divalidasi oleh handler bertipe saat enqueue dan
sebelum dieksekusi. Worker memakai lease, heartbeat, fencing token, retry dengan
backoff, dead-letter, pembatalan kooperatif, serta idempotency key. Job handler
tetap perlu idempotent karena proses dapat mati setelah efek eksternal terjadi
namun sebelum hasil tersimpan.

Jalankan proses terpisah sesuai kebutuhan:

```sh
pnpm jobs:worker
pnpm jobs:scheduler
pnpm jobs:outbox
```

Scheduler mendukung timezone cron, misfire `skip`/`coalesce`/`catch_up`, dan
concurrency `allow`/`forbid`/`replace`. Worker production memuat handler domain dari
`JOB_HANDLERS_MODULE`; contoh `example.noop` memverifikasi alur end-to-end. Consumer
outbox dimuat dari `OUTBOX_HANDLERS_MODULE`; event tanpa consumer tetap pending.
Kontrol admin tersedia di `GET /admin/jobs/health`, `GET /admin/jobs`,
`GET /admin/jobs/:id/runs`, endpoint retry/cancel, `GET/POST/PATCH /admin/crons`, serta
`GET /admin/outbox` dan retry dead letter. Daftar tidak mengirim payload job/outbox.
Semua operasi kontrol dicatat ke audit log.

### Password awal superadmin

Atur `SUPERADMIN_PASSWORD` di `.env` root sebelum menjalankan API. Saat startup,
password diterapkan pada akun dengan external ID `base.user_superadmin` hanya jika
password-nya masih kosong, termasuk untuk instalasi lama. Mengganti nilai `.env`
setelah password terisi tidak mereset password akun. Nilai kosong tidak mengaktifkan
password; akun `system` tetap tanpa password awal.

`fields.password()` otomatis mengubah input menjadi hash scrypt dengan salt acak
pada insert/update ORM. Database hanya menyimpan hash pada kolom `users.password`;
field ini tidak diserialisasikan ke JSON dan tidak dapat dipilih melalui parameter
`fields` API. `verifyPassword(input, user.password)` dari paket ORM tersedia untuk
verifikasi saat fitur login ditambahkan. Jangan menulis password melalui query Knex
mentah karena jalur itu melewati hook hashing ORM.

---

## 🚀 Perintah Utama Monorepo

```bash
# 1. Menjalankan database PostgreSQL
docker compose up -d

# 2. Build semua paket dan aplikasi
pnpm build

# 3. Menjalankan seluruh test suite
pnpm test

# 4. Menjalankan linter di seluruh workspace
pnpm lint
# Otomatis memperbaiki masalah linting:
pnpm lint:fix

# 5. Format kode di seluruh proyek dengan Prettier
pnpm format
# Cek format kode:
pnpm format:check

# 6. Menjalankan API Server dalam Development Mode
pnpm dev

# 7. Menjalankan board di terminal lain
pnpm dev:board
```

## Validasi CI dan tes PostgreSQL

Workflow `.github/workflows/ci.yml` menjalankan lint, build, dan seluruh tes pada pull
request serta push ke `main`. Job CI menyediakan PostgreSQL 16 dan mengisi
`POSTGRES_TEST_URL`; tes akan membuat schema acak sendiri, menjalankan upgrade serta
alur API end-to-end (login, daftar/count user, update profil, reset password), lalu
menghapus schema itu. Tes juga memeriksa hitungan PostgreSQL tanpa mewarisi urutan
default model. Secara lokal, jalankan `docker
compose up -d`, salin `.env.example` menjadi `.env`, lalu tetapkan:

```dotenv
POSTGRES_TEST_URL=postgresql://postgres:postgres@127.0.0.1:5432/moonwitness_test
```

Selanjutnya `pnpm test` menjalankan tes SQLite dan integrasi PostgreSQL. Tanpa variabel
tersebut, tes PostgreSQL akan dilewati.

## Deploy

Build API dan board dari root dengan `pnpm build`. Jalankan API menggunakan
`pnpm --filter @moonwitness/api start`; proses membaca `DATABASE_URL`, `API_HOST`,
`API_PORT`, `JWT_SECRET`, serta password awal superadmin dari environment. Pada
isi `JWT_SECRET` tetap dan acak minimal 32 karakter pada semua environment agar token
tetap berlaku setelah API restart. Buat nilainya dengan:

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(48).toString('base64url'))"
```

Simpan hasilnya sebagai `JWT_SECRET` di `.env` root, lalu restart API. Startup API
memvalidasi secret sebelum mengubah database; startup juga memastikan PostgreSQL,
model addon base, dan dua akun default siap. Gunakan kredensial PostgreSQL
terkelola, dan tetapkan `SUPERADMIN_PASSWORD` hanya untuk bootstrap. Jangan gunakan
credential default pada `docker-compose.yml` di luar development.

Untuk production, `DATABASE_URL` wajib eksplisit; API menolak URL database fallback
lokal. Logging default production berupa JSON ke stdout, sedangkan development tetap
memakai file dan output pretty. Kosongkan `LOG_TO_FILE`/`LOG_PRETTY` agar default
environment berlaku, atau tetapkan `false` secara eksplisit. Installer addon memakai
PostgreSQL advisory lock supaya replica API/worker yang start bersamaan tidak berlomba
membuat tabel dan seed. Upgrade tetap mengikuti batasan additive dan hook programmatic
di atas.

Board merupakan SPA statis di `apps/board/dist`; host dengan fallback route ke
`index.html`, atau sajikan bersama reverse proxy yang meneruskan `/api`, `/auth`,
`/jsonrpc`, dan `/health` ke API. `BOARD_API_TARGET` hanya diperlukan untuk proxy
server Vite saat development/preview. Gunakan HTTPS di depan kedua service agar token
dan kredensial tidak melintas sebagai teks biasa.

Route board dimuat secara lazy: halaman login dan area utama terpisah agar bundle awal
lebih kecil. Database adalah sumber koordinasi rotasi refresh lintas instance: setiap
token menyimpan lease rotasi singkat yang dibaca oleh semua worker; replay setelah lease
kedaluwarsa mencabut seluruh family.

## Operasi production

`/livez` hanya memeriksa proses; `/readyz` menguji koneksi database dan cocok untuk
readiness probe. `/health` tetap tersedia untuk kompatibilitas. Set `METRICS_TOKEN`
(acak, minimal 32 karakter) untuk mengaktifkan endpoint Prometheus `/metrics`; scrape
dengan `Authorization: Bearer <METRICS_TOKEN>`. Metrik berisi request count/durasi per
route template dan process uptime, tanpa label berisi ID pengguna.

Jadwalkan `bash scripts/backup-postgres.sh` dengan `DATABASE_URL`, `BACKUP_DIR` di storage
terenkripsi/terpisah, dan `BACKUP_RETENTION_DAYS` (default 14). File custom-format
memiliki izin terbatas. Pulihkan dengan menjalankan `bash scripts/restore-postgres.sh`
setelah mengatur `BACKUP_FILE`, `DATABASE_URL`, dan
`ALLOW_DATABASE_RESTORE=true`; skrip meminta operator mengetik nama database target
sebelum mengubahnya. CI menjalankan `pnpm test:restore-drill` dengan dua database bernama
acak: addon dan data aplikasi sintetis di-dump, lalu dipulihkan menggunakan skrip yang sama
ke target terpisah. Drill membuktikan mismatch confirmation ditolak tanpa mengubah sentinel
target, membandingkan jumlah row dan ID, memeriksa relasi/membership, dan mencoba login
sesudah pemulihan; durasi dump dan restore dicatat sebagai pengukuran fixture CI. Untuk
menjalankannya sendiri, siapkan
`POSTGRES_TEST_URL` dan PostgreSQL client utilities (`pg_dump`, `pg_restore`, `createdb`,
`dropdb`, `psql`). Untuk mencegah koneksi salah sasaran, drill hanya berjalan pada host
loopback dan nama database yang mengandung `test`, `e2e`, atau `ci`. Drill satu kali ini
tidak menetapkan RPO atau RTO produksi: frekuensi backup off-host dan waktu
provisioning/cutover harus ditetapkan serta diukur oleh operator.
Simpan backup produksi di luar server/database utama dan gunakan enkripsi storage yang
dikelola infrastruktur.

### Image container dan rilis

Repository menyediakan Docker image API dan Compose untuk empat proses terpisah: API,
job worker, scheduler, dan outbox worker. Database production tetap eksternal/terkelola.
Salin `.env.production.example` ke `.env.production`, isi `DATABASE_URL`, `JWT_SECRET`
(minimal 32 karakter acak), dan password bootstrap, lalu lindungi file itu di host.
Jalankan:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs -f api jobs-worker jobs-scheduler outbox-worker
```

API hanya bind ke loopback host; pasang reverse proxy HTTPS di depannya. Container
berjalan sebagai user non-root, filesystem read-only, tanpa Linux capabilities, dan
menulis log ke stdout. Worker diberi waktu drain sebelum dihentikan. Tambahkan handler
domain ke image dan isi `JOB_HANDLERS_MODULE`/`OUTBOX_HANDLERS_MODULE` dengan path modul
di dalam image. Endpoint readiness akan tetap gagal sampai PostgreSQL siap.

Deployment aplikasi dikelola operator di luar workflow GitHub repository ini. Sebelum
operator mengganti image, verifikasi CI (termasuk PostgreSQL, backup/restore, dan build
image), backup database, dan image provenance; setelah perubahan, periksa `/readyz`,
`/livez`, login, alur mutasi, job/outbox, dan log, lalu catat image, commit, waktu,
backup, serta hasil smoke test. Staging bukan prasyarat automation/release repository.
Saat rollback,
gunakan image sebelumnya hanya jika schema/data baru masih kompatibel dengannya; hook
upgrade tidak dibalik otomatis. Pemulihan database adalah tindakan terpisah dan
destruktif: lakukan ke target yang dipilih dengan backup yang telah diuji, ikuti
konfirmasi nama database, lalu jalankan smoke test sebelum membuka traffic kembali.

Untuk respons insiden, kurangi traffic atau hentikan proses yang terdampak, simpan log
dan metrik, periksa status readiness serta dead-letter job/outbox, dan jangan menghapus
record antrean sebelum payload/penyebab ditinjau. Jika credential bocor, rotasi secret
di pengelola environment dan cabut sesi refresh; rotasi `JWT_SECRET` juga membatalkan
semua access token yang sedang berlaku. Setelah pemulihan, dokumentasikan penyebab,
rentang waktu, data yang dipulihkan, dan tindakan pencegahan.

Addon memasang indeks idempotent untuk `(active, id)`, `create_uid`, dan setiap foreign
key. Endpoint collection mendukung keyset pagination dengan `?cursor=0&limit=80`; lanjutkan
menggunakan `nextCursor` dari response. Cursor menggunakan urutan `id asc`, tidak boleh
digabungkan dengan offset, dan membatasi halaman hingga 500 record. Offset tetap tersedia
untuk halaman kecil.

Perubahan melalui REST dan JSON-RPC ditulis ke `base.audit_log`, berisi actor, model,
record, operasi, dan diff field. Password, token, secret, credential, dan hash tidak
disalin. Log hanya bisa dibaca role `system`/`superadmin` melalui API dan tidak dapat
diubah/dihapus lewat generic API.
