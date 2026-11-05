<?php
// =============================================================
// lib/Lms.php — helper domain LMS: format respons, aturan akses,
// perhitungan nilai, dan ekspor. Dipakai semua file di routes/.
// Bentuk respons mengikuti docs/API-LMS.md.
// =============================================================

// Semua route terproteksi memanggil ini: token dibaca lalu diperiksa ulang
// ke database sehingga peran yang berubah atau akun dinonaktifkan langsung
// berlaku tanpa menunggu token JWT kedaluwarsa.
function auth(PDO $pdo): array {
  $u = current_user();
  if (!$u) json_out(['error' => 'Token hilang/tidak valid'], 401);
  $st = $pdo->prepare('SELECT id, nama, email, username, nis, role, kelas, status, last_login FROM users WHERE id=?');
  $st->execute([$u['id']]);
  $row = $st->fetch();
  if (!$row) json_out(['error' => 'Akun tidak ditemukan, silakan masuk ulang'], 401);
  if (($row['status'] ?? 'aktif') !== 'aktif') json_out(['error' => 'Akun dinonaktifkan, hubungi administrator'], 403);
  return pub_user($row);
}

function pub_user(array $u): array {
  return [
    'id' => $u['id'], 'nama' => $u['nama'], 'email' => $u['email'],
    'username' => $u['username'] ?? null, 'nis' => $u['nis'] ?? null,
    'role' => $u['role'], 'kelas' => $u['kelas'],
    'status' => $u['status'] ?? 'aktif', 'last_login' => $u['last_login'] ?? null,
  ];
}

function json_cols($row, string ...$keys): array {  $out = [];
  foreach ($keys as $k) {
    $v = $row[$k] ?? null;
    $out[$k] = ($v === null || $v === '') ? null : (json_decode($v, true) ?? null);
  }
  return $out;
}

function t_html(?string $s): string {
  return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

// Label kelas (users.kelas) hanya VARCHAR(60); nama rombel panjang dipotong
// supaya insert tidak gagal di MariaDB mode strict.
function potong_teks(?string $s, int $maks = 60): ?string {
  if ($s === null) return null;
  $s = trim($s);
  return $s === '' ? null : mb_substr($s, 0, $maks);
}

// Kode undangan kelas: 6 karakter tanpa huruf/angka yang mudah tertukar.
function kode_unik(PDO $pdo): string {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $st = $pdo->prepare('SELECT id FROM kelas WHERE kode=?');
  for ($i = 0; $i < 40; $i++) {
    $kode = '';
    for ($j = 0; $j < 6; $j++) $kode .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    $st->execute([$kode]);
    if (!$st->fetch()) return $kode;
  }
  return substr(strtoupper(bin2hex(random_bytes(4))), 0, 6);
}

function cari_kelas(PDO $pdo, string $id): ?array {
  $st = $pdo->prepare('SELECT * FROM kelas WHERE id=?');
  $st->execute([$id]);
  $k = $st->fetch();
  return $k ?: null;
}

// Akses baca: admin, guru pengampu, atau anggota kelas (saat $bolehAnggota true).
function akses_kelas(PDO $pdo, array $me, string $kelasId, bool $bolehAnggota = false): array {
  $k = cari_kelas($pdo, $kelasId);
  if (!$k) json_out(['error' => 'Kelas tidak ditemukan'], 404);
  if ($me['role'] === 'admin' || ($me['role'] === 'guru' && $k['guru_id'] === $me['id'])) return $k;
  if ($bolehAnggota && $me['role'] === 'siswa' && kelas_siswa($pdo, $me['id'], $kelasId)) return $k;
  json_out(['error' => 'Akses ditolak untuk kelas ini'], 403);
}

// Akses tulis: hanya admin atau guru pengampu.
function akses_kelas_tulis(PDO $pdo, array $me, string $kelasId): array {
  return akses_kelas($pdo, $me, $kelasId, false);
}

function kelas_siswa(PDO $pdo, string $userId, ?string $kelasId = null): array {
  $q = 'SELECT k.* FROM kelas k JOIN anggota_kelas a ON a.kelas_id=k.id WHERE a.user_id=?';
  $vals = [$userId];
  if ($kelasId) { $q .= ' AND k.id=?'; $vals[] = $kelasId; }
  $st = $pdo->prepare($q . ' ORDER BY k.nama');
  $st->execute($vals);
  return $st->fetchAll();
}

// Tambah anggota tanpa duplikasi; dipakai registrasi, halaman anggota, dan import.
function gabung_kelas(PDO $pdo, string $kelasId, string $userId): bool {
  $st = $pdo->prepare('SELECT id FROM anggota_kelas WHERE kelas_id=? AND user_id=?');
  $st->execute([$kelasId, $userId]);
  if ($st->fetch()) return false;
  $pdo->prepare('INSERT INTO anggota_kelas(id,kelas_id,user_id) VALUES(?,?,?)')
      ->execute([uuid4(), $kelasId, $userId]);
  return true;
}

function fmt_kelas(PDO $pdo, array $k): array {
  $st = $pdo->prepare("SELECT COUNT(*) FROM anggota_kelas a JOIN users u ON u.id=a.user_id
                        WHERE a.kelas_id=? AND u.role='siswa'");
  $st->execute([$k['id']]);
  $jumlahSiswa = (int)$st->fetchColumn();

  $st = $pdo->prepare('SELECT COUNT(*) FROM tugas WHERE kelas_id=?');
  $st->execute([$k['id']]);
  $jumlahTugas = (int)$st->fetchColumn();

  $st = $pdo->prepare("SELECT COUNT(*) FROM pengumpulan p JOIN tugas t ON t.id=p.tugas_id
                       WHERE t.kelas_id=? AND p.status='terkumpul'");
  $st->execute([$k['id']]);
  $perluDinilai = (int)$st->fetchColumn();

  $guru = null;
  if (!empty($k['guru_id'])) {
    $st = $pdo->prepare('SELECT nama FROM users WHERE id=?');
    $st->execute([$k['guru_id']]);
    $guru = $st->fetchColumn() ?: null;
  }
  return [
    'id' => $k['id'], 'nama' => $k['nama'], 'kode' => $k['kode'],
    'guru_id' => $k['guru_id'], 'guru_nama' => $guru, 'tingkat' => $k['tingkat'],
    'kompetensi' => $k['kompetensi'], 'tahun_ajaran' => $k['tahun_ajaran'],
    'deskripsi' => $k['deskripsi'], 'created_at' => $k['created_at'] ?? null,
    'jumlah_siswa' => $jumlahSiswa, 'jumlah_tugas' => $jumlahTugas,
    'perlu_dinilai' => $perluDinilai,
  ];
}

function daftar_kelas(PDO $pdo, array $me): array {
  if ($me['role'] === 'admin') {
    $rows = $pdo->query('SELECT * FROM kelas ORDER BY nama')->fetchAll();
  } elseif ($me['role'] === 'guru') {
    $st = $pdo->prepare('SELECT * FROM kelas WHERE guru_id=? ORDER BY nama');
    $st->execute([$me['id']]);
    $rows = $st->fetchAll();
  } else {
    $rows = kelas_siswa($pdo, $me['id']);
  }
  return array_map(fn($k) => fmt_kelas($pdo, $k), $rows);
}

// Target geometri sebuah tugas: override tugas > modul acuan > default.
function target_tugas(PDO $pdo, array $t): array {
  $baku = ['stock_d' => 40.0, 'stock_l' => 60.0, 'target_d' => 20.0, 'target_z' => 40.0];
  $dariTugas = json_cols($t, 'target_profil')['target_profil'];
  if (is_array($dariTugas) && $dariTugas) {
    return [
      'stock_d' => (float)($dariTugas['stock_d'] ?? $baku['stock_d']),
      'stock_l' => (float)($dariTugas['stock_l'] ?? $baku['stock_l']),
      'target_d' => (float)($dariTugas['target_d'] ?? $baku['target_d']),
      'target_z' => (float)($dariTugas['target_z'] ?? $baku['target_z']),
    ];
  }
  if (!empty($t['modul_id'])) {
    $st = $pdo->prepare('SELECT target_profil FROM modul_latihan WHERE id=?');
    $st->execute([$t['modul_id']]);
    $row = $st->fetch();
    if ($row) {
      $tp = json_decode($row['target_profil'], true) ?: [];
      return [
        'stock_d' => (float)($tp['stock_d'] ?? $baku['stock_d']),
        'stock_l' => (float)($tp['stock_l'] ?? $baku['stock_l']),
        'target_d' => (float)($tp['target_d'] ?? $baku['target_d']),
        'target_z' => (float)($tp['target_z'] ?? $baku['target_z']),
      ];
    }
  }
  return $baku;
}

function cari_tugas(PDO $pdo, string $id): ?array {
  $st = $pdo->prepare('SELECT * FROM tugas WHERE id=?');
  $st->execute([$id]);
  $t = $st->fetch();
  return $t ?: null;
}

function fmt_tugas(PDO $pdo, array $t): array {
  $st = $pdo->prepare("SELECT COUNT(*) FROM anggota_kelas a JOIN users u ON u.id=a.user_id
                        WHERE a.kelas_id=? AND u.role='siswa'");
  $st->execute([$t['kelas_id']]);
  $jumlahSiswa = (int)$st->fetchColumn();

  $st = $pdo->prepare('SELECT COUNT(*) FROM pengumpulan WHERE tugas_id=?');
  $st->execute([$t['id']]);
  $jumlahKumpul = (int)$st->fetchColumn();

  $st = $pdo->prepare("SELECT COUNT(*) FROM pengumpulan WHERE tugas_id=? AND status='dinilai'");
  $st->execute([$t['id']]);
  $jumlahDinilai = (int)$st->fetchColumn();

  $st = $pdo->prepare('SELECT AVG(' . nilai_akhir_sql('t.poin') . ') FROM pengumpulan p
                        JOIN tugas t ON t.id=p.tugas_id WHERE p.tugas_id=?');
  $st->execute([$t['id']]);
  $rata = $st->fetchColumn();

  $materiIds = json_cols($t, 'materi_ids')['materi_ids'] ?: [];
  $kelas = cari_kelas($pdo, $t['kelas_id']);
  $pembuat = $pdo->prepare('SELECT nama FROM users WHERE id=?');
  $pembuat->execute([$t['dibuat_oleh']]);

  return [
    'id' => $t['id'], 'kelas_id' => $t['kelas_id'], 'kelas_nama' => $kelas['nama'] ?? null,
    'judul' => $t['judul'], 'instruksi' => $t['instruksi'], 'jenis' => $t['jenis'],
    'status' => $t['status'], 'poin' => (int)$t['poin'], 'batas_lulus' => (int)$t['batas_lulus'],
    'tenggat' => $t['tenggat'], 'boleh_ulang' => (int)($t['boleh_ulang'] ?? 1) === 1,
    'modul_id' => $t['modul_id'], 'starter_gcode' => $t['starter_gcode'],
    'lkpd_url' => $t['lkpd_url'], 'materi_ids' => $materiIds,
    'target' => target_tugas($pdo, $t), 'soal' => null,
    'dibuat_oleh' => $t['dibuat_oleh'], 'dibuat_nama' => $pembuat->fetchColumn() ?: null,
    'created_at' => $t['created_at'] ?? null, 'updated_at' => $t['updated_at'] ?? null,
    'jumlah_siswa' => $jumlahSiswa, 'jumlah_kumpul' => $jumlahKumpul,
    'jumlah_dinilai' => $jumlahDinilai, 'skor_rata' => $rata === null ? null : (int)round((float)$rata),
  ];
}

// Nilai akhir pada skala 100. skor_simulasi sudah 0..100, nilai guru memakai
// skala poin tugas sehingga guru cukup mengetik angka yang ia berikan.
function nilai_akhir_sql(string $poinKolom = 'poin'): string {
  return "ROUND(COALESCE(p.nilai_guru * 100.0 / NULLIF($poinKolom, 0), p.skor_simulasi))";
}

function nilai_akhir(array $p, array $t): ?int {
  if (($p['nilai_guru'] ?? null) !== null && $p['nilai_guru'] !== '') {
    return (int)round(((float)$p['nilai_guru']) * 100 / max(1, (int)$t['poin']));
  }
  if (($p['skor_simulasi'] ?? null) === null || $p['skor_simulasi'] === '') return null;
  return (int)max(0, min(100, (int)round((float)$p['skor_simulasi'])));
}

function daftar_soal(PDO $pdo, string $tugasId, bool $untukGuru): array {
  $st = $pdo->prepare('SELECT * FROM soal WHERE tugas_id=? ORDER BY urutan, id');
  $st->execute([$tugasId]);
  $out = [];
  foreach ($st->fetchAll() as $s) {
    $c = json_cols($s, 'opsi', 'kunci', 'target_profil');
    $row = [
      'id' => $s['id'], 'tugas_id' => $s['tugas_id'], 'urutan' => (int)$s['urutan'],
      'tipe' => $s['tipe'], 'teks' => $s['teks'], 'opsi' => $c['opsi'],
      'poin' => (int)$s['poin'], 'target' => $c['target_profil'],
    ];
    if ($untukGuru) {
      $row['kunci'] = $c['kunci'];
      $row['pembahasan'] = $s['pembahasan'];
    }
    $out[] = $row;
  }
  return $out;
}

function fmt_pengumpulan(PDO $pdo, array $p): array {
  $siswa = $pdo->prepare('SELECT nama, nis FROM users WHERE id=?');
  $siswa->execute([$p['siswa_id']]);
  $s = $siswa->fetch() ?: ['nama' => null, 'nis' => null];
  $periksa = null;
  if (!empty($p['diperiksa_oleh'])) {
    $st = $pdo->prepare('SELECT nama FROM users WHERE id=?');
    $st->execute([$p['diperiksa_oleh']]);
    $periksa = $st->fetchColumn() ?: null;
  }
  $tugas = cari_tugas($pdo, $p['tugas_id']);
  return [
    'id' => $p['id'], 'tugas_id' => $p['tugas_id'], 'tugas_judul' => $tugas['judul'] ?? null,
    'siswa_id' => $p['siswa_id'], 'siswa_nama' => $s['nama'], 'nis' => $s['nis'],
    'gcode' => $p['gcode'], 'skor_simulasi' => $p['skor_simulasi'] === null ? null : (int)$p['skor_simulasi'],
    'ada_error' => (int)($p['ada_error'] ?? 0) === 1, 'nilai_guru' => $p['nilai_guru'] === null ? null : (int)$p['nilai_guru'],
    'nilai_akhir' => $tugas ? nilai_akhir($p, $tugas) : null,
    'catatan_guru' => $p['catatan_guru'], 'status' => $p['status'],
    'jumlah_percobaan' => (int)($p['jumlah_percobaan'] ?? 0),
    'waktu_submit' => $p['waktu_submit'], 'waktu_periksa' => $p['waktu_periksa'],
    'diperiksa_nama' => $periksa,
    'detail' => null,
  ];
}

// Simpan atau perbarui satu baris pengumpulan untuk (tugas, siswa).
function simpan_pengumpulan(PDO $pdo, array $t, string $siswaId, array $isi): array {
  $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE tugas_id=? AND siswa_id=?');
  $st->execute([$t['id'], $siswaId]);
  $lama = $st->fetch();
  if ($lama) {
    $pdo->prepare('UPDATE pengumpulan SET gcode=?, skor_simulasi=?, ada_error=?, detail=?, status=?, ' .
                  'jumlah_percobaan=jumlah_percobaan+1, waktu_submit=NOW() WHERE id=?')
        ->execute([$isi['gcode'] ?? null, $isi['skor_simulasi'] ?? null,
                   !empty($isi['ada_error']) ? 1 : 0, $isi['detail'] ?? null,
                   $isi['status'] ?? 'terkumpul', $lama['id']]);
    $id = $lama['id'];
  } else {
    $id = uuid4();
    $pdo->prepare('INSERT INTO pengumpulan(id,tugas_id,siswa_id,gcode,skor_simulasi,ada_error,detail,status,jumlah_percobaan,waktu_submit) ' .
                  'VALUES(?,?,?,?,?,?,?,?,1,NOW())')
        ->execute([$id, $t['id'], $siswaId, $isi['gcode'] ?? null, $isi['skor_simulasi'] ?? null,
                   !empty($isi['ada_error']) ? 1 : 0, $isi['detail'] ?? null,
                   $isi['status'] ?? 'terkumpul']);
  }
  $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE id=?');
  $st->execute([$id]);
  return $st->fetch();
}

function kirim_csv(string $namaFile, array $baris): void {
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $namaFile) . '.csv"');
  $keluar = fopen('php://output', 'w');
  fwrite($keluar, "\xEF\xBB\xBF"); // BOM agar Excel membaca UTF-8
  foreach ($baris as $b) fputcsv($keluar, $b);
  fclose($keluar);
  exit;
}

// Ringkasan nilai seorang siswa pada satu tugas, untuk daftar tugas siswa.
function punya_saya(PDO $pdo, string $tugasId, string $siswaId): ?array {
  $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE tugas_id=? AND siswa_id=?');
  $st->execute([$tugasId, $siswaId]);
  $p = $st->fetch();
  if (!$p) return null;
  return [
    'id' => $p['id'], 'status' => $p['status'], 'skor_simulasi' => $p['skor_simulasi'] === null ? null : (int)$p['skor_simulasi'],
    'nilai_guru' => $p['nilai_guru'] === null ? null : (int)$p['nilai_guru'],
    'catatan_guru' => $p['catatan_guru'], 'jumlah_percobaan' => (int)$p['jumlah_percobaan'],
    'waktu_submit' => $p['waktu_submit'],
  ];
}

// =============================================================
// Pembuatan akun (dipakai register, CRUD pengguna, dan import anggota)
// =============================================================
function sandi_sementara(int $n = 12): string {
  $huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  $angka = '23456789';
  $s = substr(str_shuffle($huruf), 0, 2) . $angka[random_int(0, 7)];
  $campuran = $huruf . $angka;
  for ($i = strlen($s); $i < $n; $i++) $s .= $campuran[random_int(0, strlen($campuran) - 1)];
  return substr(str_shuffle($s), 0, $n);
}

// Validasi + simpan satu akun. $isi['password'] boleh kosong: dibuat acak
// dan dikembalikan lewat 'password' supaya guru/admin bisa menyampaikannya.
function buat_user(PDO $pdo, array $isi): array {
  $nama = trim((string)($isi['nama'] ?? ''));
  $email = strtolower(trim((string)($isi['email'] ?? '')));
  $role = $isi['role'] ?? 'siswa';
  $nis = trim((string)($isi['nis'] ?? '')) ?: null;
  $username = strtolower(trim((string)($isi['username'] ?? ''))) ?: null;
  $kelas = potong_teks($isi['kelas'] ?? null);
  $sandi = (string)($isi['password'] ?? '');
  $acak = false;
  if ($nama === '') json_out(['error' => 'Nama wajib diisi'], 400);
  if (mb_strlen($nama) > 100) json_out(['error' => 'Nama maksimal 100 karakter'], 400);
  if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['error' => "Email tidak valid: " . ($email ?: '(kosong)')], 400);
  if (strlen($email) > 100) json_out(['error' => 'Email maksimal 100 karakter'], 400);
  if (!in_array($role, ['admin', 'guru', 'siswa'], true)) json_out(['error' => 'Peran harus admin/guru/siswa'], 400);
  if ($sandi === '') { $sandi = sandi_sementara(); $acak = true; }
  if (strlen($sandi) < 6) json_out(['error' => 'Password minimal 6 karakter'], 400);

  $st = $pdo->prepare('SELECT id FROM users WHERE email=?');
  $st->execute([$email]);
  if ($st->fetch()) json_out(['error' => "Email $email sudah terdaftar"], 400);
  if ($username) {
    $st = $pdo->prepare('SELECT id FROM users WHERE username=?');
    $st->execute([$username]);
    if ($st->fetch()) json_out(['error' => "Username $username sudah dipakai"], 400);
  }
  $id = uuid4();
  $pdo->prepare('INSERT INTO users(id,username,nis,nama,email,password_hash,role,kelas,status)
                 VALUES(?,?,?,?,?,?,?,?,?)')
      ->execute([$id, $username, $nis, $nama, $email, password_hash($sandi, PASSWORD_DEFAULT), $role, $kelas, 'aktif']);
  $st = $pdo->prepare('SELECT * FROM users WHERE id=?');
  $st->execute([$id]);
  return ['user' => pub_user($st->fetch()), 'password' => $acak ? $sandi : null];
}

// Pecah teks import baris demi baris: "NIS;Nama;Email" (pemisah ; , atau tab).
function baca_daftar_siswa(string $teks, ?string $pemisah = null): array {
  if (!$pemisah || !str_contains(";,\t", $pemisah)) {
    $pemisah = str_contains($teks, ';') ? ';' : (str_contains($teks, "\t") ? "\t" : ',');
  }
  $out = [];
  foreach (preg_split('/\r?\n/', $teks) as $ln) {
    $ln = trim($ln);
    if ($ln === '') continue;
    $bagian = array_map('trim', explode($pemisah, $ln));
    $nis = $bagian[0] ?? '';
    $nama = $bagian[1] ?? '';
    $email = $bagian[2] ?? '';
    if ($nis === '' || $nama === '') continue;
    if ($email === '') $email = $nis . '@sekolah.id';
    $out[] = ['nis' => $nis, 'nama' => $nama, 'email' => strtolower($email)];
  }
  return $out;
}

// =============================================================
// Unggah berkas (LKPD modul/materi) dengan pemeriksaan batas hosting
// =============================================================
function cek_post_kebesaran(): void {
  if (!str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data')) return;
  $panjang = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
  $batas = bytes_limit('post_max_size');
  if ($panjang && $batas && $panjang > $batas) {
    json_out(['error' => 'Berkas melebihi batas post_max_size hosting (' . ini_get('post_max_size') .
      '). Naikkan lewat cPanel > Select PHP Version > Options.'], 413);
  }
}

// Kembalikan path publik ('/uploads/xxx') atau null bila tidak ada berkas.
function simpan_unggah(string $field, string $label, int $maksMB = 20): ?string {
  $err = $_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE;
  if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
    json_out(['error' => "Berkas $label melebihi batas upload_max_filesize hosting (" . ini_get('upload_max_filesize') . ').'], 413);
  }
  if ($err === UPLOAD_ERR_NO_FILE) return null;
  if ($err !== UPLOAD_ERR_OK) json_out(['error' => "Upload $label gagal (kode error $err)."], 400);
  if (($_FILES[$field]['size'] ?? 0) > $maksMB * 1024 * 1024) {
    json_out(['error' => "$label maksimal $maksMB MB"], 400);
  }
  $dir = __DIR__ . '/../uploads';
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  if (!is_writable($dir)) {
    json_out(['error' => 'Folder api/uploads tidak dapat ditulisi PHP. Set izinnya ke 755 (atau 775) dengan pemilik akun cPanel Anda.'], 500);
  }
  $namaAsli = $_FILES[$field]['name'] ?? 'berkas';
  $ekstensi = strtolower(pathinfo($namaAsli, PATHINFO_EXTENSION));
  if (!in_array($ekstensi, ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'docx'], true)) {
    json_out(['error' => "Format $label tidak didukung. Gunakan PDF, gambar, DOCX, atau MP4."], 400);
  }
  $fn = time() . '-' . preg_replace('/[^A-Za-z0-9._-]/', '_', $namaAsli);
  if (!move_uploaded_file($_FILES[$field]['tmp_name'], $dir . '/' . $fn)) {
    json_out(['error' => "Gagal menyimpan $label. Cek permission folder api/uploads dan sisa kuota hosting."], 500);
  }
  return '/uploads/' . $fn;
}

// =============================================================
// Modul latihan + mesin simulasi
// =============================================================
function fmt_modul(PDO $pdo, array $m): array {
  $tp = json_decode((string)($m['target_profil'] ?? '{}'), true) ?: [];
  $jumlahTugas = null;
  if (isset($m['jumlah_tugas'])) $jumlahTugas = (int)$m['jumlah_tugas'];
  else {
    $st = $pdo->prepare('SELECT COUNT(*) FROM tugas WHERE modul_id=?');
    $st->execute([$m['id']]);
    $jumlahTugas = (int)$st->fetchColumn();
  }
  $st = $pdo->prepare('SELECT nama FROM users WHERE id=?');
  $st->execute([$m['dibuat_oleh']]);
  return ['id' => $m['id'], 'judul' => $m['judul'], 'level' => (int)$m['level'],
    'deskripsi' => $m['deskripsi'], 'dibuat_oleh' => $m['dibuat_oleh'],
    'dibuat_nama' => $st->fetchColumn() ?: null,
    'target' => ['stock_d' => (float)($tp['stock_d'] ?? 40), 'stock_l' => (float)($tp['stock_l'] ?? 60),
                 'target_d' => (float)($tp['target_d'] ?? 20), 'target_z' => (float)($tp['target_z'] ?? 40)],
    'starter_gcode' => $m['starter_gcode'], 'lkpd_url' => $m['lkpd_url'],
    'created_at' => $m['created_at'] ?? null, 'jumlah_tugas' => $jumlahTugas];
}

function get_modul(PDO $pdo, string $id): ?array {
  $st = $pdo->prepare('SELECT * FROM modul_latihan WHERE id=?');
  $st->execute([$id]);
  $m = $st->fetch();
  return $m ? fmt_modul($pdo, $m) : null;
}

function all_modul(PDO $pdo): array {
  $rows = $pdo->query('SELECT m.*, (SELECT COUNT(*) FROM tugas t WHERE t.modul_id=m.id) AS jumlah_tugas
                       FROM modul_latihan m ORDER BY m.level ASC, m.judul ASC')->fetchAll();
  return array_map(fn($m) => fmt_modul($pdo, $m), $rows);
}

function run_sim(string $gcode, array $target): array {
  $ins = GCode::parse($gcode);
  $sim = GCode::simulate($ins, $target['stock_d'], $target['stock_l']);
  $cmp = GCode::compare($sim['profile'], $sim['resolution'], $target['target_d'], $target['target_z'], $target['stock_l']);
  $sc = GCode::score($sim['events'], $cmp);
  return [$sim, $cmp, $sc];
}

function target_baku(): array {
  return ['stock_d' => 40.0, 'stock_l' => 60.0, 'target_d' => 20.0, 'target_z' => 40.0];
}// Normalisasi target dari body request, mengisi missing dengan pembanding.
function target_dari_body(array $body, ?array $dasar = null): array {
  $ambil = fn($k) => (float)($body[$k] ?? ($body['target'][$k] ?? ($dasar[$k] ?? target_baku()[$k])));
  return ['stock_d' => $ambil('stock_d'), 'stock_l' => $ambil('stock_l'),
          'target_d' => $ambil('target_d'), 'target_z' => $ambil('target_z')];
}

// =============================================================
// Tugas & soal
// =============================================================
function isi_tenggat($v): ?string {
  $v = trim((string)$v);
  if ($v === '') return null;
  if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return $v . ' 23:59:59';
  return substr(preg_replace('/T/', ' ', $v), 0, 19);
}

function dengan_soal(PDO $pdo, array $t, bool $untukGuru): array {
  $out = fmt_tugas($pdo, $t);
  if ($out['jenis'] === 'kuis') $out['soal'] = daftar_soal($pdo, $t['id'], $untukGuru);
  return $out;
}

// Bentuk tugas untuk siswa: tanpa kunci soal, dengan ringkasan pengumpulan diri.
function fmt_tugas_siswa(PDO $pdo, array $t, string $siswaId): array {
  $out = fmt_tugas($pdo, $t);
  $out['punya_saya'] = punya_saya($pdo, $t['id'], $siswaId);
  if ($out['jenis'] === 'kuis') $out['soal'] = daftar_soal($pdo, $t['id'], false);
  return $out;
}

// Tugas terbit pada kelas siswa, disertai status pengumpulan dirinya.
function daftar_tugas_siswa(PDO $pdo, array $me): array {
  $kelas = array_map(fn($k) => $k['id'], kelas_siswa($pdo, $me['id']));
  if (!$kelas) return [];
  $st = $pdo->prepare("SELECT * FROM tugas WHERE kelas_id IN (" . implode(',', array_fill(0, count($kelas), '?')) . ")
                       AND status='terbit' ORDER BY tenggat IS NULL, tenggat ASC, created_at DESC");
  $st->execute($kelas);
  return array_map(fn($t) => fmt_tugas_siswa($pdo, $t, $me['id']), $st->fetchAll());
}

// Ganti seluruh daftar soal sebuah tugas dengan isi baru dari request.
function simpan_soal(PDO $pdo, string $tugasId, array $soal): void {
  $st = $pdo->prepare('INSERT INTO soal(id,tugas_id,urutan,tipe,teks,opsi,kunci,pembahasan,poin,target_profil)
                       VALUES(?,?,?,?,?,?,?,?,?,?)');
  $i = 0;
  foreach ($soal as $s) {
    if (!is_array($s)) continue;
    $tipe = in_array($s['tipe'] ?? '', ['pg', 'benar_salah', 'isian', 'praktik'], true) ? $s['tipe'] : 'pg';
    $teks = trim((string)($s['teks'] ?? ''));
    if ($teks === '') continue;
    $i++;
    $opsi = $tipe === 'benar_salah' ? ['Benar', 'Salah'] : array_values((array)($s['opsi'] ?? []));
    $kunci = normalisasi_kunci($tipe, $s['kunci'] ?? null, $opsi);
    $st->execute([uuid4(), $tugasId, $i, $tipe, $teks,
                  $opsi ? json_encode(array_map('strval', $opsi), JSON_UNESCAPED_UNICODE) : null,
                  $kunci === null ? null : json_encode($kunci, JSON_UNESCAPED_UNICODE),
                  $s['pembahasan'] ?? null,
                  max(1, (int)($s['poin'] ?? 10)),
                  $tipe === 'praktik' ? json_encode(target_dari_body((array)($s['target'] ?? []))) : null]);
  }
  if ($i === 0) json_out(['error' => 'Kuis harus punya minimal satu soal dengan teks terisi'], 400);
}

function normalisasi_kunci(string $tipe, $kunci, array $opsi) {
  if ($tipe === 'praktik') return null;
  if ($tipe === 'benar_salah') {
    if (is_bool($kunci)) return $kunci;
    if (is_string($kunci)) return in_array(strtolower($kunci), ['true', '1', 'benar', 'ya'], true);
    return (bool)$kunci;
  }
  if ($tipe === 'isian') {
    $daftar = is_array($kunci) ? $kunci : [(string)$kunci];
    $daftar = array_values(array_filter(array_map(fn($v) => trim((string)$v), $daftar), fn($v) => $v !== ''));
    return $daftar ?: null;
  }
  $idx = (is_string($kunci) && $kunci !== '' && !is_numeric($kunci)) ? array_search($kunci, $opsi, true) : (int)$kunci;
  if ($idx === false) $idx = 0;
  if ($opsi) $idx = max(0, min(count($opsi) - 1, (int)$idx));
  return $idx;
}
