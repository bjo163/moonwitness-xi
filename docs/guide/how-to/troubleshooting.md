# Troubleshooting lokal

**Pembaca:** developer yang setup atau test gagal. **Prasyarat:** jalankan service lokal sesuai
[quickstart](../tutorials/quickstart.md). **Verifikasi:** `pnpm verify` dari root harus berakhir
dengan exit code 0.

| Gejala                            | Periksa                                            | Tindakan                                                                                                                              |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| API tidak listen                  | `.env`, port, log startup, PostgreSQL status       | Pastikan `DATABASE_URL` mengarah ke Compose lokal dan service `postgres` berjalan; startup menolak environment/auth/database invalid. |
| `/livez` 200 tetapi `/readyz` 503 | koneksi DB dan statement timeout                   | Cek `docker compose ps` dan log postgres/API; liveness bukan readiness.                                                               |
| Board tidak membuka data          | API ready, Vite proxy dan login session            | Pastikan API port sama dengan `API_PORT`; cek request `/api` dari Board tanpa memasang token ke URL.                                  |
| `401` setelah login               | session/refresh, user dan partner active           | Sign in lagi; role/status selalu dibaca dari DB. Cek auth tests sebelum mengubah token logic.                                         |
| Invalid relation expression       | nama relasi pada metadata model                    | Buka `/api/:model/fields` dan source relation; gunakan graph syntax yang dideklarasikan, mis. `partner,language`.                     |
| seed bentrok setelah upgrade      | external ID, field unik, edit user                 | Jangan hapus `_orm_data`; periksa konflik identity dan jalankan upgrade pada database test terlebih dahulu.                           |
| worker tidak memproses job        | handler module, scheduler trigger, job state/lease | Pastikan process yang relevan berjalan dan queue belum `dead`; cek run history/error tersanitasi.                                     |
| test postgres dilewati            | `POSTGRES_TEST_URL`                                | Arahkan variabel hanya ke DB khusus test; PostgreSQL suite membuat dan menjatuhkan schema terisolasi.                                 |
| diagram atau docs stale           | source manifest dan generated assets               | Jalankan generator yang tercantum dalam error, lalu check; commit output generated bersama source.                                    |

Jangan menyalin log yang berisi Authorization, cookie, URL DSN, atau user data ke laporan publik.
Gunakan request ID untuk korelasi; logger menghapus header sensitif dan metric label tidak memakai
record value.
