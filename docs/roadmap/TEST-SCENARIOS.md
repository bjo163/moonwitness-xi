# Matriks skenario minimum

Tabel ini melengkapi kartu task. Nilai HTTP/status aktual harus mengikuti kontrak API yang didokumentasikan. Jika kontrak saat ini belum jelas, tetapkan dalam test/ADR sebelum refactor, bukan memilih kode response sembarang.

## Fixture bersama

- Company A dan B.
- Superadmin fixture, member A, member B, user nonaktif dan actor tanpa permission.
- Partner yang dapat dibaca A, partner B yang tidak boleh diakses A, dan data archived.
- Dataset list lebih dari dua halaman dengan duplicate display names untuk menguji stable sort.
- User/password/token sintetis hanya untuk DB test.
- Fake external receiver yang merekam event ID; default tidak ada pengiriman ke layanan nyata.
- Database/schema unik per run dan worker. Setup/teardown dimiliki harness.

## Board dan akun

| ID  | Given / When                              | Expected yang harus di-assert                                           |
| --- | ----------------------------------------- | ----------------------------------------------------------------------- |
| B01 | Anonymous membuka private URL             | Redirect login; data private tidak tampil                               |
| B02 | Login valid lalu reload private page      | Session pulih; tidak login loop                                         |
| B03 | Login wrong password dan unknown user     | Pesan umum konsisten; tidak membocorkan keberadaan user                 |
| B04 | Dua request bersamaan saat access expired | Refresh sesuai kontrak, tidak logout acak atau infinite retry           |
| B05 | Logout lalu back navigation               | Data akun lama tidak muncul dari cache                                  |
| B06 | Normal mode lalu Development Mode         | Technical visibility berubah; permission tetap sama                     |
| B07 | Menu tersembunyi dibuka via URL           | API tetap deny bila tidak berhak                                        |
| B08 | Edit own profile                          | Persist setelah reload; partner user lain tidak berubah                 |
| B09 | Locale/timezone valid dan invalid         | Valid tersimpan, invalid tidak merusak preferensi lama                  |
| B10 | Ganti password current salah              | Tidak ada perubahan hash/session                                        |
| B11 | Ganti password valid                      | New login succeeds, old fails, refresh sessions revoked sesuai contract |
| B12 | Filter pada halaman terakhir              | Page reset/clamp; count dan rows konsisten                              |
| B13 | User list with partner,language dan count | Relations benar; tidak ada 400/42803                                    |
| B14 | Country berubah saat state dipilih        | State tidak kompatibel dibersihkan/ditolak sesuai UX                    |
| B15 | Network gagal lalu retry                  | Error actionable, input tersimpan sesuai desain, tidak duplicate write  |
| B16 | Company/account switch                    | Query cache tidak menampilkan data scope sebelumnya                     |
| B17 | Keyboard-only dialog/form                 | Focus order, trap, close, restore dan labels benar                      |
| B18 | Narrow viewport, long names, dark mode    | Tidak clipped/overflow tak sengaja; controls tetap usable               |

## Backend dan data

| ID  | Given / When                            | Expected                                                                         |
| --- | --------------------------------------- | -------------------------------------------------------------------------------- |
| D01 | Fresh base install dengan demo          | 2 users, 12 partners, company dan reference data sesuai contract                 |
| D02 | Edit seed lalu reinstall                | External ID stabil; edit tidak ditimpa                                           |
| D03 | Populated legacy schema upgrade         | Existing records/relations tetap valid                                           |
| D04 | Two startup installers                  | Lock/serialization; tidak duplicate schema/seed                                  |
| D05 | Inject seed/schema failure              | Transaction rollback atau documented safe recovery, tidak silent partial success |
| D06 | Member A CRUD/count/export B            | Deny tanpa row/count leakage                                                     |
| D07 | A assign FK milik B                     | Ditolak sesuai ownership policy                                                  |
| D08 | Unknown/sensitive writable field        | Validation deny/ignore sesuai documented whitelist; tak ada mass assignment      |
| D09 | Excessive domain/eager/limit/payload    | Bounded validation failure sebelum heavy query                                   |
| D10 | Sensitive sentinel pada nested relation | Tidak ada plaintext/hash/token pada response/export/log                          |
| D11 | Duplicate/invalid FK                    | Safe error code; tidak raw SQL/secret                                            |
| D12 | Two conflicting updates                 | Conflict policy ditegakkan, tidak lost update yang tak terdokumentasi            |
| D13 | Superadmin reset di DB fixture          | Command exit code jelas; hash benar; tidak plaintext log                         |

## Background dan operasional

| ID  | Given / When                          | Expected                                                                             |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| J01 | Dua worker claim job sama             | Satu valid lease owner                                                               |
| J02 | Worker mati sesudah claim             | Lease recovery terukur; job tidak stuck selamanya                                    |
| J03 | Retry sampai attempts habis           | Backoff terbatas, dead-letter/history benar                                          |
| J04 | Cancellation/timeout                  | State transition valid; completion terlambat tidak menimpa cancellation tanpa aturan |
| J05 | Business transaction rollback         | Outbox event tidak dikirim                                                           |
| J06 | Receiver sukses tapi ack lokal gagal  | Retry event ID sama; idempotent receiver tidak menggandakan efek                     |
| J07 | Shutdown saat request/job aktif       | Drain sesuai timeout dan safe retry semantics                                        |
| J08 | DB down                               | Readiness gagal; liveness sesuai process health                                      |
| J09 | Restore salah target confirmation     | Ditolak sebelum destructive operation                                                |
| J10 | Backup/restore fixture aplikasi       | Relasi, external ID, account login dan counts tervalidasi                            |
| J11 | Cross-scope attachment/path traversal | Download/upload ditolak tanpa akses file liar                                        |

## Lapisan test yang tepat

- Parser/domain/version planner/gate classifier: unit table tests.
- ORM constraints/transaksi/concurrency: database integration, bukan mocked query builder saja.
- Auth/access/serialization: injected HTTP API plus DB fixture.
- Profile/navigation/forms/cache: browser E2E terhadap API nyata.
- Focus/aria/component variants: component interaction tests dan katalog.
- Pixel/layout: representative screenshot tests dengan audit baseline.
- Release retry/race: fake GitHub/registry adapters tanpa side effect remote; satu real end-to-end verification setelah setup siap.

Gunakan polling kondisi atau fake clock yang relevan. Hindari sleep tetap panjang. Assertion harus memeriksa hasil, bukan hanya tombol diklik atau status request 200.
