# Quickstart lingkungan lokal

**Pembaca:** developer yang baru membuka repository. **Prasyarat:** Node.js 22, pnpm 11,
Docker Compose, dan akses ke repository. Semua perintah di halaman ini menargetkan database
development lokal; jangan arahkan ke database bersama atau production.

## 1. Siapkan environment dan PostgreSQL

Salin template environment, isi `SUPERADMIN_PASSWORD` untuk akun lokal, buat `JWT_SECRET` acak
minimal 32 karakter, lalu pastikan `DATABASE_URL` menunjuk PostgreSQL lokal dari Compose. Jangan
commit file `.env` atau menyalin nilai environment dari deployment.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install --frozen-lockfile
```

Di PowerShell, salin template dengan `Copy-Item .env.example .env`. Compose memakai port loopback
`127.0.0.1:5432`; tunggu sampai `docker compose ps` menampilkan service `postgres` berjalan sebelum
memulai API.

## 2. Build dan jalankan API

```bash
pnpm build
pnpm dev
```

API membaca `.env`, memasang addon base/auth secara programmatic, dan baru listen setelah koneksi
database serta seed startup siap. Periksa `http://localhost:3000/readyz`: hasil yang diharapkan
adalah HTTP 200 dengan readiness bernilai sehat. `/livez` hanya membuktikan proses hidup; gunakan
`/readyz` untuk memeriksa database.

## 3. Jalankan Board

Buka terminal kedua dari root repository:

```bash
pnpm dev:board
```

Buka `http://localhost:5173`. Board mem-proxy `/api`, `/auth`, `/jsonrpc`, dan `/health` ke API
lokal. Login dengan `superadmin` dan password development yang ditetapkan di `.env`. Seed contoh
berisi company, user, partner, dan data referensi; gunakan hanya untuk eksplorasi lokal.

## 4. Verifikasi perubahan

```bash
pnpm verify
pnpm test:integration
```

`pnpm verify` menjalankan lint, format, build/typecheck, unit test, architecture checks, serta
docs checks. Tes PostgreSQL membutuhkan `POSTGRES_TEST_URL` yang menunjuk database test terisolasi;
tes membuat dan menghapus schema acak sendiri. Hasil yang diharapkan adalah command berakhir dengan
exit code 0. Jangan menjalankan tes yang membuat/menghapus schema pada database berisi data penting.

Untuk menghentikan service lokal, jalankan `docker compose down`. Tambahkan `-v` hanya bila memang
ingin menghapus volume database development dan seluruh seed/perubahan lokal.
