# Backup dan recovery PostgreSQL

**Pembaca:** operator yang bertanggung jawab atas data. **Prasyarat:** PostgreSQL client tools
(`pg_dump`, `pg_restore`, `createdb`, `dropdb`), Bash, `DATABASE_URL` ke target yang disengaja, dan
ruang backup privat. **Verifikasi:** gunakan isolated recovery drill `pnpm test:restore-drill`;
hasil sukses memverifikasi backup restore pada database sementara, bukan RPO/RTO production.

## Buat dan verifikasi backup

```bash
BACKUP_DIR=./backups bash scripts/backup-postgres.sh
```

Script membuat custom-format dump, memvalidasi katalog dengan `pg_restore --list`, membatasi
permission file/directory, memublikasikan file setelah selesai, dan menerapkan retensi lokal.
Hasil yang diharapkan adalah satu path `moonwitness-<UTC timestamp>-<pid>.dump`. Lindungi output
seperti database penuh; jangan commit atau upload ke public issue/artifact.

Simpan salinan production terenkripsi di lokasi terpisah dari database utama. Repository tidak
menetapkan production RPO/RTO atau mengklaim off-site storage otomatis.

## Restore dengan konfirmasi dua langkah

Restore mengganti object dalam target DB. Uji lebih dahulu pada database kosong/terisolasi dan
pastikan target, backup serta hasil backup terverifikasi. Script mewajibkan `ALLOW_DATABASE_RESTORE=true`
dan konfirmasi nama database secara interaktif.

```bash
ALLOW_DATABASE_RESTORE=true BACKUP_FILE=./backups/example.dump bash scripts/restore-postgres.sh
```

Masukkan nama database target hanya setelah memastikan URL dan targetnya benar. Perintah bukan
operasi read-only; jangan jalankan pada production tanpa change procedure dan approval yang sesuai.
Untuk test otomatis yang aman gunakan `pnpm test:restore-drill`, bukan target database biasa.

Setelah restore, jalankan smoke checks aplikasi, verifikasi addon versions, seed identity, login,
dan integritas record sebelum menjadikan salinan sebagai sumber pemulihan.
