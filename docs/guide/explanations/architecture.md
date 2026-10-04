# Arsitektur

**Pembaca:** engineer yang perlu memahami batas komponen sebelum mengubah kontrak. **Prasyarat:**
kenal TypeScript, pnpm workspace, Fastify, dan PostgreSQL. **Verifikasi:** jalankan
`pnpm architecture:check`; hasil yang diharapkan adalah 14 artefak konsisten dengan package dan
metadata model saat ini.

## Alur utama

Board menggunakan `@moonwitness/client` untuk berkomunikasi dengan Fastify API. API memasang addon
secara programmatic dan memakai `@moonwitness/orm` sebagai engine model/query; `@moonwitness/orm-base`
menyediakan model dan seed dasar. `@moonwitness/types` menjadi kontrak lintas package. Queue,
scheduler, dan outbox berada di `@moonwitness/jobs`; proses worker memakai database yang sama,
bukan menyimpan state queue dalam memori.

`@moonwitness/ui` dan `@moonwitness/assets` tidak menjadi dependensi API. UI package menyediakan
komponen/tokens untuk Board dan katalog; assets package menyediakan file statis yang juga dapat
diekspor ke README/docs tanpa runtime framework.

## Cara membaca diagram

- [Workspace dependencies](../../architecture/diagrams/workspace-dependencies.svg) menunjukkan
  arah dependensi package, bukan urutan startup.
- [Base model relations](../../architecture/diagrams/base-model-relations.svg) menunjukkan relasi
  metadata model, bukan isi database atau hak akses.
- [Auth refresh](../../architecture/diagrams/auth-refresh.svg), [jobs/outbox](../../architecture/diagrams/jobs-outbox.svg),
  dan [addon installation](../../architecture/diagrams/addon-install.svg) adalah alur konseptual yang
  diverifikasi terhadap sumber terkait.

Diagram generated dapat dibuat dengan `pnpm architecture:generate` dan diperiksa tanpa menulis
dengan `pnpm architecture:check`. Jika model atau dependency berubah, commit source metadata dan
artefak generated dalam perubahan yang sama.

## Batas desain

Addon mendeskripsikan model, view, menu, seed, dependency dan upgrade hook. Installer mengeksekusi
perubahan additive secara transaksional; addon tidak menyertakan SQL migration tradisional.
Penghapusan/rename/type change destruktif memerlukan strategi backfill dan upgrade eksplisit.
Lihat [panduan addon](../how-to/addon-development.md) dan
[kebijakan kompatibilitas](../../engineering/compatibility.md) sebelum mengubah kontrak publik.
