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


## MEDIX Premium UI Update

Paket ini mempertahankan modul aplikasi, alur Firebase, dan struktur data yang sudah ada. Pembaruan berfokus pada konsistensi desain, responsivitas, aksesibilitas navigasi, mode terang/gelap, pengalaman pengisian LK, dan standardisasi label aset.

### Perubahan tampilan
- Sistem visual Premium Medical: Deep Navy, Medical Teal, permukaan netral, tipografi dan kontrol yang konsisten.
- Mode terang dan gelap tetap tersedia dan diselaraskan.
- Sidebar, header, kartu dashboard, tabel, dialog, dan form diperhalus untuk desktop, tablet, dan ponsel.
- Form LK dirapikan untuk penggunaan layar; hasil cetak tetap menggunakan kertas putih.
- Label aset satuan dan massal diseragamkan menjadi 78 × 26 mm, dengan QR, nama alat, kode aset, nomor seri, dan lokasi.
- Cache PWA dinaikkan ke medix-cache-v7 dan stylesheet premium dimasukkan ke app shell.

### Penerapan
Unggah isi folder `MEDIX` ke repository/deployment yang sama, dengan mempertahankan konfigurasi Firebase dan data Firestore yang sudah digunakan. Setelah deployment, lakukan hard refresh atau tutup-buka ulang PWA agar cache versi baru aktif.

### Catatan pengujian
Pemeriksaan statis JavaScript, referensi aset lokal, ID HTML, dan daftar app-shell PWA telah dilakukan. Pengujian alur operasional tetap perlu dilakukan pada akun Firebase aktif untuk memastikan izin, data, upload, cetak, dan sinkronisasi berjalan sesuai kondisi deployment.
