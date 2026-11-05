-- =============================================================
-- Database LMS Simulator Bubut CNC  (MySQL / MariaDB, utf8mb4)
-- Entitas sesuai ERD Physical Data Model proposal Logicodix 2026 §12.4
-- (USER, MODUL_LATIHAN, PERCOBAAN, PROGRAM_TERSIMPAN) ditambah lapisan
-- KELAS, MATERI, TUGAS, SOAL, PENGUMPULAN, JAWABAN_KUIS untuk
-- pembelajaran terstruktur di SMK.
--
-- Install baru (XAMPP):  mysql -uroot < database.sql
-- Upgrade DB produksi:   jalankan deploy/sql/sql-migrasi-lms.sql (data lama dipertahankan)
-- Impor ke basis data hosting: hapus dulu baris CREATE DATABASE dan USE di bawah,
-- karena user cPanel biasanya tidak punya hak membuat database.
-- =============================================================
CREATE DATABASE IF NOT EXISTS cnc_lms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cnc_lms;

SET NAMES utf8mb4;

-- ---------- USER ----------
-- role: admin (pengelola akun dan rekap sekolah), guru (pengampu kelas), siswa
CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  username      VARCHAR(50)   NULL UNIQUE,
  nis           VARCHAR(20)   NULL,
  nama          VARCHAR(100)  NOT NULL,
  email         VARCHAR(100)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('admin','guru','siswa') NOT NULL DEFAULT 'siswa',
  kelas         VARCHAR(60)   NULL,               -- label kelas untuk tampilan
  status        ENUM('aktif','nonaktif') NOT NULL DEFAULT 'aktif',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login    DATETIME      NULL,
  INDEX idx_user_role (role),
  INDEX idx_user_nis (nis)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- KELAS (rombel yang diampu satu guru) ----------
CREATE TABLE IF NOT EXISTS kelas (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  nama          VARCHAR(100)  NOT NULL,
  kode          VARCHAR(12)   NOT NULL UNIQUE,     -- kode undangan bergabung mandiri
  guru_id       CHAR(36)      NOT NULL,
  tingkat       VARCHAR(10)   NULL,                -- X / XI / XII
  kompetensi    VARCHAR(60)   NULL,                -- mis. Teknik Pemesinan
  tahun_ajaran  VARCHAR(12)   NULL,                -- mis. 2026/2027
  deskripsi     TEXT          NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_kelas_guru FOREIGN KEY (guru_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_kelas_guru (guru_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- ANGGOTA KELAS ----------
CREATE TABLE IF NOT EXISTS anggota_kelas (
  id          CHAR(36)  NOT NULL PRIMARY KEY,
  kelas_id    CHAR(36)  NOT NULL,
  user_id     CHAR(36)  NOT NULL,
  gabung_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_anggota_kelas FOREIGN KEY (kelas_id) REFERENCES kelas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_anggota_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uq_anggota (kelas_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- MODUL_LATIHAN (pustaka latihan G-Code) ----------
CREATE TABLE IF NOT EXISTS modul_latihan (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  dibuat_oleh   CHAR(36)      NOT NULL,
  judul         VARCHAR(100)  NOT NULL,
  level         INT           NOT NULL DEFAULT 1,
  deskripsi     TEXT          NULL,
  target_profil JSON          NOT NULL,
  starter_gcode TEXT          NULL,
  lkpd_url      VARCHAR(255)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_modul_user FOREIGN KEY (dibuat_oleh) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_modul_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- MATERI (PDF / video / tautan / teks per kelas) ----------
CREATE TABLE IF NOT EXISTS materi (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  kelas_id    CHAR(36)     NOT NULL,
  judul       VARCHAR(150) NOT NULL,
  tipe        ENUM('pdf','video','tautan','teks') NOT NULL DEFAULT 'teks',
  url         VARCHAR(255) NULL,
  berkas      VARCHAR(255) NULL,                   -- /uploads/... hasil unggah
  isi         MEDIUMTEXT   NULL,                   -- teks materi atau ringkasan
  urutan      INT          NOT NULL DEFAULT 1,
  dibuat_oleh CHAR(36)     NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_materi_kelas FOREIGN KEY (kelas_id) REFERENCES kelas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_materi_user FOREIGN KEY (dibuat_oleh) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_materi_kelas (kelas_id, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- TUGAS (praktik G-Code atau kuis) ----------
-- target_profil diisi bila guru ingin menimpa profil target modul_latihan.
CREATE TABLE IF NOT EXISTS tugas (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  kelas_id      CHAR(36)      NOT NULL,
  dibuat_oleh   CHAR(36)      NOT NULL,
  modul_id      CHAR(36)      NULL,
  judul         VARCHAR(150)  NOT NULL,
  instruksi     MEDIUMTEXT    NULL,
  jenis         ENUM('praktik','kuis') NOT NULL DEFAULT 'praktik',
  target_profil JSON          NULL,
  starter_gcode TEXT          NULL,
  lkpd_url      VARCHAR(255)  NULL,
  materi_ids    JSON          NULL,
  poin          INT           NOT NULL DEFAULT 100,
  batas_lulus   INT           NOT NULL DEFAULT 70,
  tenggat       DATETIME      NULL,
  boleh_ulang   TINYINT(1)    NOT NULL DEFAULT 1,
  status        ENUM('draf','terbit') NOT NULL DEFAULT 'draf',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tugas_kelas FOREIGN KEY (kelas_id) REFERENCES kelas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tugas_user FOREIGN KEY (dibuat_oleh) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_tugas_modul FOREIGN KEY (modul_id) REFERENCES modul_latihan(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_tugas_kelas (kelas_id, status),
  INDEX idx_tugas_tenggat (tenggat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SOAL KUIS ----------
-- pg:           opsi = daftar teks, kunci = index jawaban benar
-- benar_salah:  opsi tetap ["Benar","Salah"], kunci = true/false
-- isian:        kunci = daftar teks yang diterima, pencocokan mengabaikan besar/kecil huruf
-- praktik:      target_profil wajib, dinilai otomatis oleh mesin G-Code
CREATE TABLE IF NOT EXISTS soal (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  tugas_id      CHAR(36)     NOT NULL,
  urutan        INT          NOT NULL DEFAULT 1,
  tipe          ENUM('pg','benar_salah','isian','praktik') NOT NULL DEFAULT 'pg',
  teks          MEDIUMTEXT   NOT NULL,
  opsi          JSON         NULL,
  kunci         JSON         NULL,
  pembahasan    TEXT         NULL,
  poin          INT          NOT NULL DEFAULT 10,
  target_profil JSON         NULL,
  CONSTRAINT fk_soal_tugas FOREIGN KEY (tugas_id) REFERENCES tugas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_soal_tugas (tugas_id, urutan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PENGUMPULAN (hasil kerja siswa per tugas) ----------
CREATE TABLE IF NOT EXISTS pengumpulan (
  id               CHAR(36)     NOT NULL PRIMARY KEY,
  tugas_id         CHAR(36)     NOT NULL,
  siswa_id         CHAR(36)     NOT NULL,
  gcode            MEDIUMTEXT   NULL,
  skor_simulasi    INT          NULL,
  ada_error        TINYINT(1)   NOT NULL DEFAULT 0,
  detail           JSON         NULL,
  nilai_guru       INT          NULL,
  catatan_guru     TEXT         NULL,
  status           ENUM('terkumpul','dinilai','perlu_revisi') NOT NULL DEFAULT 'terkumpul',
  jumlah_percobaan INT          NOT NULL DEFAULT 0,
  waktu_submit     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  waktu_periksa    DATETIME     NULL,
  diperiksa_oleh   CHAR(36)     NULL,
  CONSTRAINT fk_kumpul_tugas FOREIGN KEY (tugas_id) REFERENCES tugas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_kumpul_siswa FOREIGN KEY (siswa_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_kumpul_periksa FOREIGN KEY (diperiksa_oleh) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  UNIQUE KEY uq_kumpul (tugas_id, siswa_id),
  INDEX idx_kumpul_status (tugas_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- JAWABAN_KUIS ----------
CREATE TABLE IF NOT EXISTS jawaban_kuis (
  id             CHAR(36)   NOT NULL PRIMARY KEY,
  pengumpulan_id CHAR(36)   NOT NULL,
  tugas_id       CHAR(36)   NOT NULL,
  siswa_id       CHAR(36)   NOT NULL,
  soal_id        CHAR(36)   NOT NULL,
  jawaban        TEXT       NULL,
  gcode          MEDIUMTEXT NULL,
  benar          TINYINT(1) NOT NULL DEFAULT 0,
  poin           INT        NOT NULL DEFAULT 0,
  CONSTRAINT fk_jawab_kumpul FOREIGN KEY (pengumpulan_id) REFERENCES pengumpulan(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_jawab_tugas FOREIGN KEY (tugas_id) REFERENCES tugas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_jawab_soal FOREIGN KEY (soal_id) REFERENCES soal(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_jawab_siswa (tugas_id, siswa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PERCOBAAN (riwayat simulasi + skor otomatis) ----------
CREATE TABLE IF NOT EXISTS percobaan (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  user_id       CHAR(36)      NOT NULL,
  modul_id      CHAR(36)      NULL,
  tugas_id      CHAR(36)      NULL,
  gcode_input   TEXT          NOT NULL,
  skor          INT           NOT NULL DEFAULT 0,
  ada_error     BOOLEAN       NOT NULL DEFAULT FALSE,
  detail        JSON          NULL,
  waktu_selesai TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coba_user  FOREIGN KEY (user_id)  REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_coba_modul FOREIGN KEY (modul_id) REFERENCES modul_latihan(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_coba_tugas FOREIGN KEY (tugas_id) REFERENCES tugas(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_coba_user_modul (user_id, modul_id),
  INDEX idx_coba_waktu (waktu_selesai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PROGRAM_TERSIMPAN (manajer program no-O) ----------
CREATE TABLE IF NOT EXISTS program_tersimpan (
  id              CHAR(36)      NOT NULL PRIMARY KEY,
  user_id         CHAR(36)      NOT NULL,
  nama            VARCHAR(100)  NOT NULL,
  gcode           TEXT          NOT NULL,
  stock_diameter  FLOAT         NOT NULL DEFAULT 40,
  stock_panjang   FLOAT         NOT NULL DEFAULT 60,
  target_diameter FLOAT         NOT NULL DEFAULT 20,
  target_panjang  FLOAT         NOT NULL DEFAULT 40,
  disimpan_pada   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prog_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_prog_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- SEED contoh: password semua akun demo = "password123" (bcrypt)
-- =============================================================
INSERT IGNORE INTO users (id, username, nis, nama, email, password_hash, role, kelas) VALUES
('00000000-0000-0000-0000-000000000001', 'admin', NULL, 'Administrator SMK', 'admin@smk.sch.id',
 '$2y$10$8FjyH8nq3YwiYG1l1MUiiOfgqA.rqbwN49h1/pTQKije4h7ni2eKq', 'admin', NULL),
('11111111-1111-1111-1111-111111111111', 'guru', NULL, 'Pak Guru', 'guru@smk.sch.id',
 '$2y$10$8FjyH8nq3YwiYG1l1MUiiOfgqA.rqbwN49h1/pTQKije4h7ni2eKq', 'guru', NULL),
('22222222-2222-2222-2222-222222222222', 'andi', '1001', 'Andi Siswa', 'andi@murid.sch.id',
 '$2y$10$8FjyH8nq3YwiYG1l1MUiiOfgqA.rqbwN49h1/pTQKije4h7ni2eKq', 'siswa', 'XII TPM 1'),
('33333333-3333-3333-3333-333333333333', 'sinta', '1002', 'Sinta Siswi', 'sinta@murid.sch.id',
 '$2y$10$8FjyH8nq3YwiYG1l1MUiiOfgqA.rqbwN49h1/pTQKije4h7ni2eKq', 'siswa', 'XII TPM 1');

INSERT IGNORE INTO kelas (id, nama, kode, guru_id, tingkat, kompetensi, tahun_ajaran, deskripsi) VALUES
('c0000000-0000-0000-0000-000000000001', 'XII TPM 1', 'TPM1A1', '11111111-1111-1111-1111-111111111111',
 'XII', 'Teknik Pemesinan', '2026/2027', 'Rombel pembubutan CNC program keahlian Teknik Pemesinan.');

INSERT IGNORE INTO anggota_kelas (id, kelas_id, user_id) VALUES
('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222'),
('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');

-- Modul bertingkat (MVP §10.1): 4 level, starter_gcode terisi otomatis di editor
INSERT IGNORE INTO modul_latihan (id, dibuat_oleh, judul, level, deskripsi, target_profil, starter_gcode, lkpd_url) VALUES
('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Level 1: Gerak Lurus G00/G01', 1,
 'Mengenal koordinat X sebagai diameter dan Z sepanjang benda kerja, serta beda gerak cepat G00 dengan penyayatan G01.',
 '{"stock_d":40,"stock_l":60,"target_d":30,"target_z":30}',
 'G90\nG00 X40 Z0\nG01 X30 Z-30 F100\nG00 X50 Z5', NULL),
('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
 'Level 2: Pembubutan Tirus', 2,
 'Meniruskan stock Ø40 L60 menjadi Ø20 sepanjang 40 mm.',
 '{"stock_d":40,"stock_l":60,"target_d":20,"target_z":40}',
 'G90\nG00 X40 Z0\nG01 X20 Z-40 F100\nG00 X50 Z5', NULL),
('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
 'Level 3: Bertingkat (Step Turning)', 3,
 'Membuat 3 undakan: Ø40 → Ø30 → Ø20. Tarik pahat ke diameter aman sebelum memakai G00.',
 '{"stock_d":50,"stock_l":60,"target_d":20,"target_z":55}',
 'G90\nG00 X50 Z0\nG01 X40 Z0 F100\nG01 X40 Z-15 F100\nG00 X50 Z-15', NULL),
('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
 'Level 4: Radius G02/G03', 4,
 'Membuat fillet radius 5 mm. Busur memakai I/K, yaitu I offset pusat searah X dalam radius mm dan K offset searah Z menjauhi chuck.',
 '{"stock_d":40,"stock_l":40,"target_d":30,"target_z":20}',
 'G90\nG00 X40 Z0\nG01 X30 Z-15 F100\nG03 X20 Z-20 R5 F80\nG00 X50\nG00 Z5', NULL);

INSERT IGNORE INTO materi (id, kelas_id, judul, tipe, url, isi, urutan, dibuat_oleh) VALUES
('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
 'Orientasi sumbu mesin bubut GreaMaT', 'teks', NULL,
 'Sumbu X menyatakan diameter sehingga nilainya dua kali radius. Sumbu Z sepanjang benda kerja dengan chuck di Z=0 dan nilai negatif menjauhi chuck. Sebelum memakai G00, pastikan pahat sudah ditarik ke diameter aman di atas stock.',
 1, '11111111-1111-1111-1111-111111111111');

-- Tugas praktik: target geometri diambil dari modul Level 2
INSERT IGNORE INTO tugas (id, kelas_id, dibuat_oleh, modul_id, judul, instruksi, jenis, materi_ids, poin, batas_lulus, status) VALUES
('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
 '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002',
 'Tugas 1: Pembubutan tirus Ø40 menjadi Ø20',
 'Susun program G-Code untuk meniruskan stock Ø40 L60 menjadi Ø20 sepanjang 40 mm. Jalankan simulasi lebih dulu, periksa peringatan tabrakan, lalu kirim hasilnya.',
 'praktik', '["e0000000-0000-0000-0000-000000000001"]', 100, 70, 'terbit');

INSERT IGNORE INTO tugas (id, kelas_id, dibuat_oleh, judul, instruksi, jenis, poin, batas_lulus, status) VALUES
('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
 '11111111-1111-1111-1111-111111111111', 'Kuis 1: Dasar pemrograman bubut CNC',
 'Kerjakan seluruh soal. Soal praktik dikerjakan langsung di simulator.',
 'kuis', 40, 60, 'terbit');

-- Contoh kuis dengan empat tipe soal
INSERT IGNORE INTO soal (id, tugas_id, urutan, tipe, teks, opsi, kunci, pembahasan, poin, target_profil) VALUES
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
