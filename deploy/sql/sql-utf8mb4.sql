-- =============================================================
-- sql-utf8mb4.sql — ubah karakter tabel menjadi utf8mb4 (sekali saja)
--
-- Kenapa wajib: dump import cPanel membuat tabel berkarakter latin1,
-- sedangkan koneksi PDO memakai charset=utf8mb4. Akibat nyata dari kondisi
-- ini (teruji di lingkungan staging): guru menekan "Simpan modul" dengan
-- deskripsi berisi → atau Ø dan MariaDB menolak
--   ERROR 1366: Incorrect string value '\xE2\x86\x92 ...'
-- atau, bila sql_mode hosting longgar, karakter itu tersimpan jadi "?" dan
-- hilang selamanya.
--
-- Jalankan: phpMyAdmin > pilih database xfag9686_cnc > tab SQL
--          > tempel SELURUH isi file ini > Go (bisa juga lewat shell mysql)
--
-- Catatan teknis: MariaDB menolak mengubah karakter kolom yang dipakai
-- foreign key (ERROR 1832), jadi constraint dilepas dulu dan dipasang lagi
-- di akhir. Data tidak dihapus. Skrip ini untuk MariaDB (IF EXISTS dipakai);
-- untuk MySQL murni hapus kata IF EXISTS pada baris DROP FOREIGN KEY.
-- Setelah selesai, tabel yang baru dibuat kemudian ikut utf8mb4 karena
-- default database diubah di baris pertama.
-- =============================================================

ALTER DATABASE `xfag9686_cnc` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 1) Lepas foreign key sementara
ALTER TABLE `percobaan`         DROP FOREIGN KEY IF EXISTS `fk_coba_user`;
ALTER TABLE `percobaan`         DROP FOREIGN KEY IF EXISTS `fk_coba_modul`;
ALTER TABLE `program_tersimpan` DROP FOREIGN KEY IF EXISTS `fk_prog_user`;
ALTER TABLE `modul_latihan`     DROP FOREIGN KEY IF EXISTS `fk_modul_user`;

-- 2) Konversi karakter (data dibaca ulang dari byte latin1 ke utf8mb4)
ALTER TABLE `percobaan`         CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `program_tersimpan` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `modul_latihan`     CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `users`             CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) Pasang kembali foreign key seperti sebelumnya
ALTER TABLE `modul_latihan`
  ADD CONSTRAINT `fk_modul_user` FOREIGN KEY (`dibuat_oleh`) REFERENCES `users` (`id`) ON UPDATE CASCADE;
ALTER TABLE `percobaan`
  ADD CONSTRAINT `fk_coba_user`  FOREIGN KEY (`user_id`)  REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_coba_modul` FOREIGN KEY (`modul_id`) REFERENCES `modul_latihan` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `program_tersimpan`
  ADD CONSTRAINT `fk_prog_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Verifikasi: semua baris harus bertuliskan utf8mb4_unicode_ci
SELECT TABLE_NAME, TABLE_COLLATION
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'xfag9686_cnc';

-- Opsional: menimpa ulang deskripsi modul bawaan yang terlanjur tersimpan
-- dengan tanda tanya saat import pertama. Jalankan bila modul Level 3 di
-- dasbor masih tampil sebagai "Ø40?Ø30?Ø20".
-- UPDATE `modul_latihan`
--    SET `deskripsi` = 'Membuat 3 undakan: Ø40 → Ø30 → Ø20. Hati-hati tarik pahat ke X aman sebelum G00!'
--  WHERE `id` = 'a0000000-0000-0000-0000-000000000003';
