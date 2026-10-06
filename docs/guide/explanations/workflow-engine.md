# Engine workflow dan approval

`@moonwitness/orm-workflow` menyediakan definisi berversi, instance yang menyimpan snapshot definisi, transisi state, approval, event append-only, optimistic revision, idempotency, dan expiry melalui jobs. Addon bisnis memilih resource, role, transisi, dan template notifikasinya sendiri; engine tidak mengunci nama model bisnis.

Setiap transisi memvalidasi state asal, role, company, aktor, approval quorum, dan revision di transaksi database. Perubahan state, event, approval, dan notifikasi outbox ditulis atomik. Kegagalan tidak meninggalkan event atau notifikasi. Expiry diproses handler jobs dengan batas kerja dan retry.

Klien terautentikasi dapat membaca definisi yang tersedia untuk model, mendaftar instance, memulai workflow pada resource yang lolos akses dan row rule, membaca history, dan menjalankan aksi. API membatasi seluruh instance ke company aktif; generic CRUD/RPC untuk tabel internal workflow ditolak. Board menampilkan panel hanya bila model memiliki definisi yang tersedia atau instance terdahulu, dan server tetap menjadi otoritas keputusan.

Schema serta data awal dipasang programmatically melalui manifest addon; tidak ada migration SQL. Lihat [kontrak teknis workflow](../../addons/orm-workflow.md) dan [contoh request/approval](../how-to/request-approval-addon.md).
