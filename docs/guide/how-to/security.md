# Security untuk developer dan operator

**Pembaca:** engineer yang mengatur environment, auth, atau upload. **Prasyarat:** paham environment
deployment dan data test. **Verifikasi:** `pnpm --filter @moonwitness/api test -- tests/auth.test.ts`
dapat dipakai untuk auth-focused suite; seluruh package suite tetap menjadi cek utama.

## Local secrets

Salin `.env.example` ke `.env`, simpan hanya di mesin lokal, dan jangan menempelkan isi file ke issue,
terminal capture, atau dokumentasi. `JWT_SECRET` harus persistent dan acak minimal 32 karakter.
`SUPERADMIN_PASSWORD` hanya bootstrap password akun superadmin jika field password masih kosong;
mengubah `.env` setelah password terisi tidak mereset akun. Gunakan `pnpm reset:superadmin-password`
setelah menetapkan nilai baru lokal bila reset memang dibutuhkan.

Hash password memakai scrypt; refresh credential disimpan sebagai hash dan dirotasi. Protected
request memeriksa status user/partner dan role saat ini. Baca batas sesi, rate limits, dan invalidasi
di [auth security contract](../../engineering/authentication-security.md).

## File upload dan probe

Attachment upload dibatasi 10 MiB, allowlist MIME, nama aman, dan response download `no-store` serta
`nosniff`. Storage key tidak berasal dari nama file. `ATTACHMENT_STORAGE_DIR` harus persisten dan
dibagi antarreplika API yang memakai DB sama. Seed attachment hanya placeholder tanpa file bytes.
Lihat [attachment contract](../../engineering/attachments.md).

Readiness `/readyz` menyentuh DB; liveness `/livez` hanya proses. Health probes worker tidak
terautentikasi, sehingga jangan diekspos ke jaringan publik.

## Vulnerability scan exceptions

Container CI memblokir temuan Trivy `CRITICAL`. Jangan menambahkan pengecualian luas berdasarkan
severity atau package name: setiap entri di `docs/security/vulnerability-policy.json` harus menunjuk
tepat ke SARIF rule ID dan satu target (`workspace`, `api-image`, atau `board-image`), serta mencatat
owner, alasan, dan expiry kalender. Target lain dan rule ID lain tetap diblokir; entri duplikat,
tanggal tidak valid, atau exception kedaluwarsa menggagalkan pemeriksaan policy. Pastikan exception
memang diperlukan, telah direview, dan hapus segera setelah perbaikan tersedia.
