# Referensi API

**Pembaca:** pemakai HTTP API atau SDK. **Prasyarat:** API lokal hidup dan pengguna memiliki sesi
yang berwenang. **Verifikasi:** buka `http://localhost:3000/docs` untuk OpenAPI/Swagger UI, atau
jalankan `pnpm --filter @moonwitness/api test`; suite API lokal saat ini melaporkan 85 tes lulus.

## Endpoint penemuan

| Endpoint                 | Kegunaan                                                     |
| ------------------------ | ------------------------------------------------------------ |
| `GET /livez`             | Liveness proses HTTP; tidak membuktikan database siap.       |
| `GET /readyz`            | Readiness API dan koneksi PostgreSQL terbatas.               |
| `GET /health`            | Alias kompatibilitas untuk readiness.                        |
| `GET /api/models`        | Daftar model yang terlihat oleh actor saat ini.              |
| `GET /api/:model/fields` | Metadata field untuk model yang diizinkan.                   |
| `GET /api/:model/views`  | Metadata list/form/search view.                              |
| `/auth/*`                | Login, refresh, logout, perubahan password, dan profil sesi. |

Route `/api/:model` menyediakan search/read, create, update, archive, dan action sesuai permission.
Filter `domain`, `fields`, pagination (`offset`, `limit`), `order`, eager relation (`with`), serta
`count` didokumentasikan sebagai bagian kontrak SDK.

## Client dan kompatibilitas

Gunakan root exports `@moonwitness/client`; jangan bergantung pada file internal `apps/api/src`.
HTTP API saat ini belum memiliki URL prefix dengan versi terpisah. Perubahan API dirilis bersama
kontrak package dan mengikuti [kebijakan kompatibilitas](../../engineering/compatibility.md).
Respons dapat menambah field; client harus mengabaikan field baru yang tidak dikenal. Error response
mengandung status HTTP dan pesan `error`; client memetakan status umum ke exported error classes.

Contoh nilai akun/password sengaja tidak dicantumkan. Gunakan akun test lokal dari quickstart dan
jangan menaruh bearer token pada log, URL, screenshot, atau dokumentasi publik.

## Catatan generated reference

Halaman ini menjelaskan kontrak manual yang diverifikasi terhadap source. Ekstraksi seluruh route,
schema dan response tetap menjadi deliverable M6.02; jangan menganggap tabel ini sebagai OpenAPI
dump lengkap.
