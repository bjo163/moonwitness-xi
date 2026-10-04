# Referensi model runtime

**Pembaca:** pengembang Board, integrasi, atau addon. **Prasyarat:** actor terautentikasi dan
memiliki izin metadata model. **Verifikasi:** `GET /api/models` harus mengembalikan model yang
terpasang dan terlihat actor; jalankan `pnpm --filter @moonwitness/orm-base test` untuk kontrak base.

## Metadata runtime

API menyediakan `GET /api/models`, `GET /api/:model/fields`, dan `GET /api/:model/views`. Board
menggunakan metadata tersebut agar view mengikuti manifest addon. Hasil bergantung pada addon yang
terpasang serta izin actor; jangan menyalin model yang tersembunyi sebagai daftar universal.

Base manifest mendeklarasikan company, users, partners dan addresses, currencies, languages,
country/state, bank reference, access groups, memberships, audit log, tags, activities, attachments,
dan sequences. Model pasti dan field terbarunya harus dibaca dari manifest runtime, bukan daftar
manual di halaman ini. Diagram relasi yang generated memberi orientasi tanpa seed values.

## Query relation

Parameter `with` menerima sintaks graph relation Objection, termasuk comma-separated top-level
relations seperti `partner,language` dan nested relation `partner.company`. API memvalidasi expression;
model yang tidak mengenal relation akan mengembalikan validation error. Minta hanya relasi yang
diperlukan dan actor berhak baca.

## Data dan seed

Installer addon memakai external ID stabil untuk idempotensi; seed berikutnya mengisi data yang
hilang dan menjaga perubahan non-null yang dibuat pengguna. Audit logs dan runtime job history bukan
katalog demo dan tidak diseed sebagai event palsu. Lihat [panduan addon](../how-to/addon-development.md)
untuk install/upgrade semantics.

Generator model reference dari schema/registry adalah M6.02; halaman ini menghindari snapshot statis
yang dapat tertinggal dari runtime.
