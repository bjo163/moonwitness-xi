# Membuat addon

**Pembaca:** pengembang package addon. **Prasyarat:** pahami TypeScript, `@moonwitness/orm`, dan
[kontrak kompatibilitas](../../engineering/compatibility.md). **Verifikasi:** jalankan
`pnpm --filter @moonwitness/orm test`, `pnpm --filter @moonwitness/orm-base test`, dan
`pnpm test:addon-conformance`; hasilnya harus exit code 0.

## Deklarasikan model dan manifest

Tambahkan package di workspace, impor `defineModel`, `fields`, `defineAddon`, dan `seed` hanya dari
public export package. Gunakan nama model stabil seperti `sales.order`, stable external seed IDs,
relasi metadata, views dan menus sesuai kebutuhan. Manifest version harus `major.minor.patch` dan
dependencies harus menyebut addon yang dipakai. Contoh executable yang sama dengan yang di-install
oleh tes tersedia di [manifest addon contoh](../../../packages/orm/examples/sales/manifest.ts); verifikasi dengan
`pnpm docs:examples:check`.

Contoh ini hanya deklarasi; addon baru belum terpasang di aplikasi. Untuk addon yang membutuhkan
contoh record, tambahkan seed lengkap untuk model non-runtime dan pakai helper `seed(Order, id, ...)`.
Referensi seed ke addon lain memakai helper `ref()` dan external ID, bukan database ID.

## Install dan evolusi data

API mendaftarkan manifest lewat `installAddons(db, manifests)`. Pemanggilan mengurutkan dependencies,
membuat/memperbarui schema yang aman, dan memasang seed dalam transaksi. Untuk perubahan data antar
versi, sediakan hook `upgrade` yang menerima Knex transaction dan dipetakan dari versi sebelumnya
yang tepat. Uji rollback hook gagal, restart idempotent, populated-schema upgrade, seed identity,
dan user edits yang sudah ada.

Tidak ada auto downgrade dan tidak ada jaminan bahwa rename/drop/type change akan ditebak. Lakukan
backfill yang dapat diulang dengan lock/transaksi yang tepat sebelum berhenti memakai field lama.
Jangan import file `src`/`dist` internal dari package lain; hanya root exports yang kompatibel.

## Acceptance minimum

1. Semua model, menu, relation, field pada views, serta external seed ID unik dan valid.
2. Setiap model contoh memiliki seed lengkap tetapi sintetis; audit/runtime history tidak dipalsukan.
3. Uji install bersih, install kedua, upgrade versi, preservasi edit dan rollback pada DB test.
4. Tambahkan README addon yang menjelaskan audience, dependency, install, tests, dan perubahan versi.
5. Perbarui model reference hasil generator ketika M6.02 tersedia.

Suite `pnpm test:addon-conformance` menginstall semua manifest runtime dalam database sementara,
memeriksa public exports, dependency closure, views/menu, external ID unik dan namespaced, lalu
mengulang install untuk membuktikan idempotensi serta pelestarian edit. Addon provider-only boleh
memiliki `models: []`; jangan menambah record demo palsu hanya agar lolos pemeriksaan. API negative
authorization setiap package tetap diverifikasi lewat suite auth, jobs, notification, workflow,
organization, dan ORM API, karena kontraknya berjalan di boundary API bukan di installer metadata.

Schema perubahan versi ditangani lewat `upgrade["versi-lama"]` di manifest dengan Knex transaction
dan backfill programatis. Suite ORM menguji hook versi tepat hanya berjalan sekali; addon tanpa
perubahan schema tidak perlu hook kosong. Untuk kompatibilitas API dan prosedur upgrade, ikuti
[compatibility policy](../../engineering/compatibility.md).

Base manifest yang dapat dipakai sebagai contoh ada di `packages/orm-base/src/manifest.ts` dan
`packages/orm-base/src/data.ts`.
