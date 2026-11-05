<?php
// =============================================================
// routes/modul.php — pustaka modul latihan G-Code (docs/API-LMS.md §5).
// Bentuk respons dipertahankan seperti API lama, jumlah_tugas ditambahkan.
// =============================================================

function r_modul(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  $maju = ($route === 'modules' || $route === 'module');
  if (!$maju) return;

  if ($method === 'GET') {
    auth($pdo);
    if ($id) {
      $m = get_modul($pdo, $id);
      if (!$m) json_out(['error' => 'Modul tidak ditemukan'], 404);
      json_out($m);
    }
    json_out(all_modul($pdo));
  }

  $me = auth($pdo);
  require_role($me, 'admin', 'guru');
  cek_post_kebesaran();

  if ($method === 'POST') {
    $judul = trim((string)($body['judul'] ?? ''));
    if (!$judul) json_out(['error' => 'Judul wajib'], 400);
    $lkpdUrl = trim((string)($body['lkpd_url'] ?? '')) ?: null;
    $terunggah = simpan_unggah('lkpd', 'LKPD');
    if ($terunggah) $lkpdUrl = $terunggah;
    $mid = uuid4();
    $pdo->prepare('INSERT INTO modul_latihan(id,dibuat_oleh,judul,level,deskripsi,target_profil,starter_gcode,lkpd_url)
                   VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$mid, $me['id'], $judul, (int)($body['level'] ?? 1), $body['deskripsi'] ?? null,
                   json_encode(target_dari_body($body)), $body['starter_gcode'] ?? null, $lkpdUrl]);
    json_out(get_modul($pdo, $mid), 201);
  }

  if ($method === 'PUT' && $id) {
    $st = $pdo->prepare('SELECT * FROM modul_latihan WHERE id=?');
    $st->execute([$id]);
    $lama = $st->fetch();
    if (!$lama) json_out(['error' => 'Modul tidak ditemukan'], 404);
    $sets = []; $vals = [];
    foreach (['judul' => 'judul', 'level' => 'level', 'deskripsi' => 'deskripsi',
              'starter_gcode' => 'starter_gcode', 'lkpd_url' => 'lkpd_url'] as $k => $col) {
      if (array_key_exists($k, $body)) { $sets[] = "$col=?"; $vals[] = $body[$k]; }
    }
    if (isset($body['target']) || isset($body['stock_d'])) {
      $sets[] = 'target_profil=?';
      $vals[] = json_encode(target_dari_body($body, fmt_modul($pdo, $lama)['target']));
    }
    $terunggah = simpan_unggah('lkpd', 'LKPD');
    if ($terunggah) { $sets[] = 'lkpd_url=?'; $vals[] = $terunggah; }
    if ($sets) { $vals[] = $id; $pdo->prepare('UPDATE modul_latihan SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals); }
    json_out(get_modul($pdo, $id));
  }

  if ($method === 'DELETE' && $id) {
    $pdo->prepare('DELETE FROM modul_latihan WHERE id=?')->execute([$id]);
    json_out(['ok' => true]);
  }
}
