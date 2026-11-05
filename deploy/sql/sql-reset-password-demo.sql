-- =============================================================
-- sql-reset-password-demo.sql — mengembalikan password akun demo
--
-- Situasi: akun bawaan di database cPanel memakai hash yang tidak cocok
-- lagi dengan "password123" sehingga login demo gagal. Jalankan file ini
-- di phpMyAdmin bila ingin memakai akun contoh seperti di README.
--
-- phpMyAdmin > database xfag9686_cnc > tab SQL > tempel > Go
-- =============================================================

UPDATE `users` SET `password_hash` = '$2y$10$8FjyH8nq3YwiYG1l1MUiiOfgqA.rqbwN49h1/pTQKije4h7ni2eKq'
 WHERE `email` IN ('admin@smk.sch.id', 'guru@smk.sch.id', 'siswa@smk.sch.id',
                   'andi@murid.sch.id', 'sinta@murid.sch.id');

-- Setelah ini semua akun tersebut berisi:  password123
-- Disarankan: segera ganti lewat akun guru setelah login pertama,
-- atau hapus akun demo/audit (uji..., audit...) dari tabel users.
-- DELETE FROM `users` WHERE `email` LIKE '%@x.id';
