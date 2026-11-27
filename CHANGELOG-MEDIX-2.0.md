# MEDIX 2.0 – Penyempurnaan visual tahap awal

## Yang diterapkan pada paket ini
- Lapisan visual tambahan dengan identitas warna navy–teal.
- Konsistensi radius, border, bayangan, dan jarak visual komponen.
- Penajaman tampilan sidebar dan indikator menu aktif.
- Avatar akun dibuat lebih konsisten berbentuk lingkaran.
- Penyempurnaan header, kartu dashboard, tombol, input, tabel, dan fokus keyboard.
- Refinement warna dark mode tanpa mengubah mekanisme toggle yang sudah ada.
- Dukungan preferensi reduced-motion.
- Aturan cetak dasar agar refinement layar tidak mengubah warna dokumen cetak.

## Sengaja tidak diubah
- Integrasi Firebase, autentikasi, role, dan alur data.
- Nama ID/handler tombol yang dipakai oleh JavaScript.
- Struktur koleksi/database.
- Logika QR publik dan token rekam jejak.
- Logika LK, tanda tangan, dan generator PDF.
- Navigasi dan modul bisnis yang sudah ada.

## Batasan validasi
Paket ini adalah peningkatan visual non-destruktif tahap awal. Belum dapat disebut siap produksi atau sempurna sebelum diuji pada project Firebase milik pengguna, seluruh role, perangkat mobile/desktop, alur QR publik, cetak LK, dan aturan keamanan Firestore. Lakukan backup sebelum mengganti deployment aktif.

## MEDIX Smart Asset Tag — 27 November 2026
- Menyatukan desain label satuan, cetak massal browser, dan PDF pada ukuran fisik 70 × 25 mm.
- Identitas label memakai logo eksisting `assets/images/logo.png`, wordmark MEDIX, dan teks UPTD RSUD Kelas D Pondokgede.
- Memperbesar area QR menjadi 18 × 18 mm dengan quiet zone putih; QR tetap hitam di atas putih tanpa logo overlay.
- Menambahkan informasi kode aset, nomor seri, nama alat, merk/tipe, dan lokasi.
- Cetak massal A4 landscape disusun 4 kolom × 7 baris (28 label per halaman), jarak 2 mm.
- PDF massal memakai ukuran dan tata letak yang sama dengan browser print.
- Label satuan diunduh sebagai PNG resolusi tinggi dengan ukuran desain 70 × 25 mm.
- Payload QR tetap menggunakan fungsi canonical `medixBuildQrValue(alat)` dan token publik yang sudah ada; tidak mengubah format URL/token atau alur QR Rekam Jejak publik tanpa login.
