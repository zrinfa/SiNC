<?php
// =============================================================
// routes/users.php — manajemen akun oleh admin (docs/API-LMS.md §2).
// Guru hanya boleh membaca daftar siswa, dipakai saat memilih anggota kelas.
// =============================================================

function r_users(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  if ($route !== 'users') return;
  $me = auth($pdo);
  $admin = $me['role'] === 'admin';

  if ($method === 'GET' && !$id) {
    if (!$admin) require_role($me, 'guru');
    $q = 'SELECT * FROM users WHERE 1=1'; $vals = [];
    if (!empty($_GET['role'])) {
      if (!$admin && $_GET['role'] !== 'siswa') json_out(['error' => 'Guru hanya dapat melihat daftar siswa'], 403);
      $q .= ' AND role=?'; $vals[] = $_GET['role'];
    } elseif ($admin === false) {
      $q .= " AND role='siswa'";
    }
    if (!empty($_GET['status'])) { $q .= ' AND status=?'; $vals[] = $_GET['status']; }
    if (!empty($_GET['q'])) {
      $cari = '%' . str_replace(['%', '_'], ['\%', '\_'], trim((string)$_GET['q'])) . '%';
      $q .= ' AND (nama LIKE ? OR email LIKE ? OR nis LIKE ? OR username LIKE ?)';
      array_push($vals, $cari, $cari, $cari, $cari);
    }
    $kelasId = !empty($_GET['kelas_id']) ? $_GET['kelas_id'] : null;
    if ($kelasId) {
      $q .= ' AND id IN (SELECT user_id FROM anggota_kelas WHERE kelas_id=?)';
      $vals[] = $kelasId;
    } elseif (!$admin && !empty($_GET['bukan_di_kelas']) && $me['role'] === 'guru') {
      akses_kelas($pdo, $me, $_GET['bukan_di_kelas'], false);
      $q .= ' AND id NOT IN (SELECT user_id FROM anggota_kelas WHERE kelas_id=?)';
      $vals[] = $_GET['bukan_di_kelas'];
    }
    if (!empty($_GET['limit'])) $q .= ' LIMIT ' . (int)$_GET['limit'];
    $st = $pdo->prepare($q . ' ORDER BY nama');
    $st->execute($vals);
    json_out(array_map('pub_user', $st->fetchAll()));
  }

  if (!$admin) json_out(['error' => 'Hanya administrator yang dapat mengelola akun'], 403);

  if ($method === 'POST' && $id === 'bulk') {
    $role = $body['role'] ?? 'siswa';
    if (!in_array($role, ['guru', 'siswa'], true)) json_out(['error' => 'Peran harus guru/siswa'], 400);
    $pemisah = $body['pisahkan'] ?? null;
    $sandi = trim((string)($body['password_sementara'] ?? '')) ?: sandi_sementara();
    $baris = $role === 'guru' ? baca_daftar_guru((string)($body['teks'] ?? ''), $pemisah)
                              : baca_daftar_siswa((string)($body['teks'] ?? ''), $pemisah);
    if (!$baris) json_out(['error' => 'Tidak ada baris yang terbaca. Gunakan satu baris per orang: NIS;Nama;Email'], 400);
    $dibuat = []; $lewat = 0;
    foreach ($baris as $b) {
      $st = $pdo->prepare('SELECT id FROM users WHERE email=? OR (nis<>"" AND nis=?)');
      $st->execute([strtolower($b['email']), $b['nis'] ?? '']);
      if ($st->fetch()) { $lewat++; continue; }
      $isi = ['nama' => $b['nama'], 'email' => $b['email'], 'role' => $role, 'password' => $sandi];
      if ($role === 'siswa') $isi += ['nis' => $b['nis'], 'kelas' => $body['kelas'] ?? null];
      $dibuat[] = buat_user($pdo, $isi)['user'];
    }
    json_out(['dibuat' => $dibuat, 'lewat' => $lewat, 'password_sementara' => $sandi]);
  }

  if ($method === 'POST' && !$id) {
    $hasil = buat_user($pdo, $body);
    $out = $hasil['user'];
    if ($hasil['password']) $out['password_sementara'] = $hasil['password'];
    json_out($out, 201);
  }

  if ($method === 'POST' && $id && ($seg[3] ?? '') === 'reset-password') {
    $st = $pdo->prepare('SELECT id FROM users WHERE id=?');
    $st->execute([$id]);
    if (!$st->fetch()) json_out(['error' => 'Pengguna tidak ditemukan'], 404);
    $sandi = sandi_sementara();
    $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')
        ->execute([password_hash($sandi, PASSWORD_DEFAULT), $id]);
    json_out(['password_sementara' => $sandi]);
  }

  if ($method === 'PUT' && $id) {
    $st = $pdo->prepare('SELECT * FROM users WHERE id=?');
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u) json_out(['error' => 'Pengguna tidak ditemukan'], 404);
    $sets = []; $vals = [];
    $ambil = function ($key, ?string $kolom = null, callable $saring = null) use (&$sets, &$vals, $body, $u, $id, $pdo) {
      if (!array_key_exists($key, $body)) return;
      $kolom ??= $key;
      $v = $saring ? $saring($body[$key]) : trim((string)$body[$key]);
      if ($v === '' && in_array($kolom, ['email', 'nama'], true)) json_out(['error' => ucfirst($key) . ' tidak boleh kosong'], 400);
      if (in_array($kolom, ['email', 'username'], true) && $v !== '') {
        $st = $pdo->prepare("SELECT id FROM users WHERE $kolom=? AND id<>?");
        $st->execute([$v, $id]);
        if ($st->fetch()) json_out(['error' => "$kolom sudah dipakai akun lain"], 400);
      }
      $sets[] = "$kolom=?"; $vals[] = ($v === '' ? null : $v);
    };
    $ambil('nama');
    $ambil('email', null, fn($v) => strtolower(trim((string)$v)));
    $ambil('nis');
    $ambil('username', null, fn($v) => strtolower(trim((string)$v)));
    $ambil('kelas', null, fn($v) => potong_teks((string)$v));
    if (array_key_exists('role', $body)) {
      $roleBaru = (string)$body['role'];
      if (!in_array($roleBaru, ['admin', 'guru', 'siswa'], true)) json_out(['error' => 'Peran tidak dikenal'], 400);
      if ($roleBaru !== 'admin' && $u['role'] === 'admin'
          && (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn() <= 1) {
        json_out(['error' => 'Administrator terakhir tidak boleh diturunkan peran'], 400);
      }
      $sets[] = 'role=?'; $vals[] = $roleBaru;
    }
    if (array_key_exists('status', $body)) {
      $status = $body['status'] === 'nonaktif' ? 'nonaktif' : 'aktif';
      if ($id === $me['id'] && $status === 'nonaktif') json_out(['error' => 'Tidak dapat menonaktifkan akun sendiri'], 400);
      $sets[] = 'status=?'; $vals[] = $status;
    }
    if (array_key_exists('password', $body) && trim((string)$body['password']) !== '') {
      if (strlen((string)$body['password']) < 6) json_out(['error' => 'Password minimal 6 karakter'], 400);
      $sets[] = 'password_hash=?'; $vals[] = password_hash((string)$body['password'], PASSWORD_DEFAULT);
    }
    if ($sets) {
      $vals[] = $id;
      $pdo->prepare('UPDATE users SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals);
    }
    $st = $pdo->prepare('SELECT * FROM users WHERE id=?');
    $st->execute([$id]);
    json_out(pub_user($st->fetch()));
  }

  if ($method === 'DELETE' && $id) {
    if ($id === $me['id']) json_out(['error' => 'Tidak dapat menghapus akun sendiri'], 400);
    $st = $pdo->prepare('SELECT COUNT(*) FROM kelas WHERE guru_id=?');
    $st->execute([$id]);
    if ((int)$st->fetchColumn() > 0) json_out(['error' => 'Masih mengampu kelas. Pindahkan atau hapus kelasnya lebih dulu.'], 400);
    $st = $pdo->prepare('SELECT COUNT(*) FROM modul_latihan WHERE dibuat_oleh=?');
    $st->execute([$id]);
    if ((int)$st->fetchColumn() > 0) json_out(['error' => 'Masih memiliki modul latihan. Hapus modulnya lebih dulu.'], 400);
    $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$id]);
    json_out(['ok' => true]);
  }
}

// Baris import guru: "Nama;Email".
function baca_daftar_guru(string $teks, ?string $pemisah = null): array {
  if (!$pemisah || !str_contains(";,\t", $pemisah)) {
    $pemisah = str_contains($teks, ';') ? ';' : (str_contains($teks, "\t") ? "\t" : ',');
  }
  $out = [];
  foreach (preg_split('/\r?\n/', $teks) as $ln) {
    $ln = trim($ln);
    if ($ln === '') continue;
    $b = array_map('trim', explode($pemisah, $ln));
    if (empty($b[0]) || empty($b[1])) continue;
    $out[] = ['nama' => $b[0], 'email' => strtolower($b[1])];
  }
  return $out;
}
