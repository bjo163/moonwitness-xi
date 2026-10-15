# Kebijakan sinkronisasi roadmap dan GitHub Issues

Kebijakan ini menetapkan sumber kebenaran untuk sinkronisasi M11.01. Tujuannya adalah memberi maintainer satu issue yang bisa ditelusuri untuk setiap task roadmap tanpa menjadikan issue sebagai instruksi eksekusi kode atau sumber status delivery. Kontrak format body, identitas stabil, workflow bootstrap, dan test reconciler tetap dirinci di [kontrak sinkronisasi](../roadmap/ISSUE-SYNC-CONTRACT.md).

## Otoritas per field

| Field                                                                              | Sumber kebenaran                           | Aturan sinkronisasi                                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Repository ID dan Task ID                                                          | Git source (`tasks.json`)                  | Marker task yang stabil menjadi identitas; nomor issue atau judul tidak menjadi key.                                      |
| Judul, scope, dependencies, acceptance, milestone, labels namespace `roadmap/*`    | Kartu roadmap di `dev` setelah tervalidasi | Renderer memperbarui field/body terkelola dari source. Rename judul tidak membuat issue baru.                             |
| Status acceptance dan evidence                                                     | `ROADMAP.md` serta evidence card di Git    | Issue yang ditutup manual tidak mengubah checkbox atau status evidence.                                                   |
| Assignee, komentar, triage, blocked reason dari maintainer                         | GitHub Issues                              | Disimpan sebagai data manusia; sync tidak menghapus atau menulis ulang.                                                   |
| Catatan maintainer                                                                 | Bagian body di luar marker managed         | Dipertahankan byte-for-byte saat blok managed berubah; marker rusak atau duplikat menghasilkan conflict, bukan overwrite. |
| Source SHA, commit pushed, CI run/check, PR promotion, merge SHA, release manifest | Git/GitHub metadata yang diverifikasi      | Bot hanya menambahkan status yang dibuktikan oleh SHA dan run yang sama; nilai lama tidak boleh menandai head baru lolos. |
| Proposal perubahan scope atau acceptance dari issue                                | Bukan source sampai diterima maintainer    | Proposal dipindahkan ke perubahan source pada `dev`, direview dan divalidasi sebelum issue block disinkronkan kembali.    |

Field di luar namespace yang dikelola bot, seperti labels triage pribadi, tidak dihapus. Jika source menghapus sebuah task, issue menjadi orphan untuk triage manusia; bot tidak menghapus issue atau diskusinya.

## Lifecycle dan aturan close

`planned`, `in-progress`, `blocked`, dan `verified-dev` adalah status implementasi task. `in-main` dan `released` adalah status delivery yang terpisah: task dapat sudah verified-dev tetapi belum masuk `main`, atau masuk `main` tetapi belum berada dalam manifest release.

Issue tetap terbuka selama acceptance task belum selesai. `verified-dev` hanya boleh ditulis setelah source SHA yang tepat dipush ke `dev` dan checks yang diwajibkan untuk task itu lulus pada SHA yang sama. Status `in-main` memerlukan merge SHA yang terverifikasi; `released` memerlukan manifest release. Pekerjaan dokumentasi yang tidak membutuhkan release aplikasi tidak perlu menunggu `released` untuk memenuhi acceptance.

Penutupan manual adalah intent maintainer, bukan bukti completion. Jika issue ditutup sebelum acceptance tercapai, sync melaporkan `needs-triage` dan mempertahankan source roadmap/evidence apa adanya. Bot tidak membuka-tutup issue berulang secara otomatis. Maintainer menentukan apakah issue memang dihentikan; perubahan rencana diterapkan ke source dan direview, atau issue dibuka kembali secara eksplisit.

## Perubahan dari issue dan batas kepercayaan

Issue dapat mengusulkan bug, addon, atau perubahan roadmap. Issue tidak menjalankan shell, mengubah file, membuat commit, menjalankan release, atau menentukan URL yang akan di-fetch. Maintainer menerima proposal dengan mengedit source pada `dev`; hasilnya melalui review dan CI sebelum menjadi generated content pada issue.

Webhook, issue comment, title, body, labels, dan file attachment dianggap input eksternal. Parser hanya menerima command/status yang terdaftar dan actor berwenang. Semua mutation harus serial, idempotent, terikat ke source SHA yang masih current, dan mempunyai dry-run plan sebelum apply. Credential hanya berasal dari workflow secret/App installation yang dibutuhkan; nilainya tidak pernah ditulis ke issue, log, artifact, atau repository.

## Sinkronisasi bertahap

Implementasi wajib dimulai dengan validasi lokal dan dry-run tanpa perubahan remote. Bootstrap issue memerlukan pilot yang membuktikan ID stabil, pagination, idempotent retry, pelestarian catatan maintainer dan penanganan close manual sebelum batch import. Sampai pilot dan konfigurasi permission terbukti, kebijakan ini tidak menyatakan bahwa issue sudah dibuat atau sync aktif. Detail gerbang aktivasi dan recovery ada di [kontrak M11](../roadmap/ISSUE-SYNC-CONTRACT.md).

Workflow `Roadmap issue sync` membuat plan read-only pada perubahan roadmap di `dev`, jadwal mingguan, dan dispatch manual pada `main`/`dev`. Apply hanya tersedia lewat dispatch `dev` dengan checkbox `apply` aktif dan daftar Task ID eksplisit; satu run dibatasi maksimal lima task. Plan mencetak source SHA, fingerprint input remote, dan IDs per tindakan tanpa mencetak generated body atau catatan issue. Apply job saja mendapat `issues: write`, berjalan setelah plan selesai, memakai serial API writes, membaca ulang remote state sebelum mutasi, dan dapat dilanjutkan dengan mengirim batch Task ID yang sama. Sampai pilot remote dan review output terbukti, push/schedule tetap plan-only.

`scripts/roadmap/issue-intake.mjs` menyediakan pure planner untuk proposal status/scope dan triage close/reopen. Nilai actor yang diteruskan kepadanya harus berasal dari webhook signature/delivery validation dan permission lookup authoritative di adapter; field actor dari event JSON sendiri tidak dipercaya. Planner menolak repo lain, bot, PR, actor di luar allowlist, identity malformed dan action tidak dikenal. Ia tidak menulis issue/source atau menjalankan command/fetch URL. Belum ada adapter webhook maupun durable idempotency store, sehingga fitur ini belum aktif dan semua proposal harus tetap melalui review maintainer/source pada `dev`.
