-- =============================================================
-- sql-migrasi-lms.sql — menaikkan database cPanel ke skema LMS lengkap
-- (kelas + anggota, materi, tugas praktik/kuis, soal, pengumpulan,
--  penilaian guru, role admin) tanpa menghapus data yang sudah ada.
--
-- URUTAN PAKAI (sekali saja, lewat phpMyAdmin > tab SQL > Go):
--   1. sql-utf8mb4.sql     ubah karakter tabel lama ke utf8mb4
--   2. sql-migrasi-lms.sql file ini
--   3. sql-reset-password-demo.sql (opsional, kalau login demo gagal)
--
-- Untuk install baru dari nol cukup jalankan backend-php/database.sql.
-- Semua sintaks dipakai untuk MariaDB 10.3+ (IF EXISTS / IF NOT EXISTS).
-- =============================================================

-- ---------- 1. USER: role admin, NIS, status, terakhir login ----------
ALTER TABLE `users`
  MODIFY `role` ENUM('admin','guru','siswa') NOT NULL DEFAULT 'siswa',
  MODIFY `kelas` VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS `username`   VARCHAR(50)  NULL UNIQUE AFTER `id`,
  ADD COLUMN IF NOT EXISTS `nis`        VARCHAR(20)  NULL AFTER `username`,
  ADD COLUMN IF NOT EXISTS `status`     ENUM('aktif','nonaktif') NOT NULL DEFAULT 'aktif' AFTER `kelas`,
  ADD COLUMN IF NOT EXISTS `last_login` DATETIME     NULL AFTER `created_at`,
  ADD INDEX IF NOT EXISTS `idx_user_role` (`role`),
  ADD INDEX IF NOT EXISTS `idx_user_nis` (`nis`);

-- ---------- 2. PERCOBAAN: kolom pengait tugas (foreign key dibuat di langkah 9) ----------
ALTER TABLE `percobaan`
  ADD COLUMN IF NOT EXISTS `tugas_id` CHAR(36) NULL AFTER `modul_id`;

-- ---------- 3. KELAS ----------
CREATE TABLE IF NOT EXISTS `kelas` (
  `id`           CHAR(36)      NOT NULL PRIMARY KEY,
  `nama`         VARCHAR(100)  NOT NULL,
  `kode`         VARCHAR(12)   NOT NULL UNIQUE,
  `guru_id`      CHAR(36)      NOT NULL,
  `tingkat`      VARCHAR(10)   NULL,
  `kompetensi`   VARCHAR(60)   NULL,
  `tahun_ajaran` VARCHAR(12)   NULL,
  `deskripsi`    TEXT          NULL,
  `created_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_kelas_guru` (`guru_id`),
  CONSTRAINT `fk_kelas_guru` FOREIGN KEY (`guru_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anggota_kelas` (
  `id`          CHAR(36)  NOT NULL PRIMARY KEY,
  `kelas_id`    CHAR(36)  NOT NULL,
  `user_id`     CHAR(36)  NOT NULL,
  `gabung_pada` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_anggota` (`kelas_id`, `user_id`),
  CONSTRAINT `fk_anggota_kelas` FOREIGN KEY (`kelas_id`) REFERENCES `kelas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_anggota_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 4. MATERI ----------
CREATE TABLE IF NOT EXISTS `materi` (
  `id`          CHAR(36)     NOT NULL PRIMARY KEY,
  `kelas_id`    CHAR(36)     NOT NULL,
  `judul`       VARCHAR(150) NOT NULL,
  `tipe`        ENUM('pdf','video','tautan','teks') NOT NULL DEFAULT 'teks',
  `url`         VARCHAR(255) NULL,
  `berkas`      VARCHAR(255) NULL,
  `isi`         MEDIUMTEXT   NULL,
  `urutan`      INT          NOT NULL DEFAULT 1,
  `dibuat_oleh` CHAR(36)     NOT NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_materi_kelas` (`kelas_id`, `urutan`),
  CONSTRAINT `fk_materi_kelas` FOREIGN KEY (`kelas_id`) REFERENCES `kelas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_materi_user` FOREIGN KEY (`dibuat_oleh`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 5. TUGAS (praktik / kuis) ----------
CREATE TABLE IF NOT EXISTS `tugas` (
  `id`            CHAR(36)      NOT NULL PRIMARY KEY,
  `kelas_id`      CHAR(36)      NOT NULL,
  `dibuat_oleh`   CHAR(36)      NOT NULL,
  `modul_id`      CHAR(36)      NULL,
  `judul`         VARCHAR(150)  NOT NULL,
  `instruksi`     MEDIUMTEXT    NULL,
  `jenis`         ENUM('praktik','kuis') NOT NULL DEFAULT 'praktik',
  `target_profil` LONGTEXT      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `starter_gcode` TEXT          NULL,
  `lkpd_url`      VARCHAR(255)  NULL,
  `materi_ids`    LONGTEXT      CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `poin`          INT           NOT NULL DEFAULT 100,
  `batas_lulus`   INT           NOT NULL DEFAULT 70,
  `tenggat`       DATETIME      NULL,
  `boleh_ulang`   TINYINT(1)    NOT NULL DEFAULT 1,
  `status`        ENUM('draf','terbit') NOT NULL DEFAULT 'draf',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_tugas_kelas` (`kelas_id`, `status`),
  KEY `idx_tugas_tenggat` (`tenggat`),
  CONSTRAINT `fk_tugas_kelas` FOREIGN KEY (`kelas_id`) REFERENCES `kelas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_tugas_user` FOREIGN KEY (`dibuat_oleh`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_tugas_modul` FOREIGN KEY (`modul_id`) REFERENCES `modul_latihan` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 6. SOAL KUIS ----------
CREATE TABLE IF NOT EXISTS `soal` (
  `id`            CHAR(36)     NOT NULL PRIMARY KEY,
  `tugas_id`      CHAR(36)     NOT NULL,
  `urutan`        INT          NOT NULL DEFAULT 1,
  `tipe`          ENUM('pg','benar_salah','isian','praktik') NOT NULL DEFAULT 'pg',
  `teks`          MEDIUMTEXT   NOT NULL,
  `opsi`          LONGTEXT     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `kunci`         LONGTEXT     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `pembahasan`    TEXT         NULL,
  `poin`          INT          NOT NULL DEFAULT 10,
  `target_profil` LONGTEXT     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  KEY `idx_soal_tugas` (`tugas_id`, `urutan`),
  CONSTRAINT `fk_soal_tugas` FOREIGN KEY (`tugas_id`) REFERENCES `tugas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 7. PENGUMPULAN (nilai + catatan guru) ----------
CREATE TABLE IF NOT EXISTS `pengumpulan` (
  `id`               CHAR(36)     NOT NULL PRIMARY KEY,
  `tugas_id`         CHAR(36)     NOT NULL,
  `siswa_id`         CHAR(36)     NOT NULL,
  `gcode`            MEDIUMTEXT   NULL,
  `skor_simulasi`    INT          NULL,
  `ada_error`        TINYINT(1)   NOT NULL DEFAULT 0,
  `detail`           LONGTEXT     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `nilai_guru`       INT          NULL,
  `catatan_guru`     TEXT         NULL,
  `status`           ENUM('terkumpul','dinilai','perlu_revisi') NOT NULL DEFAULT 'terkumpul',
  `jumlah_percobaan` INT          NOT NULL DEFAULT 0,
  `waktu_submit`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `waktu_periksa`    DATETIME     NULL,
  `diperiksa_oleh`   CHAR(36)     NULL,
  UNIQUE KEY `uq_kumpul` (`tugas_id`, `siswa_id`),
  KEY `idx_kumpul_status` (`tugas_id`, `status`),
  CONSTRAINT `fk_kumpul_tugas` FOREIGN KEY (`tugas_id`) REFERENCES `tugas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kumpul_siswa` FOREIGN KEY (`siswa_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kumpul_periksa` FOREIGN KEY (`diperiksa_oleh`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 8. JAWABAN KUIS ----------
CREATE TABLE IF NOT EXISTS `jawaban_kuis` (
  `id`             CHAR(36)   NOT NULL PRIMARY KEY,
  `pengumpulan_id` CHAR(36)   NOT NULL,
  `tugas_id`       CHAR(36)   NOT NULL,
  `siswa_id`       CHAR(36)   NOT NULL,
  `soal_id`        CHAR(36)   NOT NULL,
  `jawaban`        TEXT       NULL,
  `gcode`          MEDIUMTEXT NULL,
  `benar`          TINYINT(1) NOT NULL DEFAULT 0,
  `poin`           INT        NOT NULL DEFAULT 0,
  KEY `idx_jawab_siswa` (`tugas_id`, `siswa_id`),
  CONSTRAINT `fk_jawab_kumpul` FOREIGN KEY (`pengumpulan_id`) REFERENCES `pengumpulan` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_jawab_tugas` FOREIGN KEY (`tugas_id`) REFERENCES `tugas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_jawab_soal` FOREIGN KEY (`soal_id`) REFERENCES `soal` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 9. Foreign key percobaan.tugas_id (tabel tugas sudah ada) ----------
ALTER TABLE `percobaan`
  DROP FOREIGN KEY IF EXISTS `fk_coba_tugas`;
ALTER TABLE `percobaan`
  ADD CONSTRAINT `fk_coba_tugas` FOREIGN KEY (`tugas_id`) REFERENCES `tugas` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- 10. Data awal untuk demo/ujicoba ----------
-- Akun admin: pakai akun guru yang sudah ada bila belum ada admin.
UPDATE `users` SET `role` = 'admin'
 WHERE `email` = 'admin@smk.sch.id' AND `role` <> 'admin';

INSERT IGNORE INTO `users` (id, username, nis, nama, email, password_hash, role, kelas) VALUES
('00000000-0000-0000-0000-000000000001', 'admin', NULL, 'Administrator SMK', 'admin@smk.sch.id',
 '$2y$10$8FjyH8nq3YwiYG1l1MUiiOfgqA.rqbwN49h1/pTQKije4h7ni2eKq', 'admin', NULL);

INSERT IGNORE INTO `kelas` (id, nama, kode, guru_id, tingkat, kompetensi, tahun_ajaran, deskripsi) VALUES
('c0000000-0000-0000-0000-000000000001', 'XII TPM 1', 'TPM1A1', '11111111-1111-1111-1111-111111111111',
 'XII', 'Teknik Pemesinan', '2026/2027', 'Rombel pembubutan CNC program keahlian Teknik Pemesinan.');

-- Semua siswa aktif dimasukkan ke kelas contoh supaya langsung terisi.
INSERT IGNORE INTO `anggota_kelas` (id, kelas_id, user_id)
SELECT UUID(), 'c0000000-0000-0000-0000-000000000001', `id`
  FROM `users` WHERE `role` = 'siswa' AND `status` = 'aktif';

INSERT IGNORE INTO `materi` (id, kelas_id, judul, tipe, url, isi, urutan, dibuat_oleh) VALUES
('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
 'Orientasi sumbu mesin bubut GreaMaT', 'teks', NULL,
 'Sumbu X menyatakan diameter sehingga nilainya dua kali radius. Sumbu Z sepanjang benda kerja dengan chuck di Z=0 dan nilai negatif menjauhi chuck. Sebelum memakai G00, pastikan pahat sudah ditarik ke diameter aman di atas stock.',
 1, '11111111-1111-1111-1111-111111111111');

INSERT IGNORE INTO `tugas` (id, kelas_id, dibuat_oleh, modul_id, judul, instruksi, jenis, materi_ids, poin, batas_lulus, status) VALUES
('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
 '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002',
 'Tugas 1: Pembubutan tirus Ø40 menjadi Ø20',
 'Susun program G-Code untuk meniruskan stock Ø40 L60 menjadi Ø20 sepanjang 40 mm. Jalankan simulasi lebih dulu, periksa peringatan tabrakan, lalu kirim hasilnya.',
 'praktik', '["e0000000-0000-0000-0000-000000000001"]', 100, 70, 'terbit'),
('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
 '11111111-1111-1111-1111-111111111111', NULL, 'Kuis 1: Dasar pemrograman bubut CNC',
 'Kerjakan seluruh soal. Soal praktik dikerjakan langsung di simulator.',
 'kuis', NULL, 40, 60, 'terbit');

INSERT IGNORE INTO `soal` (id, tugas_id, urutan, tipe, teks, opsi, kunci, pembahasan, poin, target_profil) VALUES
('g0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 1, 'pg',
 'Pada pemrograman bubut CNC, nilai X menyatakan apa?',
 '["Diameter benda kerja", "Radius benda kerja", "Panjang benda kerja", "Putaran spindle"]', 0,
 'Nilai X pada bubut sudah berupa diameter sehingga tidak perlu dikali dua lagi.', 10, NULL),
('g0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 2, 'benar_salah',
 'Gerak cepat G00 aman dipakai melintasi jalur yang masih ada materialnya.',
 '["Benar", "Salah"]', FALSE,
 'G00 tidak menyayat, bila jalurnya memotong material akan terjadi tabrakan pahat.', 10, NULL),
('g0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002', 3, 'isian',
 'Kode G untuk mode koordinat inkremental adalah ...',
 NULL, '["G91", "g91", "G091"]',
 'G90 untuk koordinat absolut, G91 untuk inkremental.', 10, NULL),
('g0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 4, 'praktik',
 'Buat program untuk membubut stock Ø40 L60 menjadi Ø30 sepanjang 30 mm tanpa tabrakan.',
 NULL, NULL,
 'Skor diambil otomatis dari kecocokan profil hasil simulasi dengan target.', 10,
 '{"stock_d":40,"stock_l":60,"target_d":30,"target_z":30}');

-- Perbaiki teks modul bawaan yang rusak karena import latin1 pertama.
UPDATE `modul_latihan`
   SET `deskripsi` = 'Mengenal koordinat X sebagai diameter dan Z sepanjang benda kerja, serta beda gerak cepat G00 dengan penyayatan G01.'
 WHERE `id` = 'a0000000-0000-0000-0000-000000000001';
UPDATE `modul_latihan`
   SET `deskripsi` = 'Membuat 3 undakan: Ø40 → Ø30 → Ø20. Tarik pahat ke diameter aman sebelum memakai G00.'
 WHERE `id` = 'a0000000-0000-0000-0000-000000000003';
UPDATE `modul_latihan`
   SET `deskripsi` = 'Membuat fillet radius 5 mm. Busur memakai I/K, yaitu I offset pusat searah X dalam radius mm dan K offset searah Z menjauhi chuck.'
 WHERE `id` = 'a0000000-0000-0000-0000-000000000004';

-- ---------- 11. Verifikasi ----------
SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME;
SELECT role, COUNT(*) AS jumlah FROM `users` GROUP BY role;
