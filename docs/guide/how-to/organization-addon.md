# Menggunakan addon organisasi

Addon `organization` menambahkan struktur organisasi sederhana di atas `base.company` dan `base.user`. Ia menghubungkan user yang sudah ada ke departemen, tim, posisi, dan tanggal keanggotaan; addon ini tidak membuat atau menggandakan akun user.

## Model dan aturan

- `organization.department` menyimpan kode, nama, company, dan parent department opsional.
- `organization.team` berada di satu department dan company. Parent team opsional hanya boleh berasal dari department yang sama.
- `organization.position` adalah katalog posisi per company dan dapat dibatasi ke department.
- `organization.membership` menghubungkan satu user dengan company, department, team/position opsional, manager opsional, dan tanggal mulai/akhir. Kombinasi user-company unik; akun yang pindah company memakai membership company yang berbeda.

Semua record organisasi memiliki company scope dan mengikuti record rule tenant pada generic API. Sebelum mutasi, API juga memeriksa bahwa user memiliki `base.company_membership` untuk company tujuan. Relasi department, team, position, manager, dan parent tidak boleh melintasi company; team dan membership harus cocok dengan department yang dituju.

Parent department/team dan rantai manager diperiksa sebelum tulis agar tidak membentuk cycle. Tanggal harus benar-benar valid dalam format `YYYY-MM-DD`; tanggal akhir opsional tidak boleh mendahului tanggal mulai. Semua pemeriksaan memakai transaksi request yang sama dengan mutasi.

## Contoh seed

Saat addon dipasang bersama `base`, ia menambahkan dua department, dua team, dua position, dan dua membership contoh pada company default. Contoh membership memakai dua user base yang sudah tersedia. Seed bersifat idempotent dan tidak mengubah user yang sudah ada.

Menu Departments, Teams, Positions, dan Organization Members tersedia dalam grup Organization. Model sensitif organisasi hanya memberi akses baca ke group user biasa; penulisan tetap memerlukan grant akses yang eksplisit. Tidak ada SQL migration manual: tabel dan seed dikelola melalui manifest programatis addon.

Referensi nama model, field, view, menu, akses, dan jumlah seed aktual dihasilkan dari manifest pada [referensi model dan addon](../reference/generated-models.md). Endpoint generic mengikuti kontrak di [referensi API](../reference/api.md).
