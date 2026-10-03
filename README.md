# MoonWitness Monorepo

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

export const manifest = defineAddon({
  name: 'base',
  version: '1.0.0',
  models: [Partner, User],
  data,
});
```

API cukup memanggil `await installAddons(db, [manifest])`. Installer mengurutkan
dependensi addon/model, membuat tabel, menambah kolom yang aman, dan memasang data
dalam satu transaksi. Tidak ada `schema.ts`, SQL migrasi, atau hook instalasi pada
addon. Kolom lama tidak dihapus, diganti nama, atau diubah tipenya otomatis.
Penambahan field wajib tanpa default, unik, atau relasi pada tabel berisi data
ditolak; lakukan backfill eksplisit terlebih dahulu. Jalankan instalasi dari satu
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

Data bisnis awal: **2 user** (`system`, `superadmin`) dan **10 partner**, total
**12 record** (dua partner adalah profil user, delapan lainnya contoh kontak).
Nama, email, dan telepon hanya disimpan di Partner. Profil dimuat melalui
`GET /api/base.user?with=partner`. Role saat ini adalah metadata; autentikasi dan
pemeriksaan hak akses belum diimplementasikan.

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
```
