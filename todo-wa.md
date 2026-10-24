# WhatsApp (GoWA) — backlog implementasi

> Audit per 24 Oktober 2026. Cakupan: integrasi Board → API MoonWitness → GoWA di workspace ini. Kemampuan GoWA yang belum diverifikasi langsung ditandai untuk validasi, bukan diasumsikan tersedia.

## Kondisi saat ini

Sudah tersedia di kode:

- [x] Satu slot akun WhatsApp per perusahaan dan device ID stabil.
- [x] Endpoint terautentikasi untuk status akun, connect/QR, disconnect, percakapan, pesan, dan media.
- [x] Pembatasan data API berdasarkan perusahaan aktif.
- [x] Inbox percakapan pribadi dan grup; kirim teks serta satu lampiran.
- [x] Polling Board untuk status, percakapan, dan percakapan yang sedang dibuka.
- [x] Cache pesan/lampiran di API; attachment storage mendukung local atau S3-compatible.
- [x] Batas lampiran sekarang 10 MiB, validasi MIME, dan penanganan kegagalan storage.
- [x] Tes route API, E2E Board, build API, typecheck Board, dan uji RustFS lokal pernah lulus.

Belum dibuktikan pada koneksi WhatsApp nyata:

- [ ] Pairing QR GoWA, persistensi sesi setelah restart, kirim/terima pesan nyata.
- [ ] Receipt/status pesan nyata, perilaku grup nyata, dan unduhan media nyata.

Bukti GoWA live: pada 24 Oktober 2026, `GET /app/info` dengan autentikasi ke gateway eksternal
melaporkan `v9.6.0` dan `GET /health` menjawab `OK`; kedua pemeriksaan ada di
`tests/gowa.contract.test.ts` dan lulus terhadap host tersebut. Digest image dan tag deployment
Docker belum dapat dibaca dari API GoWA.

Legenda: **P0** penghambat keselamatan/keandalan; **P1** inbox v1; **P2** media dan grup; **P3** Status/Story; **P4** bisnis dan operasi. Item backlog belum selesai atau belum diverifikasi sampai kriteria item terpenuhi.

> Semua perubahan antarmuka juga memiliki checklist khusus di [`todo-ui.md`](./todo-ui.md), bagian **P. Board WhatsApp**. Item UI di bawah memakai ID silang `WUI-*`; aturan visual, aksesibilitas, komponen shared, serta bukti screenshot mengikuti UI Bible dan package `@moonwitness/ui`.

## P0 — pairing, status koneksi, dan pengiriman aman

- [ ] **P0-01** Pairkan perangkat lewat QR Board dengan GoWA aktual dan catat versi/endpoint. (UI: `WUI-02`, `WUI-08`)
- [ ] **P0-02** Buktikan sesi GoWA bertahan setelah restart container tanpa scan QR ulang.
- [ ] **P0-03** Buktikan sesi dan mapping perusahaan tetap benar setelah restart API, Board, dan PostgreSQL secara terpisah.
- [ ] **P0-04** Uji putus jaringan, pemulihan koneksi, status reconnecting, lalu kembali connected tanpa akun ganda.
- [ ] **P0-05** Lengkapi state machine belum dibuat, meminta QR, QR kedaluwarsa, terhubung, logout, diblokir, dan gateway gagal. API kini membedakan logout (`disconnected`), pemulihan (`reconnecting`), QR kedaluwarsa (`qr_expired`), serta gateway gagal (`error`); GoWA belum menyediakan state blocked yang tervalidasi.
- [ ] **P0-06** Deteksi QR kedaluwarsa/berubah; sediakan aksi Perbarui QR tanpa membuat device slot baru. API menandai QR expired saat gambar QR GoWA menjawab 404 dan Board menyediakan aksi perbarui; tes memakai mock, sehingga aturan expiry harus dikonfirmasi pada sesi GoWA nyata.
- [x] **P0-07** Cegah dua permintaan connect bersamaan membuat device/QR ganda dengan lock atau idempotency. Route memakai PostgreSQL advisory transaction lock; test simultaneous requests kini lulus pada suite SQLite dan PostgreSQL sementara (34 test PostgreSQL lulus, 1 acceptance S3 dilewati).
- [ ] **P0-08** Jangan melaporkan sent sebelum GoWA mengonfirmasi; bedakan antre, terkirim, diterima, dibaca, gagal, dan tidak diketahui. API menerima receipt GoWA `message.ack` melalui webhook bertanda tangan HMAC dan hanya menaikkan status outbound (`sent → delivered → read`). Event `message` juga masuk ke cache percakapan/pesan secara idempotent; unread hanya bertambah untuk pesan inbound baru. Echo outbound yang tiba sebelum HTTP send ack direkonsiliasi ke row `sending` bila hanya ada satu kandidat cocok, mencegah konflik external ID dan pesan ganda. Device/company dipetakan lewat `session_id` dan account, sementara callback memvalidasi HMAC atas body mentah. Connect mendaftarkan event `message,message.ack` bila `WHATSAPP_WEBHOOK_URL` dan `WHATSAPP_WEBHOOK_SECRET` dikonfigurasi. Route/config tests membuktikan signature invalid/device mismatch ditolak, receipt monotonik, pesan privat/grup/media dan outbound echo tercatat satu kali, dan tenant terisolasi. Tetap terbuka sampai callback terpasang pada device GoWA nyata serta receipt delivered/read teramati.
- [x] **P0-09** Tambahkan idempotency key supaya retry HTTP setelah timeout tidak menggandakan pesan. API mewajibkan `Idempotency-Key`, menyimpan hash payload, mengembalikan rekaman yang sama untuk retry identik, dan menolak pemakaian ulang key dengan isi berbeda; diuji di `apps/api/tests/whatsapp.routes.test.ts`.
- [x] **P0-10** Persist outbound message sebagai queued sebelum memanggil GoWA; proses melalui worker dengan retry terkontrol. Pesan dan event outbox dibuat dalam satu transaksi; consumer terpasang pada `outbox-worker` dan pengujian membuktikan event diterbitkan setelah GoWA menerima pesan.
- [x] **P0-11** Sediakan retry pesan gagal dengan backoff, batas percobaan, umur maksimum, dan alasan kegagalan. Outbox memakai exponential backoff dengan batas 1 jam; pesan dibatasi lima attempt total termasuk retry manual dan kedaluwarsa setelah 24 jam di antrean. Error tersimpan sebagai alasan aman; tes membuktikan pesan kedaluwarsa tidak dikirim dan retry berhenti setelah attempt kelima.
- [x] **P0-12** Rekonsiliasi hasil ambigu tanpa kirim ulang buta. Saat pesan `unknown`/`sending` muncul lagi pada riwayat GoWA sebagai outbound, API mengaitkannya hanya jika tenant, percakapan, isi, tipe, dan waktu ±2 menit cocok dengan tepat satu pesan lokal. Jika kandidat ganda/tidak cocok, status tetap ambigu untuk verifikasi manual. Route tests memastikan satu kandidat pulih sebagai terkirim tanpa duplikasi dan kandidat ganda tidak ditautkan secara keliru. Struktur `is_from_me`/timestamp mengikuti [GoWA ChatMessage schema](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/main/docs/openapi.yaml#L5803-L5845); rekonsiliasi pada perangkat hosted belum diuji langsung.
- [x] **P0-13** Simpan kegagalan kirim sebagai rekaman yang bisa ditinjau. Pesan tersimpan sebelum dikirim; kegagalan pasti menjadi `failed`, kegagalan ambigu menjadi `unknown`, dan Board menampilkan alasan serta aksi retry hanya untuk pesan yang aman dicoba ulang.
- [x] **P0-14** Pastikan klien tidak dapat memilih company ID, device ID, atau JID perusahaan lain. Scope selalu berasal dari auth aktif; device ID dibentuk API dari company ID; payload tambahan yang mencoba memilih company/device/JID ditolak. Tes route memverifikasi device ID stabil dan field routing pada send tidak diterima.
- [x] **P0-15** Lengkapi tes isolasi lintas perusahaan untuk akun, connect/disconnect, percakapan, pesan, retry, dan media. Tes route kini membuat dua perusahaan nyata dalam fixture database dan membuktikan connect/disconnect, inbox, riwayat pesan, kirim, retry, serta media pada satu tenant tidak dapat melihat atau mengubah data tenant lainnya.
- [x] **P0-16** Tambahkan rate limit per perusahaan/pengguna untuk connect (5/menit), kirim (20/menit), percakapan baru (10/menit), dan retry (10/menit); pengiriman mengunci pada pasangan company/pengguna dan tes memastikan request ke-21 ditolak.
- [x] **P0-17** Batasi burst pesan sampai 20 per menit per company/pengguna; tes route membuktikan 20 request masuk antrean dan request berikutnya mendapat 429.
- [x] **P0-18** Fallback kredensial GoWA hanya untuk development; startup production ditolak jika kredensial kosong/default. Divalidasi saat konfigurasi API dimuat; tes: `apps/api/tests/whatsapp.config.test.ts`.
- [x] **P0-19** Redaksi Basic Auth, QR, isi pesan, nomor pribadi, dan token dari log, error, trace, dan telemetry. Logger Pino meredaksi authorization/password/token/cookie dan hanya menserialisasi method, route template, serta status; error route WhatsApp menulis konteks terbatas dan mengembalikan error generik; metrik hanya menyimpan method/route/status dan durasi. Tidak ada exporter tracing aktif di API/package logger saat audit 24 Oktober 2026. Tes redaksi logger dan helper GoWA lulus.
- [x] **P0-20** Audit log untuk pairing, logout, kirim, retry, dan akses media tanpa menyimpan isi sensitif. Aksi `connect`, `connect_failed`, `disconnect`, `send_queued`, `retry_queued`, dan `media_access` masuk ke tabel append-only `audit_logs`; metadata hanya memuat area dan company ID selain model, record ID, operation, serta actor ID. Tes memeriksa pairing/logout, send/retry, akses media, dan memastikan isi pesan/nomor tidak ikut tersimpan.
- [x] **P0-21** Tetapkan izin peran untuk connect/disconnect, buat percakapan, kirim, dan retry. System/superadmin boleh mengelola; role user mengikuti grant `whatsapp.account.write`, `whatsapp.conversation.create`, dan `whatsapp.message.create`. API mengembalikan capabilities untuk Board; tes memastikan user tanpa grant hanya dapat membaca dan menerima 403 pada aksi.
- [x] **P0-22** Tambahkan timeout terkonfigurasi, retry hanya untuk operasi aman, circuit breaker, dan batas konkurensi GoWA. Klien GoWA membatasi 8 request aktif per origin, membuka circuit setelah 5 kegagalan beruntun selama 10 detik, lalu mengizinkan satu probe pemulihan; timeout berasal dari konfigurasi. `CIRCUIT_OPEN` dan `GATEWAY_BUSY` dikembalikan ke retry aman outbox sebelum request mencapai GoWA. Unit test mencakup circuit, probe, dan batas konkurensi.
- [x] **P0-23** Tambahkan readiness GoWA; bedakan gateway mati dari akun WhatsApp yang logout. `GET /whatsapp/readyz` mengecek GoWA dengan timeout 5 detik dan melaporkan reachable/unreachable terpisah dari readiness API; tes memastikan GoWA mati tidak membuat API umum tidak ready. Tes route membuktikan akun logout menjadi `disconnected` sedangkan gateway mati menjadi `error`. Probe GoWA live `/health` merespons `OK` pada 24 Oktober 2026.
- [ ] **P0-24** Pin versi/image GoWA yang diuji; deployment GoWA kini eksternal di `wa.moonwitness.biz.id`. Versi live `v9.6.0` dan contract `/app/info` sudah diverifikasi 24 Oktober 2026; catat digest/tag Docker dari host deployment sebelum menutup item.
- [ ] **P0-25** Uji backup/restore volume GoWA; backup PostgreSQL tidak mencakup kredensial perangkat milik GoWA.

## P1 — inbox dan sinkronisasi

- [x] **P1-01** Pagination daftar percakapan. API menerima `limit` 1–100 dan `offset` hingga 10.000, meneruskan halaman ke GoWA dan mengurutkan cache berdasarkan waktu pesan lalu ID. Board memuat 50 percakapan pertama dan menyediakan aksi Load more; tes API memastikan halaman pertama/kedua terurut benar dan provider menerima offset.
- [x] **P1-02** Pagination pesan lama. API menerima `limit` 1–100 dan `offset` 0–5000, meneruskan halaman ke GoWA, dan mengambil halaman cache berdasarkan urutan waktu plus ID; tes memeriksa query pagination provider serta isi halaman kedua.
- [x] **P1-03** Sinkronisasi incremental berdasarkan timestamp. Polling offset 0 mengirim `start_time` dari timestamp pesan cached terbaru dikurangi overlap 10 menit; GoWA menerima filter ISO-8601 `start_time` dan pagination `offset`. Tes mengonfirmasi nilai waktu overlap dan pagination. Sumber kontrak: [GoWA Chat API](https://github.com/aldinokemal/sdk-php-whatsapp-web-multidevice/blob/main/docs/Api/ChatApi.md).
- [x] **P1-04** Pencarian percakapan berdasarkan nama, nomor, dan isi pesan cached. API tetap menyinkronkan halaman percakapan normal dan, saat pencarian aktif, juga meminta GoWA `/chats?search=` (nama chat), lalu menggabungkan hasil dengan data company scope sebelum filter nama/JID/pesan cache dan pagination. Board mendebounce 250 ms. Pesan yang belum pernah disinkronkan tidak dapat dicari berdasarkan isi. Test route mencakup pencarian isi, nomor, pengiriman parameter GoWA, dan isolasi perusahaan. Parameter `search` didokumentasikan di [GoWA OpenAPI](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/main/docs/openapi.yaml); kontrak khusus pada device hosted belum diuji.
- [x] **P1-05** Filter Semua, Belum dibaca, Pribadi, dan Grup. Board menyediakan empat filter; parameter `unread=true` difilter oleh API dalam company scope dan cache Board tetap memeriksa hitungan yang dikembalikan API. Route tests mencakup unread per user dan filter; E2E Chromium memverifikasi unread/private/group termasuk percakapan pribadi yang sudah dibaca.
- [ ] **P1-06** Unread count masih parsial. API menyimpan cursor baca per company, conversation, dan user; event webhook inbound baru kini menaikkan cache unread idempotent dan halaman inbox menggabungkannya dengan cursor. Polling fallback menyinkronkan hingga 100 pesan terakhir ketika timestamp provider berubah. GoWA `/chats` tidak memberi unread count authoritative, jadi jumlah lama sebelum webhook aktif atau saat callback tidak tersedia masih dapat kurang. Tetap terbuka sampai penerimaan webhook nyata dan rekonsiliasi historis/unread selesai dibuktikan.
- [x] **P1-07** Aksi eksplisit menandai pesan inbound terbaru yang sudah tersimpan sebagai dibaca. API company-scoped mengirim GoWA `POST /message/{message_id}/read` dengan JID chat; setelah provider mengonfirmasi, API mencatat cursor baca terpisah untuk pengguna dan menulis audit log. Kegagalan provider tidak mengubah cursor. Tes route memverifikasi receipt, cursor, isolasi pengguna/perusahaan, dan unread count; belum diuji pada device hosted. Didukung kontrak [GoWA OpenAPI](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/main/docs/openapi.yaml).
- [x] **P1-08** Perbarui preview pesan terakhir sebelum percakapan dibuka. API membaca maksimal lima pesan terbaru untuk percakapan di halaman inbox saat preview belum ada atau waktu provider maju, memilih timestamp pesan terbaru, lalu menyimpan preview dalam scope company. Refresh memakai maksimal empat request paralel dan cache mencegah fetch ulang selama waktu/provider preview tidak berubah. Route test memastikan preview muncul sebelum chat dibuka dan request tidak diulang pada poll berikutnya. Daftar chat GoWA tidak mencantumkan isi pesan di schema; endpoint menyediakan `ChatMessage` beserta timestamp dan isi ([schema GoWA](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/main/docs/openapi.yaml#L5711-L5845)).
- [x] **P1-09** Urutkan dengan timestamp provider dan tie-break stabil: percakapan `last_message_at desc, id desc`, pesan `create_date desc, id desc`. Test route baru menyisipkan beberapa percakapan dan pesan dengan timestamp identik, lalu membuktikan ID lebih besar tampil lebih dulu. Test lulus pada fixture SQLite; varian PostgreSQL masih menunggu `WHATSAPP_TEST_DATABASE_URL`.
- [x] **P1-10** Tangani timezone, timestamp invalid, pesan terlambat, dan pesan lama yang baru tersinkron. Timestamp ISO valid dinormalisasi ke UTC; pesan tanpa timestamp valid dilewati (bukan diberi waktu saat ini), timestamp chat invalid tidak menghapus waktu cache, dan pesan lama yang datang terlambat tidak menurunkan preview/waktu terbaru. Tes API mencakup pesan lama terlambat dan timestamp invalid untuk pesan serta chat.
- [ ] **P1-11** Penanda pesan baru/terakhir dibaca dan scroll ke pesan terbaru. (UI: `WUI-04`)
- [x] **P1-12** Muat riwayat sebelumnya saat scroll ke atas tanpa mengambil seluruh chat. Board meminta halaman 50 pesan dan otomatis memuat halaman berikutnya ketika pengguna mencapai bagian atas; tombol aksesibel juga tersedia untuk memuat halaman lama.
- [ ] **P1-13** Board sudah menampilkan skeleton/empty state inbox, error dan Retry per pane untuk percakapan/pesan, retry umum, serta mempertahankan data cache saat refresh gagal. Audit akhir masih perlu memastikan error gateway vs storage dibedakan dengan bahasa yang jelas pada setiap media/pairing state dan ditinjau di browser. (UI: `WUI-02`, `WUI-03`)
- [x] **P1-14** Board menampilkan waktu sinkronisasi inbox terakhir dan memberi peringatan saat refresh gagal; data cache tetap ditampilkan beserta aksi Retry. E2E Chromium di PostgreSQL sementara memverifikasi retry setelah request pencarian gagal; inbox cache tetap dapat dipulihkan.
- [ ] **P1-15** Hentikan/perlambat polling saat tab Board tidak aktif. Ketiga query Board kini menyetel `refetchIntervalInBackground: false`; verifikasi tambahan tab tersembunyi masih diperlukan.
- [ ] **P1-16** Evaluasi SSE/WebSocket atau webhook GoWA; endpoint HMAC kini memproses event inbound `message` dan receipt `message.ack`, dan connect mendaftarkan kedua event ke device. Board tetap polling setiap 2,5 detik sebagai refresh/pemulihan; belum ada SSE/WebSocket dan callback belum diaktifkan pada host GoWA nyata karena public origin API serta webhook secret belum dikonfigurasi. Unit route tests menguji HMAC, duplikasi, pesan privat/grup/media, dan status receipt. Kontrak mengikuti [GoWA webhook payload docs](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/main/docs/webhook-payload.md) dan [GoWA OpenAPI](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/main/docs/openapi.yaml).
- [ ] **P1-17** Notifikasi in-app untuk pesan baru dengan preferensi pengguna.
- [ ] **P1-18** Simpan pilihan percakapan dan filter agar konteks tidak hilang saat navigasi.
- [ ] **P1-19** Header kontak dengan nomor/JID ternormalisasi, bukan nama saja.
- [ ] **P1-20** Pemetaan @lid dan nomor yang berubah tanpa membuat percakapan duplikat.
- [ ] **P1-21** Merge/alias percakapan saat provider mengganti JID atau menyatukan identitas.
- [ ] **P1-22** Kelola arsip dan pin chat. Archive/unarchive tersambung ke GoWA `POST /chat/{chat_jid}/archive`; Board dapat beralih antara Active dan Archived, dan API meminta `/chats?archived=true|false`. Pin/unpin memakai `POST /chat/{chat_jid}/pin`, dicatat di DB dan menaikkan urutan inbox; action company-scoped, memakai grant `whatsapp.conversation.write`, serta masuk audit log. Route tests mencakup scope, role, sinkronisasi, dan urutan. OpenAPI GoWA v9.6.0 menyatakan chat list memiliki `archived`, tetapi tidak mengembalikan status pin; perubahan pin dari perangkat lain belum tersinkron. Tidak ada endpoint mute yang terdokumentasi pada kontrak v9.6.0, dan hide lokal belum dibuat ([GoWA v9.6.0 OpenAPI](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/62e319d/docs/openapi.yaml#L2732-L2770), [archive/pin endpoints](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/62e319d/docs/openapi.yaml#L2944-L3076)). (UI: `WUI-03`)
- [ ] **P1-23** Label/tag percakapan dan filter berdasarkan label.
- [ ] **P1-24** Assignment chat ke anggota/tim, state open/closed, dan antrean agen.
- [ ] **P1-25** Catatan internal yang tidak dikirim ke WhatsApp.
- [ ] **P1-26** Keyboard navigation, pencarian cepat, dan waktu lokal yang aksesibel.
- [ ] **P1-27** Verifikasi layout ponsel untuk daftar chat, navigasi kembali, composer, dan QR. (UI: `WUI-01`, `WUI-07`)
- [ ] **P1-28** Receipt delivered/read kini diterapkan lewat webhook GoWA `message.ack` bertanda tangan dan Board menampilkan label Delivered/Read. Route/config tests mencakup transisi monotonic serta replay; masih perlu receipt live dari device GoWA untuk menutup.
- [ ] **P1-29** Indikator status terkirim, diterima, dibaca, gagal pada setiap bubble pesan. (UI: `WUI-04`)
- [ ] **P1-30** Timestamp lokal pada tiap pesan. (UI: `WUI-04`)
- [ ] **P1-31** Enter untuk kirim dan Shift+Enter untuk baris baru dengan preferensi. (UI: `WUI-05`)
- [ ] **P1-32** Indikator sedang mengirim dan perlindungan klik ganda lintas tab/perangkat. (UI: `WUI-05`)
- [ ] **P1-33** Balas/quote pesan dengan tautan ke pesan asal.
- [ ] **P1-34** Forward pesan jika API GoWA mendukung.
- [ ] **P1-35** Edit/hapus/unsend pesan milik sendiri sesuai batas waktu WhatsApp, jika didukung.
- [ ] **P1-36** Reaksi emoji pada pesan jika didukung GoWA.
- [ ] **P1-37** Salin teks dan menu aksi pesan yang aksesibel. (UI: `WUI-04`, `WUI-07`)
- [ ] **P1-38** Pesan sistem, deleted, view-once, dan jenis pesan baru ditangani aman.
- [x] **P1-39** Deduplikasi outbound saat provider mengirim pesan kembali ke sinkronisasi. Reconciliation memperbarui row outbound lokal yang idempotency key-nya masih pending dengan external ID GoWA sebelum upsert riwayat; `company_id + external_id` menjaga upsert berikutnya tetap idempotent. Route tests membuktikan satu pesan lokal tetap menjadi satu row.
- [x] **P1-40** Deduplikasi external ID dengan cakupan device/account yang benar. Satu akun per company dijamin oleh unique company pada akun; pesan memakai unique `(company_id, external_id)` agar ID GoWA tidak bentrok lintas tenant dan konsisten dengan invariant satu device per company. Route tests memeriksa isolasi dua company.
- [x] **P1-41** Tes jaringan gagal sebelum acceptance, response hilang setelah GoWA menerima pesan, error 4xx/5xx, replay event, dan preview setelah event terlambat. Hasil 4xx menjadi failed permanen; 5xx/network tanpa ack menjadi unknown; echo outbound unik dari riwayat GoWA menyelesaikan unknown tanpa kirim kedua; kandidat ganda tetap unknown. Tes replay memperbaiki row/preview tanpa resend dan timestamp lama tidak menimpa preview yang lebih baru. Seluruh route suite lulus pada SQLite (48 lulus, 1 dilewati termasuk media) dan PostgreSQL (34 lulus, 1 acceptance S3 dilewati).

## P2 — media, kontak, dan grup

- [ ] **P2-01** Uji nyata kirim/terima gambar, dokumen, audio, video melalui GoWA.
- [ ] **P2-02** Verifikasi format dan batas tiap tipe media terhadap GoWA aktual.
- [ ] **P2-03** Ganti Base64 dengan multipart/streaming supaya file tidak digandakan di memori dan ukuran payload tidak membesar.
- [ ] **P2-04** Tentukan batas ukuran tiap tipe; saat ini semua berkas dibatasi 10 MiB.
- [ ] **P2-05** Upload langsung ke storage memakai URL singkat bertanda tangan dan izin perusahaan.
- [ ] **P2-06** Progress upload/download, cancel, retry, dan indikator kecepatan. (UI: `WUI-06`)
- [ ] **P2-07** Preview PDF/dokumen aman, ukuran file, dan penanganan ekstensi berbahaya. (UI: `WUI-06`)
- [x] **P2-08** Validasi MIME berbasis signature untuk upload dan unduhan. API mendeteksi PNG/JPEG/GIF/WebP, MP4/QuickTime/WebM, MPEG/MP4/Ogg/WAV audio, PDF, serta OOXML/Office lama; MIME spesifik yang tidak cocok ditolak saat upload, MIME unduhan provider diabaikan untuk menentukan tipe respons, signature tak dikenal dipaksa menjadi `application/octet-stream` dan attachment. Board memakai `Blob.type` terverifikasi untuk memilih preview. Unit test signature dan route test mencakup mismatch PNG/JPEG, spoof header image/png dengan body HTML, `nosniff`, dan batas ukuran. Upload `application/octet-stream` tetap diperbolehkan sebagai attachment generik; inspeksi arsip OOXML hanya mencari signature nama entri, bukan melakukan malware scan (P2-09).
- [ ] **P2-09** Malware scan atau karantina sebelum lampiran dapat diunduh.
- [x] **P2-10** Media hanya inline untuk tipe yang dikenali dari signature (gambar, audio, video, PDF); tipe lain memakai attachment. Semua respons media mengirim `X-Content-Type-Options: nosniff` dan `Content-Security-Policy: default-src 'none'; sandbox; base-uri 'none'; form-action 'none'`. Route tests memeriksa header pada media inline tepercaya dan signature tak dikenal.
- [ ] **P2-11** Thumbnail gambar dan poster video untuk mengurangi bandwidth. (UI: `WUI-04`, `WUI-06`)
- [x] **P2-12** Streaming download supaya file tidak dimuat penuh ke RAM API. Jalur unduh GoWA → storage → Board memakai stream saat storage menyediakan `putStream`/`getStream`; storage lokal menulis atomik ke file sementara dan S3 memakai multipart upload dengan satu part in-flight. Batas 10 MiB, SHA-256, deteksi MIME dari prefix, dan validasi `Content-Length` tetap aktif. API/storage build serta route dan storage tests lulus. Adapter lama tanpa dukungan stream masih memakai jalur Buffer; driver local/S3 produksi mendukung stream.
- [ ] **P2-13** Retensi, penghapusan terjadwal, kuota perusahaan, dan pembersihan object yatim.
- [x] **P2-14** Kompensasi jika GoWA berhasil mengirim tetapi penyimpanan pesan/cache gagal. Worker menyimpan ID/ack GoWA pada payload outbox sebelum mengubah row pesan; saat retry, ack memulihkan status `sent` dan preview tanpa memanggil GoWA ulang. Jika pesan sudah tersimpan tetapi preview gagal, replay memperbaiki preview dari row pesan. Route test menyuntikkan kegagalan pada kedua tahap dan memastikan hanya ada satu panggilan kirim. Jika PostgreSQL sama sekali tidak dapat menyimpan ack outbox, hasil tetap ambigu dan pesan tidak dikirim ulang otomatis; perlu verifikasi manual.
- [ ] **P2-15** Uji backup/restore attachment untuk mode local dan S3/RustFS.
- [ ] **P2-16** Beberapa lampiran per pesan jika GoWA mendukung.
- [ ] **P2-17** Album, voice note, dokumen bercaption, dan preview audio yang benar jika didukung.
- [ ] **P2-18** Tampilkan pengirim dan caption media grup secara konsisten. (UI: `WUI-04`)
- [x] **P2-19** Route tests mencakup file kosong/Base64 rusak, filename traversal serta control-character (upload dan nama dari GoWA), MIME palsu, body di atas 10 MiB, batas tepat 10 MiB, storage put gagal sebelum antrean, dan body unduhan provider yang lebih pendek dari `Content-Length`. File terpotong ditolak dengan 502 sebelum ditulis ke attachment storage; nama file dibersihkan sebelum disimpan/dikembalikan.
- [ ] **P2-20** Sinkronisasi nama kontak, nomor, foto profil, dan perubahan profil jika tersedia.
- [ ] **P2-21** Validasi nomor internasional dan cek apakah nomor terdaftar.
- [ ] **P2-22** Nama peserta grup; sekarang sender grup hanya menampilkan bagian nomor dari JID. (UI: `WUI-04`)
- [ ] **P2-23** Sinkronisasi nama, foto, deskripsi, topik, dan jumlah anggota grup.
- [ ] **P2-24** Buat grup dan pilih peserta jika didukung GoWA.
- [ ] **P2-25** Kelola anggota, admin, undangan, dan keluar grup jika didukung.
- [ ] **P2-26** Event sistem grup: anggota masuk/keluar, perubahan nama, admin, dan pengumuman.
- [ ] **P2-27** Mention anggota grup dengan picker dan preview. (UI: `WUI-05`)
- [ ] **P2-28** Izin grup/komunitas hanya ditampilkan jika benar-benar didukung provider.
- [ ] **P2-29** Tes grup besar, JID @lid, identitas berubah, dan pesan admin/non-admin.

## P3 — WhatsApp Status/Story

- [ ] **P3-01** Audit dan contract-test endpoint Status yang benar-benar tersedia pada versi GoWA terpasang.
- [ ] **P3-02** Tetapkan cakupan: melihat Status, membuat Status, atau keduanya.
- [ ] **P3-03** Daftar Status kontak dengan pemilik, waktu unggah, sisa masa berlaku, dan urutan.
- [ ] **P3-04** Viewer foto/video dengan auto-advance, pause, mute, dan progress.
- [ ] **P3-05** Terapkan masa berlaku 24 jam dan hapus cache Status kedaluwarsa.
- [ ] **P3-06** Penanda sudah/belum dilihat dan receipt jika GoWA menyediakan.
- [ ] **P3-07** Audience/privacy Status jika provider memberi kontrol yang aman.
- [ ] **P3-08** Buat Status teks dengan latar, font, emoji, dan batas karakter.
- [ ] **P3-09** Buat Status foto/video dengan crop, caption, durasi, dan validasi media.
- [ ] **P3-10** Hapus Status sendiri jika didukung dan verifikasi dari perangkat.
- [ ] **P3-11** Balas Status sebagai pesan privat dengan konteks Status.
- [ ] **P3-12** Reaksi Status jika GoWA mendukung.
- [ ] **P3-13** Daftar penonton Status sendiri jika data tersedia dan sesuai kebijakan privasi.
- [ ] **P3-14** Jadwal publikasi Status dengan zona waktu perusahaan.
- [ ] **P3-15** Analytics tayangan, balasan, dan error hanya dari metrik provider yang nyata.
- [ ] **P3-16** Test mock, contract test, dan uji nyata per tipe Status sebelum fitur dirilis.

## P4 — bisnis, UX, dan operasi

- [ ] **P4-01** Balasan cepat/template dengan variabel kontak dan shortcut.
- [ ] **P4-02** Pesan terjadwal: edit, cancel, timezone, antrean, dan retry aman.
- [ ] **P4-03** Broadcast dengan preview, persetujuan, rate limit, dan audit.
- [ ] **P4-04** Impor/ekspor kontak dan daftar broadcast dengan validasi serta company scope.
- [ ] **P4-05** Segmentasi pelanggan berdasarkan label dan atribut yang diizinkan.
- [ ] **P4-06** Auto-reply jam kerja, sambutan, dan pesan tidak tersedia.
- [ ] **P4-07** Rule sederhana berdasarkan kata kunci, waktu, label, dan state chat.
- [ ] **P4-08** Bot/AI dengan kebijakan handoff ke agen.
- [ ] **P4-09** Handoff manusia-bot, assignment, SLA, antrean, dan eskalasi.
- [ ] **P4-10** Webhook/event internal idempotent untuk modul MoonWitness lain.
- [ ] **P4-11** Tautkan nomor ke CRM/lead/customer tanpa membuat record duplikat.
- [ ] **P4-12** Pencarian global inbox dengan izin dan scope perusahaan.
- [ ] **P4-13** Ekspor riwayat untuk dukungan/audit dengan redaksi yang sesuai.
- [ ] **P4-14** Layout dua-pane responsif dan navigasi chat nyaman di layar kecil. (UI: `WUI-01`)
- [ ] **P4-15** Avatar dan status online/typing hanya jika tersedia dari provider. (UI: `WUI-04`)
- [ ] **P4-16** Empty state yang mengarahkan pengguna ke connect atau chat pertama. (UI: `WUI-02`, `WUI-03`)
- [ ] **P4-17** Konfirmasi sebelum disconnect/logout karena sesi linked-device akan putus. (UI: `WUI-02`)
- [ ] **P4-18** Bantuan QR: cara scan, masa berlaku, linked devices, dan troubleshooting. (UI: `WUI-02`)
- [ ] **P4-19** Keyboard shortcut dan aria/fokus untuk inbox, composer, attachment, menu. (UI: `WUI-07`)
- [ ] **P4-20** Reduced motion, kontras, dan penanda status yang tidak bergantung pada warna. (UI: `WUI-07`)
- [ ] **P4-21** Lokalisasi Indonesia/Inggris untuk label, error, waktu, dan nomor. (UI: `WUI-07`)
- [ ] **P4-22** Preview draft media, remove/cancel, dan pemulihan draft setelah refresh. (UI: `WUI-06`)
- [ ] **P4-23** Test retry media saat storage gagal. (UI: `WUI-06`, `WUI-08`)
- [ ] **P4-24** Test visual/responsif 390 px, tablet, keyboard-only, dan screen reader. (UI: `WUI-08`)
- [ ] **P4-25** Metrik GoWA latency, status akun, antrean, kegagalan/retry, ukuran media, durasi poll.
- [ ] **P4-26** Alarm gateway mati, akun logout, QR kedaluwarsa, antrean macet, storage penuh.
- [ ] **P4-27** Tampilan admin status per perusahaan tanpa membuka isi pesan yang tidak diperlukan.
- [ ] **P4-28** Health/readiness yang memeriksa auth GoWA secara read-only.
- [ ] **P4-29** Graceful shutdown/backpressure supaya deploy tidak memotong pengiriman berjalan.
- [ ] **P4-30** Load test polling untuk banyak perusahaan dan percakapan.
- [ ] **P4-31** Retensi pesan/media/log/audit dan purge data sesuai lifecycle perusahaan.
- [ ] **P4-32** Penghapusan/ekspor data perusahaan meliputi mapping DB, cache, media, dan sesi GoWA.
- [ ] **P4-33** Runbook restore PostgreSQL, volume GoWA, bucket attachment, dan urutan pemulihan.
- [ ] **P4-34** Secret manager dan prosedur rotasi GoWA credentials tanpa bocor ke client bundle.
- [ ] **P4-35** Isolasi jaringan: hanya API dapat mengakses GoWA; jangan buka panel publik tanpa proteksi.
- [ ] **P4-36** Compatibility matrix versi GoWA/API dan prosedur rollback.
- [ ] **P4-37** Backup sebelum upgrade GoWA dan tes bahwa upgrade tidak merusak linked session.
- [ ] **P4-38** Runbook QR tidak tampil, 401 Basic Auth, device hilang, storage penuh, dan logout.
- [ ] **P4-39** Samakan dokumentasi cache media dengan pilihan ATTACHMENT_STORAGE_DRIVER local/S3-RustFS.
- [ ] **P4-40** Release gate berisi mock test, PostgreSQL test, E2E Board, GoWA contract test, QR, reconnect, dan pesan nyata.

## Gate penyelesaian

- [ ] **G1** Semua P0 selesai atau ada keputusan eksplisit dengan mitigasi.
- [ ] **G2** Pairing, restart/reconnect, chat pribadi/grup, teks, receipt, dan media diverifikasi dengan GoWA nyata.
- [ ] **G3** Test isolasi, API, E2E Board, storage, dan contract GoWA lulus CI.
- [ ] **G4** Backup/restore, monitoring, secret, upgrade, rollback terdokumentasi dan diuji.
- [ ] **G5** Scope Status/Story, broadcast/automation, dan multi-agent diputuskan.
- [ ] **G6** Perubahan yang disetujui di-commit dan dipush ke branch rilis; perubahan lokal lain tidak tercampur.
