# Menjalankan dan menguji Board

**Pembaca:** frontend engineer atau maintainer Board. **Prasyarat:** ikuti [quickstart](../tutorials/quickstart.md)
sampai API `readyz` sehat. **Verifikasi:** `pnpm --filter @moonwitness/board typecheck`,
`pnpm --filter @moonwitness/board lint`, lalu `pnpm test:e2e` pada lingkungan dengan PostgreSQL test.

## Dev server

Jalankan `pnpm dev:board` dari root dan buka `http://localhost:5173`. Vite mem-proxy `/api`, `/auth`,
`/jsonrpc`, dan `/health` ke API lokal. `BOARD_API_TARGET` dapat mengganti target; jangan arahkan
browser test atau Board dev ke database yang berisi data penting.

Board membangun navigasi/view dari metadata server dan menggunakan public SDK serta `@moonwitness/ui`.
Perubahan menu/model perlu dicek dengan actor yang sesuai role serta role terbatas; jangan hanya
memvalidasi tampilan sebagai superadmin.

## Pemeriksaan perubahan

```bash
pnpm --filter @moonwitness/board typecheck
pnpm --filter @moonwitness/board lint
pnpm test:e2e
```

Typecheck harus exit 0. Lint saat ini exit 0 tetapi memiliki sejumlah warning React lama yang tercatat
di [baseline](../../engineering/baseline.md). E2E memulai stack terisolasi dan menghasilkan JUnit/
screenshot test output; CI memindai report sebelum menyimpan artefak.
