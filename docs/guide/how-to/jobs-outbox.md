# Menjalankan jobs, scheduler, dan outbox

**Pembaca:** operator development dan pembuat handler. **Prasyarat:** `.env` menunjuk PostgreSQL
lokal dan addon Jobs sudah dipasang oleh API. **Verifikasi:** jalankan
`pnpm --filter @moonwitness/jobs test`; hasil saat ini 12 tes lulus.

## Proses terpisah

Jalankan setiap proses pada terminal sendiri setelah environment disiapkan:

```bash
pnpm jobs:scheduler
pnpm jobs:worker
pnpm jobs:outbox
```

Command tersebut menjalankan scheduler, queue worker, dan outbox worker dari package API. Worker
mengambil konfigurasi yang sama dari `.env`; jangan menjalankan beberapa local copies dengan host
health port yang sama. HTTP health probe worker nonaktif secara default. Jika diaktifkan, ikat ke
loopback/private interface dan periksa `/livez` serta `/readyz`.

## Tulis handler yang aman untuk retry

Job delivery bersifat at-least-once. Proses dapat melakukan side effect lalu mati sebelum mencatat
success, sehingga attempt baru mungkin mengulang. Pakai idempotency key stabil atau deduplikasi di
receiver; fencing token hanya mencegah claim lama menulis status DB dan tidak membatalkan panggilan
external yang sedang berjalan.

Outbox mengirim ID event database yang sama saat retry sehingga receiver dapat deduplicate. Retry,
lease expiry dan cancellation dicatat pada database. Scheduler timezone memakai IANA zone; pilih
missed-run policy (`skip`, `coalesce`, `catch_up`) secara eksplisit.

Detail state transition ada di [runtime contract](../../engineering/jobs-runtime.md). Contoh cron
seed base bersifat disabled dan tidak menjadwalkan pekerjaan sampai diaktifkan.
