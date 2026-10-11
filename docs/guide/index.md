# Panduan MoonWitness

Panduan ini mengelompokkan langkah penggunaan dan pengembangan berdasarkan tujuan pembaca.
Mulai dari quickstart untuk menjalankan lingkungan lokal, lalu pilih how-to saat perlu melakukan
tugas tertentu. Halaman reference menjelaskan kontrak yang benar-benar didukung; architecture dan
engineering notes menjelaskan alasan serta batas sistem.

## Mulai

- [Quickstart lokal](tutorials/quickstart.md) — jalankan PostgreSQL, API, dan Board dengan seed
  contoh.
- [Arsitektur sistem](explanations/architecture.md) — pahami batas package dan alur request.

## Kembangkan dan operasikan

- [Membuat addon](how-to/addon-development.md)
- [Menjalankan Board](how-to/board.md)
- [Menjalankan jobs dan scheduler](how-to/jobs-outbox.md)
- [Mengamankan lingkungan lokal](how-to/security.md)
- [Mendiagnosis masalah umum](how-to/troubleshooting.md)
- [Mencadangkan dan memulihkan database](how-to/recovery.md)
- [Memutakhirkan kontrak dan addon](how-to/release-upgrade.md)

## Referensi

- [Kontrak API](reference/api.md)
- [Model dan metadata runtime](reference/models.md)
- [API routes yang diekstrak dari source](reference/generated-api.md)
- [Model, addon, menu, akses, dan cakupan seed](reference/generated-models.md)
- [Paket, perintah, dan konfigurasi](reference/generated-platform.md)
- [Engineering feature matrix](../engineering/feature-matrix.md)
- [Kebijakan kompatibilitas](../engineering/compatibility.md)
- [Diagram arsitektur dari metadata](../architecture/diagrams/README.md)

Navigation machine-readable ada di [`navigation.json`](navigation.json). File tersebut sengaja
netral terhadap framework supaya dapat digunakan portal statis M6.06 tanpa mengikat panduan ke
komponen Board.
