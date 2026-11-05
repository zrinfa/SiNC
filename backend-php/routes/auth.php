<?php
// =============================================================
// routes/auth.php — login, registrasi mandiri siswa, profil sendiri.
// Bentuk respons mengikuti docs/API-LMS.md §1.
// =============================================================

function r_auth(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {

  if ($route === 'login' && $method === 'POST') {
    $st = $pdo->prepare('SELECT * FROM users WHERE email=?');
    $st->execute([strtolower(trim((string)($body['email'] ?? '')))]);
    $u = $st->fetch();
    if (!$u || !password_verify($body['password'] ?? '', $u['password_hash'])) {
      json_out(['error' => 'Email/password salah'], 401);
    }
    if (($u['status'] ?? 'aktif') !== 'aktif') json_out(['error' => 'Akun dinonaktifkan, hubungi administrator'], 403);
    $pdo->prepare('UPDATE users SET last_login=NOW() WHERE id=?')->execute([$u['id']]);
    $token = jwt_sign(['id' => $u['id'], 'nama' => $u['nama'], 'email' => $u['email'], 'role' => $u['role']]);
    json_out(['token' => $token, 'user' => pub_user($u)]);
  }

  if ($route === 'register' && $method === 'POST') {
    $buat = buat_user($pdo, [
      'nama' => $body['nama'] ?? '', 'email' => $body['email'] ?? '',
      'password' => $body['password'] ?? '', 'role' => 'siswa',
      'nis' => $body['nis'] ?? null, 'kelas' => $body['kelas'] ?? null,
    ]);
    $user = $buat['user'];
    $kode = strtoupper(trim((string)($body['kode'] ?? '')));
    if ($kode !== '') {
      $st = $pdo->prepare('SELECT * FROM kelas WHERE kode=?');
      $st->execute([$kode]);
      $k = $st->fetch();
      if (!$k) json_out(['error' => 'Kode kelas tidak dikenali'], 400);
      gabung_kelas($pdo, $k['id'], $user['id']);
      $pdo->prepare('UPDATE users SET kelas=? WHERE id=?')->execute([potong_teks($k['nama']), $user['id']]);
      $user['kelas'] = $k['nama'];
    }
    $token = jwt_sign(['id' => $user['id'], 'nama' => $user['nama'], 'email' => $user['email'], 'role' => $user['role']]);
    json_out(['token' => $token, 'user' => $user]);
  }

  if ($route === 'logout') json_out(['ok' => true]);

  if ($route === 'me') {
    $me = auth($pdo);
    if ($method === 'GET' && !$id) json_out($me);

    if ($method === 'PUT' && $id === 'password') {
      $st = $pdo->prepare('SELECT password_hash FROM users WHERE id=?');
      $st->execute([$me['id']]);
      $hash = $st->fetchColumn();
      if (!password_verify((string)($body['password_lama'] ?? ''), (string)$hash)) {
        json_out(['error' => 'Password lama tidak sesuai'], 400);
      }
      $baru = (string)($body['password_baru'] ?? '');
      if (strlen($baru) < 6) json_out(['error' => 'Password baru minimal 6 karakter'], 400);
      $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')
          ->execute([password_hash($baru, PASSWORD_DEFAULT), $me['id']]);
      json_out(['ok' => true]);
    }

    if ($method === 'PUT') {
      $sets = []; $vals = [];
      if (array_key_exists('nama', $body)) {
        $nama = trim((string)$body['nama']);
        if ($nama === '') json_out(['error' => 'Nama tidak boleh kosong'], 400);
        $sets[] = 'nama=?'; $vals[] = $nama;
      }
      if (array_key_exists('kelas', $body)) { $sets[] = 'kelas=?'; $vals[] = potong_teks($body['kelas']); }
      if ($sets) {
        $vals[] = $me['id'];
        $pdo->prepare('UPDATE users SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals);
      }
      json_out(auth($pdo));
    }

    if ($method === 'POST' && $id === 'logout') json_out(['ok' => true]);
  }
}
