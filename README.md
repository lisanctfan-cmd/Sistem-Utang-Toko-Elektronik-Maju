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
├── index.html        # Struktur antarmuka pengguna (UI), tata letak navigasi tab, form, dan tabel
├── app.js            # Logika bisnis akuntansi (parsing syarat pembayaran, hitung diskon, jatuh tempo, status)
├── script.js         # Integrasi Supabase SDK, manipulasi DOM, manajemen state, filter, dan ekspor
├── style.css         # Styling antarmuka modern, sistem variabel warna, kartu metrik, dan responsif
├── database.sql      # Skrip DDL & DCL PostgreSQL untuk konfigurasi database Supabase
└── README.md         # Dokumentasi resmi proyek
```

---

## 🛠️ Rincian Modul Kode

### 1. `app.js` (Accounting & Business Logic)
Menyediakan modul `window.AppLogic` yang berisi fungsi-fungsi murni (*pure functions*):
- `parseSyaratPembayaran(syarat)`: Melakukan ekstraksi persentase diskon, hari diskon, batas hari net, dan mode akhir bulan (*End of Month / EOM*).
- `hitungTanggalJatuhTempo(tanggalFaktur, syarat)`: Menghitung tanggal jatuh tempo berdasarkan tanggal faktur dan ketentuan termin.
- `hitungDiskon(invoice, tanggalBayar, sisaUtang, jumlahBayar)`: Menghitung potongan diskon yang berhak didapat berdasarkan interval hari pembayaran.
- `statusDinamis(invoice, totalTerpakai, sisaUtang)`: Menentukan status `AKTIF`, `JATUH TEMPO`, atau `LUNAS`.
- `formatRp(nominal)`: Format angka ke format mata uang Rupiah (`Rp x.xxx.xxx`).
- `formatTanggal(str)`: Konversi format tanggal `YYYY-MM-DD` ke format Indonesia `DD/MM/YYYY`.
- `diffDays(dateStr)`: Menghitung selisih hari dari kalender hari ini (WIB/Jakarta) ke tanggal target.
- `exportToCSV(filename, rows, headers)`: Helper konversi array objek ke file CSV dengan UTF-8 BOM.

### 2. `script.js` (UI Controller & Database Integration)
- Mengelola koneksi klien Supabase melalui `supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`.
- Pengelolaan tab navigasi (`dashboard`, `supplier`, `invoice`, `payment`, `laporan`).
- Operasi CRUD tabel `suppliers`, `invoices`, dan `payments`.
- Kalkulasi dinamis saldo utang (`total_amount + denda - (dibayar + diskon)`).
- Penanganan ekspor file Excel berbasis XML Spreadsheet HTML Template dan PDF via jsPDF AutoTable.
- Komponen notifikasi mengambang (*Toast Notification*).

### 3. `style.css` (Design System)
- Menggunakan CSS Custom Properties (`--blue-800`, `--slate-900`, `--slate-200`, dll.).
- Tata letak responsif untuk layar desktop hingga perangkat seluler.
- Komponen visual: `.card`, `.form-grid`, `.stat-card`, `.badge`, `.notification-item`, dan `.toast`.

### 4. `database.sql` (Database Schema)
Skrip SQL untuk database PostgreSQL Supabase:
- Penyesuaian kolom tabel `invoices` (`syarat_pembayaran`, `net_hari`, `diskon_persen`, `diskon_hari`, `keterangan`) agar bersifat opsional.
- Penyesuaian kolom tabel `payments` (`diskon_didapat`, `denda_dikenakan`, `keterangan`).
- Menonaktifkan *Row Level Security* (RLS) pada tabel `suppliers`, `invoices`, dan `payments`.
- Pemberian hak akses penuh (*GRANT ALL*) kepada role `anon`, `authenticated`, dan `service_role`.

---

## 🗄️ Skema Database (Supabase PostgreSQL)

### Tabel `suppliers`
| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `BIGSERIAL` / `INT8` | Primary Key |
| `nama` | `VARCHAR` / `TEXT` | Nama Supplier (Wajib) |
| `kontak` | `VARCHAR` / `TEXT` | No. Telepon / Email |
| `alamat` | `TEXT` | Alamat Supplier |
| `created_at` | `TIMESTAMPTZ` | Waktu Pembuatan Data |

### Tabel `invoices`
| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `BIGSERIAL` / `INT8` | Primary Key |
| `nama_utang` | `TEXT` | Deskripsi / Nama Utang |
| `supplier_id` | `BIGINT` | Foreign Key ke `suppliers.id` |
| `nomor_faktur` | `VARCHAR` / `TEXT` | Nomor Faktur / Invoice |
| `tanggal_faktur` | `DATE` | Tanggal Terbit Faktur |
| `tanggal_jatuh_tempo` | `DATE` | Tanggal Batas Jatuh Tempo |
| `total_amount` | `NUMERIC` / `FLOAT8` | Total Nilai Utang (Rp) |
| `syarat_pembayaran` | `TEXT` | Syarat Termin (Default: `'-'`) |
| `diskon_persen` | `NUMERIC` | Persentase Diskon (Default: `0`) |
| `diskon_hari` | `INTEGER` | Batas Hari Diskon (Default: `0`) |
| `net_hari` | `INTEGER` | Batas Hari Net (Default: `0`) |
| `keterangan` | `TEXT` | Catatan Tambahan |
| `created_at` | `TIMESTAMPTZ` | Waktu Pembuatan Data |

### Tabel `payments`
| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `BIGSERIAL` / `INT8` | Primary Key |
| `invoice_id` | `BIGINT` | Foreign Key ke `invoices.id` |
| `tanggal_bayar` | `DATE` | Tanggal Transaksi Pembayaran |
| `jumlah_bayar` | `NUMERIC` / `FLOAT8` | Nominal yang Dibayarkan (Rp) |
| `diskon_didapat` | `NUMERIC` | Potongan Diskon yang Diperoleh (Rp) |
| `denda_dikenakan` | `NUMERIC` | Denda Keterlambatan (Rp) |
| `metode` | `VARCHAR` | Metode Bayar (`transfer`, `tunai`, `giro`) |
| `keterangan` | `TEXT` | Keterangan Transaksi |
| `created_at` | `TIMESTAMPTZ` | Waktu Pembuatan Data |

---

## 🚀 Panduan Menjalankan Proyek

### 1. Persiapan Database Supabase
1. Buka dashboard proyek di [Supabase](https://supabase.com).
2. Masuk ke menu **SQL Editor** pada panel samping.
3. Buka file `database.sql` pada proyek ini, salin seluruh kueri SQL, tempelkan ke SQL Editor Supabase, lalu jalankan (**Run**).

### 2. Konfigurasi Kredensial API
Buka file `script.js`, pastikan variabel konfigurasi pada baris teratas telah sesuai dengan proyek Supabase Anda:

```javascript
const SUPABASE_URL = 'https://<YOUR-PROJECT-REF>.supabase.co';
const SUPABASE_ANON_KEY = '<YOUR-SUPABASE-ANON-KEY>';
```

### 3. Menjalankan Aplikasi
Aplikasi ini murni menggunakan teknologi web standar (*vanilla web*). Anda dapat menjalankannya langsung dengan:
- Membuka file `index.html` langsung pada peramban web (*browser*), atau
- Menggunakan ekstensi server lokal seperti *Live Server* pada VS Code.

---

## 📦 Pustaka Eksternal (CDN)

Aplikasi memuat pustaka eksternal melalui Content Delivery Network (CDN):
- **Supabase JavaScript Client v2**: `@supabase/supabase-js@2` (Manajemen koneksi dan query database)
- **jsPDF v2.5.2**: `jspdf.umd.min.js` (Pustaka pembuat dokumen PDF)
- **jsPDF-AutoTable v3.8.4**: `jspdf.plugin.autotable.min.js` (Plugin tabel untuk jsPDF)
