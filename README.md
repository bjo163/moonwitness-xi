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
    │   │   ├── types.ts        # Re-export @moonwitness/types
    │   │   └── index.ts        # Package entrypoint
    │   └── tests/              # Unit tests domain parser
    │
    └── eslint-config/          # 📦 @moonwitness/eslint-config (Centralized Linter)
        ├── package.json
        └── index.js            # Shared Flat ESLint rules
```

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
