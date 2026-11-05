# Deploy ke cPanel (hosting PHP + MySQL)

Panduan memindahkan LMS ke shared hosting cPanel. Frontend dan API memakai satu
domain, jadi server tidak perlu Node.js maupun Composer.

Isi folder ini:

| Berkas | Fungsi |
|---|---|
| [`build-cpanel.sh`](build-cpanel.sh) | membangun frontend lalu merakit folder `cPanel/` siap upload |
| [`public_html.htaccess`](public_html.htaccess) | sumber `.htaccess` root (routing SPA + penerusan `/uploads`) |
| [`sql/sql-utf8mb4.sql`](sql/sql-utf8mb4.sql) | mengonversi tabel lama ke utf8mb4 |
| [`sql/sql-migrasi-lms.sql`](sql/sql-migrasi-lms.sql) | menaikkan basis data lama ke skema LMS lengkap |
| [`sql/sql-reset-password-demo.sql`](sql/sql-reset-password-demo.sql) | menyetel ulang password akun demo |

Berkas-berkas SQL di atas adalah sumber. Setiap build disalin ke `cPanel/sql/`
dengan penomoran dan satu berkas tambahan hasil olahan `backend-php/database.sql`
sehingga siap import tanpa menghapus baris apa pun; ikuti
`cPanel/sql/BACA.txt` di server.

Bentuk tujuan di server:

```
public_html/
├── index.html          hasil build Vite (base './', aset relatif)
├── assets/             JS + CSS hasil build
├── .htaccess           routing SPA + meneruskan /uploads ke api/uploads
└── api/                isi folder backend-php/
    ├── api.php         front controller semua endpoint /api/*
    ├── config.php      baca kredensial dari .env
    ├── .env            kredensial DB + JWT_SECRET (tidak bisa dibuka dari browser)
    ├── .htaccess       /api/* ke api.php, blokir .env/.sql/tests
    ├── lib/            GCode.php, AITutor.php, Lms.php
    ├── routes/         auth, users, kelas, materi, modul, tugas, penilaian,
    │                   attempts, programs, stats, aitutor
    └── uploads/        LKPD dan berkas materi (harus bisa ditulisi PHP)
```

## 1. Bangun paket upload

```bash
bash deploy/build-cpanel.sh
```

Hasilnya folder `cPanel/` (persis isi `public_html`) dan `cPanel/cPanel-upload.zip`.
Skrip menjalankan `npm run build`, menyalin hanya file yang diperlukan (`tests/`,
`database.sql`, `.env.example` sengaja tidak ikut), memeriksa sintaks PHP, lalu
mengatur izin 755/644 dan `api/uploads` 775. Gunakan
`SKIP_BUILD=1 bash deploy/build-cpanel.sh` bila `dist/` sudah terbaru.

`cPanel/` dan isinya tidak ikut masuk git (lihat `.gitignore`) karena
`cPanel/api/.env` memuat kredensial hosting. Regenerasi kapan pun dengan perintah
di atas, atau ambil zip dari halaman Releases bila repo menyediakan.

## 2. Database

Berkas SQL diletakkan build script di `cPanel/sql/` (sumber aslinya folder
[`sql/`](sql/) ini) dan ada panduan singkat `cPanel/sql/BACA.txt`. Pilih salah
satu jalur, jalankan lewat phpMyAdmin (klik database di kolom kiri, tab **SQL**
untuk menempel isi berkas, atau tab **Import** untuk memilih berkasnya).

**Jalur A, database lama dihapus lalu import bersih** ( tercepat, data lama hilang )

1. cPanel > *MySQL Databases* > hapus database lama, buat lagi dengan nama sama,
   buat user dan grant user ke database.
2. Import `cPanel/sql/01-skema-lms.sql` (11 tabel + akun demo + 4 modul + rombel
   + tugas praktik + kuis 4 tipe). Berkas ini versi `backend-php/database.sql`
   yang baris `CREATE DATABASE` dan `USE cnc_lms`-nya sudah dilepas, jadi bisa
   langsung diimpor ke database hosting.
3. `04-reset-password-demo.sql` hanya bila login demo tetap ditolak.

**Jalur B, database lama dipertahankan**

1. `02-utf8mb4.sql` wajib lebih dulu. Tabel hasil impor cPanel biasanya masih
   latin1 sedangkan koneksi PDO memakai utf8mb4; tanpa langkah ini karakter
   seperti `→` dan `Ø` tersimpan menjadi `?`.
2. `03-migrasi-lms.sql` menaikkan skema: role `admin`, kolom
   `username`/`nis`/`status`/`last_login` (`users.kelas` dilebarkan menjadi
   `VARCHAR(60)`), lalu tabel `kelas`, `anggota_kelas`, `materi`, `tugas`, `soal`,
   `pengumpulan`, `jawaban_kuis` serta kolom pengait `percobaan.tugas_id`. Semua
   `IF NOT EXISTS`/`IF EXISTS`, jadi menjalankannya dua kali tidak merusak apa
   pun.
3. `04-reset-password-demo.sql` opsional.

Jangan menjalankan `01` dan `03` pada database yang sama. `01-skema-lms-termasuk-create-database.sql`
adalah berkas asli untuk server lokal (XAMPP) yang punya hak membuat database.
Folder `sql/` diblokir dari browser oleh `.htaccess` root (`Options -Indexes` dan
`RewriteRule ^sql/ - [F]`); setelah import selesai boleh dihapus dari
`public_html`.

Verifikasi akhir, semua tabel harus `utf8mb4_unicode_ci` dan jumlah role sudah
benar:

```sql
SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME;
SELECT role, COUNT(*) AS jumlah FROM `users` GROUP BY role;
```

## 3. Upload

Di File Manager cPanel: hapus file lama di `public_html` bila ada, upload
`cPanel/cPanel-upload.zip`, lalu **Extract** di dalam `public_html`. Isi zip
sudah berada di root zip (tidak ada folder pembungkus), jadi langsung menempati
`public_html`. Extract mempertahankan nama file titik (`.htaccess`); kalau pakai
drag-and-drop folder, aktifkan "Show Hidden Files" lebih dulu agar `.htaccess`
ikut, dan jangan lupa centang opsi menimpa file yang sudah ada.

## 4. Isi domain di `.env`

Buka `public_html/api/.env`, ganti `NAMA-DOMAIN` menjadi domain asli:

```
CLIENT_URL=https://domain-asli.com,https://www.domain-asli.com
```

Ini hanya untuk CORS lintas-origin. Kalau frontend dan API satu domain (layout
di atas), dikosongkan pun tetap jalan karena origin yang sama selalu dipercaya.
Pastikan `DB_HOST`, `DB_NAME`, `DB_USER`, dan `DB_PASS` sesuai cPanel
*MySQL Databases*, lalu isi `APP_DEBUG=1` sementara bila ada error yang ingin
dilihat detailnya, dan kosongkan kembali setelah stabil.

## 5. Cek hasil

```bash
curl https://domain-asli.com/api/salah          # {"error":"Endpoint tidak dikenal"} -> PHP + rewrite jalan
curl https://domain-asli.com/api/modules        # {"error":"Token hilang/tidak valid"} -> DB + auth jalan
curl -I https://domain-asli.com/api/.env        # 403 Forbidden -> kredensial terlindungi
```

Lalu buka situs, login, dan uji satu simulasi. Kalau cek pertama berhasil tetapi
yang kedua gagal koneksi MySQL, periksa nama host DB di cPanel (sebagian hosting
memakai `localhost`, sebagian lain `127.0.0.1` atau `server.xxx.com`) dan pastikan
user database punya privilege atas database-nya di **MySQL Databases > Current
Users**.

## 6. Catatan hosting

- **PHP versi**: pilih 8.1 sampai 8.4 di *Select PHP Version*; perlu ekstensi
  `pdo_mysql`, `json`, `mbstring`, `curl` (curl hanya untuk AI Tutor LLM).
- **Ukuran upload LKPD dan materi** (batas aplikasi 20 MB): kalau PDF atau video
  guru ditolak, naikkan `upload_max_filesize` dan `post_max_size` di
  *Select PHP Version > Options*. Jangan menulis `php_value` di `.htaccess`,
  karena pada PHP yang berjalan sebagai LiteSpeed/CGI direktif itu membuat
  seluruh situs error 500.
- **Folder `api/uploads`** harus dapat ditulisi PHP (755/775). Bila upload gagal,
  cek *Error Log* cPanel.
- **HTTPS**: aktifkan *SSL/TLS Status > Run AutoSSL*, kemudian tambahkan
  pengalihan paksa HTTPS bila diperlukan.
- **Backup**: *File Manager > Backup* atau arsip `Public Web` sebelum menimpa
  `public_html` yang sudah berisi situs lain.

## 7. Alur pengembangan dan produksi

Pengembangan tetap seperti biasa: `php -S 127.0.0.1:8000 api.php` di folder
`backend-php` dan `npm run dev` di `lms-cnc-client`; proxy Vite meneruskan `/api`
dan `/uploads`. Kredensial pengembangan diambil dari `backend-php/.env` yang
sama; untuk XAMPP ubah `DB_*` menjadi basis data lokal (misalnya `cnc_lms` dengan
user `root` dan password kosong), atau set `DB_NAME` lewat environment karena
nilai environment lebih didahulukan daripada isi `.env`.
