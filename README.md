# MEDIX

Aplikasi MEDIX berbasis web dengan Firebase dan PWA.

## Struktur proyek

- `index.html` — kerangka halaman aplikasi.
- `assets/css/main.css` — seluruh stylesheet yang sebelumnya tertanam di HTML.
- `assets/js/app.js` — logika inti aplikasi dan integrasi Firebase (dipindahkan tanpa mengubah isi logika).
- `assets/js/table-filters.js` — utilitas filter tabel dan mesin cetak (dipindahkan tanpa mengubah isi logika).
- `assets/images/logo.png` — logo aplikasi.
- `database.json` — data/berkas database bawaan proyek.
- `manifest.json` dan `sw.js` — konfigurasi PWA dan service worker.

## Deployment

Unggah seluruh isi folder repository ini ke repository MEDIX yang sudah digunakan. Pertahankan konfigurasi Firebase dan pengaturan GitHub Pages yang sudah ada.

> Catatan: pemisahan ini merupakan refaktor struktur tahap pertama. Kode JavaScript inti sengaja dipertahankan utuh untuk menjaga kompatibilitas fitur, autentikasi, dan data yang sudah berjalan. Pemecahan logika menjadi modul fitur terpisah dapat dilakukan bertahap setelah pengujian fungsi di deployment.
