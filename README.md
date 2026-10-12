# Sistem Utang Usaha — Toko Elektronik Maju

Aplikasi web untuk mengelola utang usaha, data supplier, faktur, pembayaran, dan laporan historis secara terintegrasi dengan **Supabase PostgreSQL**.

**Live Demo:** [Sistem Utang Usaha Toko Elektronik Maju](https://lisanctfan-cmd.github.io/Sistem-Utang-Toko-Elektronik-Maju/)
## Fitur Utama

* **Dashboard:** Ringkasan utang usaha dan notifikasi jatuh tempo, batas diskon, serta keterlambatan pembayaran.
* **Manajemen Supplier:** Menambah, mengedit, dan menghapus data supplier.
* **Faktur & Utang:** Mencatat faktur, tanggal jatuh tempo, syarat pembayaran, dan status utang.
* **Pembayaran:** Mencatat pelunasan, menghitung diskon otomatis, serta mengelola denda keterlambatan.
* **Laporan:** Menampilkan riwayat utang dengan filter status dan rentang tanggal.
* **Ekspor Laporan:** Mengunduh laporan dalam format Excel dan PDF.

## Teknologi yang Digunakan

* HTML, CSS, dan JavaScript
* Supabase PostgreSQL untuk database
* Supabase JavaScript Client untuk integrasi database
* jsPDF dan AutoTable untuk ekspor laporan PDF

## Struktur Proyek

```text
sistem-utang/
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── backend/
│   ├── app.js
│   └── database.sql
└── README.md
```

Folder `frontend` berisi antarmuka dan interaksi aplikasi, sedangkan folder `backend` berisi logika bisnis serta skema database untuk Supabase. Logika aplikasi dijalankan di browser dan tidak menggunakan server Node.js terpisah.

## Cara Menjalankan

1. Siapkan proyek database di [Supabase](https://supabase.com/).
2. Jalankan skrip `backend/database.sql` melalui SQL Editor Supabase.
3. Sesuaikan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` pada `frontend/script.js`.
4. Buka `frontend/index.html` melalui browser atau gunakan ekstensi Live Server di VS Code.

**Catatan:** Pastikan kebijakan keamanan database (RLS dan policy) dikonfigurasi dengan benar sebelum aplikasi digunakan dengan data nyata.

---

Developed as a web-based accounting application for **Toko Elektronik Maju**.
