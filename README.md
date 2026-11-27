# MEDIX – Modular Web Application

Aplikasi MEDIX berbasis web dengan Firebase dan PWA.

## Struktur proyek
- `index.html` — kerangka halaman aplikasi.
- `assets/css/main.css` — stylesheet aplikasi dan lapisan refinement visual MEDIX 2.0.
- `assets/js/app.js` — logika inti aplikasi dan integrasi Firebase.
- `assets/js/table-filters.js` — utilitas filter tabel dan mesin cetak.
- `assets/images/logo.png` — logo aplikasi.
- `database.json` — data/berkas database bawaan proyek.
- `manifest.json` dan `sw.js` — konfigurasi PWA dan service worker.
- `CHANGELOG-MEDIX-2.0.md` — catatan perubahan paket.

## Deployment
Unggah seluruh isi folder `MEDIX` ke repository deployment. Pertahankan konfigurasi Firebase dan pengaturan hosting yang sudah digunakan. Jangan mengganti konfigurasi project Firebase dengan konfigurasi contoh.

## Catatan
Paket ini mempertahankan logika aplikasi dan menambahkan refinement visual secara aditif. Tetap lakukan pengujian fungsi, keamanan Firestore, QR publik, LK/PDF, dan seluruh role sebelum digunakan operasional. Lihat `CHANGELOG-MEDIX-2.0.md`.

### MEDIX Smart Asset Tag

- Standar ukuran label: 70 × 25 mm.
- Identitas: logo eksisting, MEDIX, dan UPTD RSUD Kelas D Pondokgede.
- Label satuan: PNG resolusi tinggi.
- Label massal: browser print dan PDF A4 landscape, 28 label per halaman (4 × 7).
- QR tetap menggunakan payload canonical `medixBuildQrValue(alat)` dan token publik aset yang sama. Cetak ulang tidak membuat token baru jika token sudah tersedia.
- Untuk hasil ukuran fisik yang tepat, pada dialog cetak pilih A4, Landscape, skala 100% / Actual size, dan nonaktifkan header/footer browser. Pastikan printer tidak menerapkan scaling tambahan.
- Lakukan uji scan pada hasil cetak fisik sebelum produksi massal; hasil scan dipengaruhi printer, bahan stiker, kontras, dan kualitas cetak.
