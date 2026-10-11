# Membuat alur request dan approval

Addon `@moonwitness/orm-request` adalah contoh fitur bisnis yang dibangun melalui kontrak addon umum: model deklaratif, akses company-scoped, view Board, menu, manifest, dan seed. Approval memakai `@moonwitness/orm-workflow`; API tidak memiliki route khusus `request.purchase`.

## Perilaku contoh

Model `request.purchase` menyimpan judul, alasan bisnis, jumlah dalam minor unit mata uang, company, dan vendor opsional. Pemohon berasal dari audit `create_uid`, sehingga caller tidak dapat memilih identitas pemohon lain. Akses group user mengizinkan read/create/write pada company aktif dan menolak unlink.

Install addon menambahkan dua draft contoh, satu definisi approval, dan tiga template notifikasi in-app. Install tidak membuat workflow event atau inbox palsu. Definisi memuat aksi submit, approve, dan reject; hanya peran superadmin/system boleh mengambil keputusan, dan pemohon tidak boleh menyetujui request sendiri. Status approval dan history berada di workflow instance, bukan kolom duplikat pada request.

## Menjalankan dan menguji

API memasang addon dalam daftar runtime dan dependency resolver menentukan urutannya. Board membentuk list/form dari metadata model. Klien memulai alur pada resource yang dapat dibaca melalui `POST /workflows/instances`, kemudian mengirim keputusan ke `POST /workflows/instances/:id/actions`. Semua aksi memakai idempotency key; transisi juga membawa revision yang diharapkan.

Jalankan `pnpm --filter @moonwitness/orm-request test` untuk seed, view, alur submit/approve/reject, notifikasi dan history. Jalankan `pnpm test:addon-conformance` untuk memeriksa manifest serta install ulang seluruh addon. Dokumentasi kontrak teknis tersedia di [addon request](../../addons/orm-request.md) dan [addon workflow](../../addons/orm-workflow.md).
