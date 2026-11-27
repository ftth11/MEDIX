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

### Penyempurnaan MEDIX – Dashboard & Smart Asset Tag
- Menghilangkan baris ID internal dari seluruh varian label (PNG satuan, cetak massal browser, dan PDF massal). Label tetap menampilkan nomor seri dan lokasi aset.
- Menambahkan panel sambutan dashboard berisi nama pengguna, peran akun, identitas aplikasi/rumah sakit, tanggal, dan jam WIB yang diperbarui otomatis.
- QR Rekam Jejak tetap menggunakan mekanisme payload/token publik yang sudah ada; tidak ada perubahan skema database.

## Refinement UI — tema terang dan responsivitas
- Mengunci tampilan MEDIX pada satu tema terang; tombol pengubah mode dihapus dan preferensi lama mode gelap dinormalisasi menjadi terang.
- Tombol logout dipindahkan ke kanan atas header aplikasi.
- Tombol foto profil ditampilkan di header dan tetap tersedia dari area profil sidebar.
- Renderer foto profil sekarang menyinkronkan avatar header dan sidebar, membaca fallback `photoURL`, `fotoURL`, dan `fotoProfil`, serta menampilkan ikon cadangan jika gambar gagal dimuat.
- Palet aplikasi diselaraskan ke putih/abu-abu kebiruan dengan aksen teal dan biru, termasuk dashboard sambutan agar kontras teks lebih jelas.
- Penyesuaian layout responsif untuk desktop, tablet, dan ponsel, termasuk ruang konten, header, sidebar, tabel yang dapat digulir horizontal, dan kontrol sentuh.
- Fungsi autentikasi, penyimpanan profil Firebase, dan struktur data aset tidak diubah.


## LK refinement — signature alignment and flat input layout
- Standardized the three LK signature blocks (technician, room representative, and IPSRS equipment lead) with identical row heights and aligned signature pads/name lines.
- Kept existing signature canvas IDs and persistence fields unchanged.
- Removed nested boxed styling from LK form controls; fields now use a clean underline treatment while section cards remain visually separated.
- Simplified the four structured work-description fields and improved mobile stacking; print layout keeps a compact two-column description area and aligned three-column signatures.
- Corrected the malformed closing tag in the final-inspection heading.

## Penyempurnaan Lembar Kerja — Workflow & Audit

- Menambahkan status dokumen LK: `Menunggu Verifikasi` dan `Terverifikasi`.
- Verifikasi LK tersedia melalui tombol khusus Admin pada tampilan dokumen tersimpan.
- Menambahkan identitas verifikator dan waktu verifikasi.
- Menambahkan `riwayatAudit` untuk mencatat pembuatan, verifikasi, dan addendum.
- Menambahkan mekanisme catatan revisi/addendum khusus Admin. Catatan addendum bersifat append-only dan tidak menimpa isi LK asli.
- Menambahkan reservasi nomor LK melalui transaksi Firestore pada `systemCounters/lembarKerja` untuk mengurangi risiko nomor ganda saat beberapa pengguna menyimpan bersamaan. Jika aturan Firestore belum mengizinkan koleksi counter, aplikasi memakai fallback nomor berdasarkan cache yang tersedia.
- Struktur dokumen LK lama tetap dapat dibuka. Dokumen lama tanpa field verifikasi ditampilkan sebagai `Status Belum Dicatat`, bukan dianggap sudah atau belum diverifikasi.

### Catatan konfigurasi Firestore

Untuk mengaktifkan seluruh fitur dengan aman, sesuaikan Firestore Security Rules yang sudah digunakan MEDIX:

- `lembarKerja`: Admin/Teknisi dapat membuat LK sesuai alur yang berlaku; hanya Admin yang boleh mengubah field verifikasi dan menambahkan addendum. Batasi User Ruangan menjadi baca sesuai hak akses aplikasi.
- `systemCounters/lembarKerja`: izinkan read/write hanya untuk pengguna terautentikasi dengan role Admin atau Teknisi. Validasi role harus dilakukan melalui dokumen profil `users/{uid}` atau mekanisme otorisasi tepercaya yang sudah dipakai project.
- Jangan mengganti seluruh Firestore Rules dengan aturan terbuka. Gabungkan aturan baru ke rules yang sudah ada dan pertahankan aturan QR publik secara terpisah.

Catatan: pemeriksaan role pada antarmuka hanya untuk pengalaman pengguna; keamanan sebenarnya wajib ditegakkan di Firestore Security Rules.


## LK PDF Final — November 2026
- Tata letak dokumen LK diperbarui mengikuti referensi formulir lapangan satu halaman: kop, identitas alat, kondisi lingkungan, dokumentasi, alat kerja, pemeriksaan fisik/fungsi, uraian, pemeriksaan kinerja, BHP, hasil akhir, dan tanda tangan.
- Pembuatan PDF menggunakan jsPDF dengan teks, tabel, garis, dan kotak vektor; tidak lagi mengubah seluruh formulir HTML menjadi satu gambar.
- Foto before/after dan tanda tangan dimasukkan pada bidang khusus.
- PDF final dibuat saat tombol Simpan Data digunakan dan diunggah ke Firebase Storage sebelum record Firestore di-commit.
- Record LK baru menyimpan `pdfStoragePath`, `pdfFileName`, `pdfMimeType`, `pdfStatus`, `pdfImmutable`, `pdfVersion`, `pdfGeneratedAt`, dan `pdfSha256`.
- Pembukaan LK baru dari riwayat diarahkan ke PDF viewer. Dokumen lama tanpa PDF tetap kompatibel.
- Konten LK yang sudah tersimpan ditolak untuk disimpan ulang dari form; verifikasi dan addendum tetap dicatat sebagai metadata terpisah.
- Viewer menyediakan verifikasi Admin, audit trail, dan addendum tanpa mengubah PDF asli.

- Menambahkan field opsional pemeriksaan listrik/grounding, daya dan battery internal, checklist preventive maintenance, stok consumable, hasil maintenance, rekomendasi, serta catatan teknisi mengikuti formulir lapangan.
