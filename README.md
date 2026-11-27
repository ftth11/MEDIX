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

### Penyempurnaan Dashboard & Label
- Dashboard menampilkan panel sambutan berdasarkan profil pengguna, peran akun, tanggal dan jam WIB otomatis.
- Label aset tidak lagi menampilkan ID internal; nomor seri dan lokasi tetap ditampilkan.
- Penghilangan ID hanya mengubah tampilan cetak label. Data aset, ID dokumen/database, dan payload QR tidak diubah.

### UI refinement
MEDIX menggunakan tema terang permanen dengan palet putih/abu-abu kebiruan dan aksen teal/biru. Tombol logout berada di kanan atas. Foto profil dapat dibuka dari avatar header atau sidebar; perubahan foto memerlukan Firebase Storage dan izin Firestore/Storage yang sesuai. Layout telah diberi penyesuaian responsif untuk desktop, tablet, dan ponsel.

### Workflow verifikasi dan audit Lembar Kerja

Versi ini menambahkan status verifikasi LK, identitas/waktu verifikator, audit trail, serta catatan addendum khusus Admin. Addendum tidak mengubah isi LK yang telah disimpan; koreksi dicatat sebagai catatan tambahan agar dokumen asli tetap dapat ditelusuri. Nomor LK menggunakan transaksi `systemCounters/lembarKerja` untuk mengurangi kemungkinan nomor ganda saat penyimpanan bersamaan.

Sebelum digunakan bersama, sesuaikan Firestore Security Rules untuk koleksi `lembarKerja` dan `systemCounters` sesuai role. Jangan membuka akses koleksi tersebut untuk publik. Lihat bagian "Catatan konfigurasi Firestore" pada `CHANGELOG-MEDIX-2.0.md`.


## MEDIX LK — PDF final berdasarkan formulir lapangan

Pembaruan ini menyusun dokumen LK sebagai PDF A4 portrait menggunakan elemen PDF vektor (teks, garis, tabel), bukan screenshot halaman HTML. Foto before/after dan tanda tangan tetap disisipkan sebagai gambar pada area masing-masing. Susunan dokumen mengikuti referensi LK lapangan yang diberikan: kop instansi, nomor/jenis/tanggal, identitas alat, kondisi lingkungan/dokumentasi, kondisi lingkungan, pemeriksaan listrik dan grounding, daya/battery internal, daftar alat kerja, pemeriksaan fisik/fungsi, uraian pekerjaan, pemeriksaan kinerja, checklist pemeliharaan preventif, stok consumable, rekomendasi/catatan, BHP/aksesori, hasil akhir, dan tiga kolom tanda tangan.

### Tambahan kolom yang mengikuti referensi lapangan\nForm LK kini menyediakan isian opsional untuk UPS/stabilizer, tegangan L-N/L-G/N-G, grounding, tahanan isolasi/kabel power, arus bocor, kebersihan, daya alat, battery internal, checklist pemeliharaan preventif, stok consumable, hasil maintenance, rekomendasi, dan catatan teknisi. Field tersebut ditambahkan sebagai field baru pada dokumen; data lama tetap dapat dibuka.\n\n### Alur penyimpanan LK baru
1. Teknisi melengkapi formulir dan menekan **Simpan Data**.
2. MEDIX membuat PDF final dari data yang sedang diisi.
3. PDF diunggah ke Firebase Storage pada `lembarKerjaPdf/{lkId}/{nomorLk}.pdf`.
4. Hanya setelah unggah PDF berhasil, MEDIX menyimpan record LK dan metadata PDF ke Firestore.
5. Setelah tersimpan, PDF langsung dibuka. Saat record dibuka dari riwayat, MEDIX menampilkan PDF tersebut, bukan formulir input.
6. Data isi LK tidak dapat disimpan ulang melalui formulir setelah memiliki ID dokumen. Verifikasi dan addendum disimpan sebagai metadata terpisah dan tidak mengubah PDF asli.
7. MEDIX menghitung SHA-256 PDF dan memeriksanya saat PDF dibuka untuk mendeteksi perubahan/kerusakan berkas.

### Firebase Storage Rules — tambahkan aturan ini ke rules yang sudah ada
Jangan mengganti seluruh rules project. Gabungkan blok berikut di dalam `service firebase.storage` dan sesuaikan kebijakan role dengan rules rumah sakit:

```javascript
match /lembarKerjaPdf/{lkId}/{fileName} {
  // Pembacaan tetap memerlukan sesi login.
  allow read: if request.auth != null;

  // Hanya unggah PDF dengan ukuran maksimum 10 MB.
  allow create: if request.auth != null
                && request.resource.contentType == 'application/pdf'
                && request.resource.size < 10 * 1024 * 1024;

  // File PDF yang sudah dibuat tidak boleh ditimpa.
  allow update: if false;

  // Penghapusan hanya oleh uploader file (mis. pembersihan jika commit Firestore gagal).
  allow delete: if request.auth != null
                && resource.metadata.generatedBy == request.auth.uid;
}
```

Aturan di atas adalah baseline teknis. Untuk operasional rumah sakit, batasi `create` hanya Admin/Teknisi berdasarkan custom claims atau dokumen role yang tervalidasi di rules.

### Firestore Rules
Pastikan dokumen `lembarKerja`:
- dapat dibuat oleh role yang berwenang;
- tidak mengizinkan perubahan field isi dokumen setelah dibuat;
- hanya mengizinkan Admin memperbarui field verifikasi, audit, addendum, dan `updatedAt`;
- tidak mengizinkan penghapusan LK secara umum.

Contoh field metadata yang dapat diperbarui Admin: `statusVerifikasi`, `diverifikasiOleh`, `diverifikasiAt`, `riwayatAudit`, `riwayatRevisi`, dan `updatedAt`. Terapkan pembatasan ini pada rules yang sekarang, jangan membuka akses seluruh koleksi.

### Kompatibilitas
LK yang sudah tersimpan sebelum fitur PDF ini dan belum memiliki `pdfStoragePath` tetap dibuka melalui tampilan arsip lama (read-only). LK baru setelah pembaruan akan memiliki PDF final. PDF tidak dapat diedit melalui MEDIX dan file di Storage tidak dapat ditimpa melalui aturan di atas; perubahan pada salinan PDF di luar MEDIX tetap mungkin dilakukan oleh aplikasi PDF pihak ketiga, tetapi hash SHA-256 pada record MEDIX dapat dipakai untuk mendeteksi perubahan salinan tersebut.


## Perbaikan LK — efisiensi kolom, BHP, dan penyimpanan
- Input BHP pada LK diisi dari master `bhpItems`; daftar master dimuat ulang ketika form LK baru dibuka. Jika stok yang tercatat tidak cukup, teknisi mendapat konfirmasi untuk tetap mencatat pemakaian aktual (stok negatif harus ditindaklanjuti melalui pencatatan stok).
- Pemakaian BHP tetap disimpan di dokumen LK dan PDF final. Sinkronisasi transaksi stok BHP dilakukan setelah dokumen LK utama berhasil disimpan, sehingga izin koleksi transaksi BHP yang belum lengkap tidak menggagalkan penyimpanan LK/PDF. Jika sinkronisasi gagal, MEDIX menampilkan peringatan agar stok direkonsiliasi.
- Penyimpanan dipisahkan menjadi tahap pembuatan PDF, unggah Storage, dan commit Firestore. Pesan kesalahan menyebutkan tahap kegagalan untuk memudahkan diagnosis. Penutupan tiket dilakukan sebagai proses lanjutan dan tidak membatalkan arsip LK.
- Kolom input BHP dan field pemeriksaan dibuat lebih padat; layout BHP disesuaikan untuk desktop/tablet dan ponsel.
- Service worker cache dinaikkan ke `medix-cache-v8` agar browser mengambil aset revisi.

**Catatan:** aturan Firebase tetap harus mengizinkan role teknisi/admin membuat dokumen `lembarKerja`, membaca/menulis `dataAlat`, membuat file pada `lembarKerjaPdf`, serta membuat/membaca transaksi `bhpTransactions`. Jika simpan gagal, periksa Console browser dan pesan yang sekarang menyebut tahap proses; jangan membuka rules menjadi publik.

#### Catatan nomor dokumen LK
Versi ini tidak lagi menggunakan koleksi `systemCounters/lembarKerja` untuk menghasilkan nomor LK. Nomor baru dibuat dari tanggal-waktu lokal ditambah akhiran acak, sehingga error 403 pada pembacaan counter tidak lagi menghentikan penyimpanan. Pastikan Firestore Rules tetap mengizinkan pengguna berwenang membuat dokumen pada `lembarKerja` dan memperbarui status aset pada `dataAlat`, serta Storage Rules mengizinkan unggah PDF pada `lembarKerjaPdf/{lkId}/...`.
