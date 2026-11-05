<?php
// =============================================================
// routes/attempts.php — riwayat simulasi (percobaan) + skor otomatis.
// Bentuk respons lama dipertahankan, tugas_id ditambahkan (docs §8).
// =============================================================

function r_attempts(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  if ($route !== 'attempts') return;
  $me = auth($pdo);

  if ($method === 'POST') {
    $gcode = (string)($body['gcode'] ?? '');
    if (trim($gcode) === '') json_out(['error' => 'gcode wajib'], 400);
    $modul = !empty($body['modul_id']) ? get_modul($pdo, $body['modul_id']) : null;
    if (!empty($body['modul_id']) && !$modul) json_out(['error' => 'Modul tidak ditemukan'], 404);
    $tugas = null;
    if (!empty($body['tugas_id'])) {
      $tugas = cari_tugas($pdo, $body['tugas_id']);
      if (!$tugas) json_out(['error' => 'Tugas tidak ditemukan'], 404);
    }
    $target = $tugas ? target_tugas($pdo, $tugas)
      : ($modul ? $modul['target'] : target_baku());
    [$sim, $cmp, $sc] = run_sim($gcode, $target);
    $aid = uuid4();
    $pdo->prepare('INSERT INTO percobaan(id,user_id,modul_id,tugas_id,gcode_input,skor,ada_error,detail)
                   VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$aid, $me['id'], $modul['id'] ?? null, $tugas['id'] ?? null, $gcode, $sc['skor'],
                   $sc['ada_error'] ? 1 : 0,
                   json_encode(['events' => $sim['events'], 'compare' => $cmp, 'target' => $target], JSON_UNESCAPED_UNICODE)]);
    json_out(['id' => $aid, 'skor' => $sc['skor'], 'ada_error' => $sc['ada_error'],
              'events' => $sim['events'], 'compare' => $cmp, 'match' => $cmp['match'], 'target' => $target]);
  }

  if ($method === 'GET') {
    $q = 'SELECT p.*, u.nama AS siswa, t.judul AS tugasjudul
          FROM percobaan p JOIN users u ON u.id=p.user_id
          LEFT JOIN tugas t ON t.id=p.tugas_id WHERE 1=1';
    $vals = [];
    if ($me['role'] === 'siswa') { $q .= ' AND p.user_id=?'; $vals[] = $me['id']; }
    elseif (!empty($_GET['user_id'])) { $q .= ' AND p.user_id=?'; $vals[] = $_GET['user_id']; }
    if (!empty($_GET['modul_id'])) { $q .= ' AND p.modul_id=?'; $vals[] = $_GET['modul_id']; }
    if (!empty($_GET['tugas_id'])) { $q .= ' AND p.tugas_id=?'; $vals[] = $_GET['tugas_id']; }
    if (!empty($_GET['kelas_id'])) {
      $q .= ' AND p.user_id IN (SELECT user_id FROM anggota_kelas WHERE kelas_id=?)';
      $vals[] = $_GET['kelas_id'];
    }
    $q .= ' ORDER BY p.waktu_selesai DESC LIMIT 500';
    $st = $pdo->prepare($q);
    $st->execute($vals);
    json_out($st->fetchAll());
  }
}
