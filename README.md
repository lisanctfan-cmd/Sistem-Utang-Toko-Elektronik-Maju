# Sistem Pencatatan Utang — Toko Elektronik

Aplikasi web berbasis klien (*client-side web application*) untuk mengelola pencatatan utang usaha, data supplier, pelunasan pembayaran dengan perhitungan diskon dan denda akuntansi otomatis, serta rekapitulasi laporan historis dengan ekspor Excel dan PDF. Sistem ini terintegrasi langsung dengan database cloud **Supabase (PostgreSQL)**.

---

## 📌 Fitur Utama

### 1. Dashboard & Notifikasi Otomatis
- **Peringatan Jatuh Tempo (*Due Soon*)**: Notifikasi otomatis untuk utang yang akan jatuh tempo dalam waktu $\le 7$ hari.
- **Peringatan Batas Diskon (*Discount Soon*)**: Notifikasi otomatis jika pembayaran masih dalam masa periode potongan/diskon termin (peringatan $\le 3$ hari sebelum batas diskon berakhir).
- **Peringatan Keterlambatan (*Overdue*)**: Deteksi dan pemberitahuan faktur yang telah melewati tanggal jatuh tempo dengan penghitungan jumlah hari keterlambatan.
- **Tindakan Cepat (*Quick Action*)**: Tombol navigasi langsung ke menu pembayaran dari setiap kartu notifikasi.

### 2. Manajemen Data Supplier
- Tambah data supplier baru (Nama, Kontak telepon/email, dan Alamat).
- Edit dan perbarui informasi supplier.
- Hapus data supplier dengan konfirmasi keamanan (termasuk relasi data faktur).
- Tampilan tabel daftar supplier yang terhubung secara dinamis ke pilihan faktur.

### 3. Pencatatan Faktur & Utang Usaha
- Pencatatan utang berdasarkan supplier yang dipilih.
- Input data faktur: Nama Utang, Nomor Faktur, Tanggal Faktur, Tanggal Jatuh Tempo, Total Nominal Utang, Syarat Pembayaran, dan Keterangan.
- **Syarat Pembayaran Fleksibel**:
  - Mendukung termin diskon akuntansi (contoh: `2/10 n/30`, `5/15`, `3/15 n/60`, `EOM`, `COD`).
  - Bersifat opsional: jika tidak diisi, sistem otomatis menampilkan tanda strip (`-`) tanpa memaksakan nilai bawaan termin.
- **Status Dinamis Faktur**:
  - `AKTIF` (Biru): Faktur belum lunas dan belum melewati tanggal jatuh tempo.
  - `JATUH TEMPO` (Merah): Faktur belum lunas dan telah melewati tanggal jatuh tempo.
  - `LUNAS` (Hijau): Saldo tagihan faktur telah terbayar penuh.
- Edit dan hapus data faktur.

### 4. Pencatatan Pembayaran & Pelunasan
- Pilihan faktur belum lunas dengan informasi saldo sisa utang secara *real-time*.
- **Kalkulasi Diskon Otomatis**: Menghitung hak potongan pembayaran sesuai tanggal bayar terhadap syarat termin faktur.
- **Denda Keterlambatan**: Input nominal denda jika pembayaran dilakukan setelah tanggal jatuh tempo.
- **Metode Pembayaran**: Mendukung pilihan *Transfer Bank*, *Tunai*, dan *Giro / Cek*.
- Validasi pembayaran agar tidak melebihi sisa tagihan.
- Riwayat transaksi pembayaran lengkap dengan fitur edit dan hapus pembayaran (saldo utang otomatis dihitung ulang).

### 5. Laporan Historis Utang & Filter Periode
- **Filter Status**: Tampilkan semua, hanya belum lunas, lunas, atau jatuh tempo.
- **Filter Rentang Tanggal**: Berdasarkan *Tanggal Faktur* atau *Tanggal Jatuh Tempo* (Dari Tanggal s/d Sampai Tanggal).
- **Tombol Pintas Periode**: Filter instan untuk *Semua*, *Bulan Ini*, *Bulan Lalu*, dan *Tahun Ini*.
- **Kartu Ringkasan Metrik**:
  - Total Faktur Terpilih
  - Total Nilai Utang
  - Total Sudah Dibayar
  - Sisa Utang Belum Lunas
- Kolom metrik hari: Penghitungan hari tersisa menuju jatuh tempo dan hari lewat tempo.

### 6. Ekspor Laporan
- **Unduh Excel (`.xls`)**:
  - Format tabel dengan garis (*gridlines*).
  - Header berwarna biru gelap (*navy*) dengan teks tebal.
  - Format angka nominal mata uang terstandarisasi (`mso-number-format`).
  - Baris total keseluruhan (*grand total*) pada bagian bawah.
  - Informasi parameter filter, status, dan tanggal cetak pada bagian atas laporan.
- **Unduh PDF (`.pdf`)**:
  - Dokumen PDF format lanskap A4 menggunakan pustaka jsPDF dan AutoTable.

---

## 📂 Struktur File Proyek

```text
sistem-utang/
├── frontend/
│   ├── index.html    # Antarmuka, navigasi, formulir, dan tabel
│   ├── script.js     # Integrasi Supabase, interaksi UI, filter, dan ekspor
│   └── style.css     # Gaya antarmuka
├── backend/
│   ├── app.js        # Logika bisnis akuntansi yang dimuat di browser
│   └── database.sql  # Skema PostgreSQL untuk backend Supabase
└── README.md         # Dokumentasi proyek
```

Backend data aplikasi dikelola oleh Supabase. File `backend/app.js` berisi logika bisnis yang dimuat oleh halaman frontend; proyek ini tidak memiliki server Node.js terpisah.

---

## 🛠️ Rincian Modul Kode

### 1. `backend/app.js` (Accounting & Business Logic)
Menyediakan modul `window.AppLogic` yang berisi fungsi-fungsi murni (*pure functions*):
- `parseSyaratPembayaran(syarat)`: Melakukan ekstraksi persentase diskon, hari diskon, batas hari net, dan mode akhir bulan (*End of Month / EOM*).
- `hitungTanggalJatuhTempo(tanggalFaktur, syarat)`: Menghitung tanggal jatuh tempo berdasarkan tanggal faktur dan ketentuan termin.
- `hitungDiskon(invoice, tanggalBayar, sisaUtang, jumlahBayar)`: Menghitung potongan diskon yang berhak didapat berdasarkan interval hari pembayaran.
- `statusDinamis(invoice, totalTerpakai, sisaUtang)`: Menentukan status `AKTIF`, `JATUH TEMPO`, atau `LUNAS`.
- `formatRp(nominal)`: Format angka ke format mata uang Rupiah (`Rp x.xxx.xxx`).
- `formatTanggal(str)`: Konversi format tanggal `YYYY-MM-DD` ke format Indonesia `DD/MM/YYYY`.
- `diffDays(dateStr)`: Menghitung selisih hari dari kalender hari ini (WIB/Jakarta) ke tanggal target.
- `exportToCSV(filename, rows, headers)`: Helper konversi array objek ke file CSV dengan UTF-8 BOM.

### 2. `frontend/script.js` (UI Controller & Database Integration)
- Mengelola koneksi klien Supabase melalui `supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`.
- Pengelolaan tab navigasi (`dashboard`, `supplier`, `invoice`, `payment`, `laporan`).
- Operasi CRUD tabel `suppliers`, `invoices`, dan `payments`.
- Kalkulasi dinamis saldo utang (`total_amount + denda - (dibayar + diskon)`).
- Penanganan ekspor file Excel berbasis XML Spreadsheet HTML Template dan PDF via jsPDF AutoTable.
- Komponen notifikasi mengambang (*Toast Notification*).

### 3. `frontend/style.css` (Design System)
- Menggunakan CSS Custom Properties (`--blue-800`, `--slate-900`, `--slate-200`, dll.).
- Tata letak responsif untuk layar desktop hingga perangkat seluler.
- Komponen visual: `.card`, `.form-grid`, `.stat-card`, `.badge`, `.notification-item`, dan `.toast`.

### 4. `backend/database.sql` (Database Schema)
Membuat tiga tabel yang sesuai dengan menu data aplikasi: `suppliers`, `invoices`, dan `payments`. Dashboard dan laporan membaca gabungan data dari ketiga tabel tersebut, sehingga tidak memerlukan tabel tersendiri. Skrip juga menyiapkan relasi, indeks, serta akses yang dipakai integrasi Supabase.

---

## 🗄️ Skema Database (Supabase PostgreSQL)

`backend/database.sql` membuat tiga tabel data: `suppliers` untuk menu Supplier, `invoices` untuk menu Faktur & Utang, dan `payments` untuk menu Pembayaran. Data dashboard dan laporan dihitung dari tabel-tabel ini.

---

## 🚀 Panduan Menjalankan Proyek

### 1. Persiapan Database Supabase
1. Buka dashboard proyek di [Supabase](https://supabase.com).
2. Masuk ke menu **SQL Editor** pada panel samping.
3. Buka `backend/database.sql`, salin seluruh kueri SQL, tempelkan ke SQL Editor Supabase, lalu jalankan (**Run**).

### 2. Konfigurasi Kredensial API
Buka `frontend/script.js`, pastikan variabel konfigurasi pada baris teratas telah sesuai dengan proyek Supabase Anda:

```javascript
const SUPABASE_URL = 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_ANON_KEY = '<YOUR-SUPABASE-ANON-KEY>';
```

### 3. Menjalankan Aplikasi
Aplikasi ini murni menggunakan teknologi web standar (*vanilla web*). Anda dapat menjalankannya langsung dengan:
- Membuka `frontend/index.html` pada peramban web (*browser*), atau
- Menggunakan ekstensi server lokal seperti *Live Server* pada VS Code.

---

## 📦 Pustaka Eksternal (CDN)

Aplikasi memuat pustaka eksternal melalui Content Delivery Network (CDN):
- **Supabase JavaScript Client v2**: `@supabase/supabase-js@2` (Manajemen koneksi dan query database)
- **jsPDF v2.5.2**: `jspdf.umd.min.js` (Pustaka pembuat dokumen PDF)
- **jsPDF-AutoTable v3.8.4**: `jspdf.plugin.autotable.min.js` (Plugin tabel untuk jsPDF)
