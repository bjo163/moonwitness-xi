# Engine workflow dan approval

`@moonwitness/orm-workflow` menyediakan definisi berversi, instance yang menyimpan snapshot definisi, transisi state, approval, event append-only, optimistic revision, idempotency, dan expiry melalui jobs. Addon bisnis memilih resource, role, transisi, dan template notifikasinya sendiri; engine tidak mengunci nama model bisnis.

Setiap transisi memvalidasi state asal, role, company, aktor, approval quorum, dan revision di transaksi database. Perubahan state, event, approval, dan notifikasi outbox ditulis atomik. Kegagalan tidak meninggalkan event atau notifikasi. Expiry diproses handler jobs dengan batas kerja dan retry.

Klien terautentikasi dapat membaca definisi untuk peran yang boleh memulai atau menjalankan transisi; flag `canStart` membedakan hak memulai dari hak reviewer. Daftar instance selalu terikat ke model dan ID resource, dan list/detail/start/action memeriksa akses baca serta row rule resource dalam active company. Klien dapat membaca history dan menjalankan aksi yang memenuhi revision, role dan kebijakan pemohon/reviewer. Generic CRUD/RPC untuk tabel internal workflow ditolak. Board menampilkan panel hanya bila model memiliki definisi yang tersedia atau instance terdahulu, dan server tetap menjadi otoritas keputusan.

Schema serta data awal dipasang programmatically melalui manifest addon; tidak ada migration SQL. Lihat [kontrak teknis workflow](../../addons/orm-workflow.md) dan [contoh request/approval](../how-to/request-approval-addon.md).
