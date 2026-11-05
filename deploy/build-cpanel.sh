#!/usr/bin/env bash
# =============================================================
# build-cpanel.sh — menyiapkan paket upload cPanel di folder cPanel/.
# Hasil: cPanel/            isi yang disalin ke public_html
#        cPanel/cPanel-upload.zip (isinya langsung di root zip)
# Pakai: bash deploy/build-cpanel.sh   (dari folder mana pun)
# Skip build frontend: SKIP_BUILD=1 bash deploy/build-cpanel.sh
# =============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/cPanel"
API_SRC="$ROOT/backend-php"
DIST="$ROOT/lms-cnc-client/dist"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  echo "==> Build frontend (React + Vite)"
  cd "$ROOT/lms-cnc-client"
  [[ -d node_modules ]] || npm install
  npm run build
fi

[[ -f "$DIST/index.html" ]] || { echo "dist/index.html belum ada. Jalankan tanpa SKIP_BUILD."; exit 1; }

echo "==> Merakit $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/assets" "$OUT/api/lib" "$OUT/api/routes" "$OUT/api/uploads" "$OUT/sql"

# Frontend
cp "$DIST/index.html" "$OUT/index.html"
cp -r "$DIST/assets/." "$OUT/assets/"
cp "$ROOT/deploy/public_html.htaccess" "$OUT/.htaccess"

# Backend (sengaja tanpa tests/, database.sql, .env.example)
cp "$API_SRC/api.php" "$API_SRC/config.php" "$API_SRC/.htaccess" "$OUT/api/"
[[ -f "$API_SRC/.env" ]] && cp "$API_SRC/.env" "$OUT/api/.env"
cp -r "$API_SRC/lib/." "$OUT/api/lib/"
cp "$API_SRC"/routes/*.php "$OUT/api/routes/"
cp "$API_SRC/uploads/.htaccess" "$OUT/api/uploads/.htaccess"

echo "==> Menyiapkan berkas SQL di sql/"
# Skema utuh untuk import bersih. Baris CREATE DATABASE dan USE dilepas karena
# user cPanel umumnya tidak punya hak membuat database; file ini diimpor ke
# database yang sudah dibuat lewat MySQL Databases.
sed -E '/^CREATE DATABASE/d; /^USE /d' "$API_SRC/database.sql" > "$OUT/sql/01-skema-lms.sql"
cp "$API_SRC/database.sql"        "$OUT/sql/01-skema-lms-termasuk-create-database.sql"
cp "$ROOT/deploy/sql/sql-utf8mb4.sql"           "$OUT/sql/02-utf8mb4.sql"
cp "$ROOT/deploy/sql/sql-migrasi-lms.sql"       "$OUT/sql/03-migrasi-lms.sql"
cp "$ROOT/deploy/sql/sql-reset-password-demo.sql" "$OUT/sql/04-reset-password-demo.sql"
cat > "$OUT/sql/BACA.txt" <<'SQLTXT'
BERKAS SQL SIAP JALAN (phpMyAdmin > tab SQL > tempel > Go, atau tab Import)

JALUR A. Database lama dihapus lalu import bersih (paling cepat, semua data lama hilang)
  1. Buka cPanel > MySQL Databases, hapus database lama, buat database dan user
     baru dengan nama sama, grant user ke database.
  2. phpMyAdmin > klik database di kolom kiri > tab Import > pilih
     01-skema-lms.sql > Go. (01 memakai CREATE TABLE IF NOT EXISTS + INSERT
     IGNORE, jadi aman dijalankan dua kali.)
  3. Selesai. Skema sudah utf8mb4 dan akun demo sudah password123.
     Bila login demo tetap ditolak, jalankan 04-reset-password-demo.sql.

JALUR B. Database lama dipertahankan (modul, percobaan, program siswa tetap utuh)
  1. Jalankan 02-utf8mb4.sql (tabel lama biasanya masih latin1).
  2. Jalankan 03-migrasi-lms.sql (menambah kolom, tabel LMS, dan foreign key).
  3. Opsional: 04-reset-password-demo.sql bila akun demo tidak bisa masuk.
  4. Cek hasil: SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE();

Catatan
  - 01-skema-lms.sql tidak punya baris CREATE DATABASE/USE sehingga bisa
    langsung diimpor ke database hosting. File
    01-skema-lms-termasuk-create-database.sql adalah versi asli untuk server
    lokal (XAMPP) yang hak buat database-nya penuh.
  - Jangan jalankan 01 dan 03 sekaligus pada database yang sama; 03 hanya untuk
    database lama yang strukturnya masih versi sebelum LMS.
  - Folder sql/ diblokir dari browser oleh .htaccess root. Hapus folder ini dari
    public_html setelah import selesai bila tidak ingin terpakai.
SQLTXT

echo "==> Cek sintaks PHP"
find "$OUT" -name '*.php' -print0 | xargs -0 -n1 -P4 php -l > /dev/null

echo "==> Mengatur izin (folder 755, file 644, uploads 775)"
find "$OUT" -type d -exec chmod 755 {} +
find "$OUT" -type f -exec chmod 644 {} +
chmod 775 "$OUT/api/uploads"

echo "==> Membungkus zip"
TMP="$ROOT/.cpanel-package.zip"
rm -f "$TMP"
(cd "$OUT" && zip -qr "$TMP" .)
rm -f "$OUT/cPanel-upload.zip"
mv "$TMP" "$OUT/cPanel-upload.zip"

echo
echo "Selesai. Upload isi cPanel/ (atau cPanel/cPanel-upload.zip) ke public_html."
echo "Isi zip sudah berada di root, jadi langsung Extract di dalam public_html."
echo "Jumlah file: $(find "$OUT" -type f | wc -l | tr -d ' ')"
[[ -f "$API_SRC/.env" ]] || echo "PERINGATAN: backend-php/.env belum ada — salin dari .env.example."
