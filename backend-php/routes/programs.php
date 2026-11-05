<?php
// =============================================================
// routes/programs.php — manajer program no-O siswa/guru (docs §8).
// Perilaku tidak berubah dari API sebelumnya.
// =============================================================

function r_programs(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  if ($route !== 'programs') return;
  $me = auth($pdo);

  if ($method === 'GET') {
    $st = $pdo->prepare('SELECT * FROM program_tersimpan WHERE user_id=? ORDER BY disimpan_pada DESC');
    $st->execute([$me['id']]);
    json_out($st->fetchAll());
  }

  if ($method === 'POST') {
    if (!trim((string)($body['nama'] ?? '')) || !trim((string)($body['gcode'] ?? ''))) {
      json_out(['error' => 'Nama & gcode wajib'], 400);
    }
    $pid = uuid4();
    $pdo->prepare('INSERT INTO program_tersimpan(id,user_id,nama,gcode,stock_diameter,stock_panjang,target_diameter,target_panjang)
                   VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$pid, $me['id'], trim((string)$body['nama']), $body['gcode'],
                   (float)($body['stock_diameter'] ?? 40), (float)($body['stock_panjang'] ?? 60),
                   (float)($body['target_diameter'] ?? 20), (float)($body['target_panjang'] ?? 40)]);
    $st = $pdo->prepare('SELECT * FROM program_tersimpan WHERE id=?');
    $st->execute([$pid]);
    json_out($st->fetch(), 201);
  }

  if ($id && in_array($method, ['PUT', 'DELETE'], true)) {
    $st = $pdo->prepare('SELECT * FROM program_tersimpan WHERE id=? AND user_id=?');
    $st->execute([$id, $me['id']]);
    if (!$st->fetch()) json_out(['error' => 'Program tidak ditemukan'], 404);
    if ($method === 'DELETE') {
      $pdo->prepare('DELETE FROM program_tersimpan WHERE id=?')->execute([$id]);
      json_out(['ok' => true]);
    }
    $sets = []; $vals = [];
    foreach (['nama' => 'nama', 'gcode' => 'gcode', 'stock_diameter' => 'stock_diameter',
              'stock_panjang' => 'stock_panjang', 'target_diameter' => 'target_diameter',
              'target_panjang' => 'target_panjang'] as $k => $col) {
      if (array_key_exists($k, $body)) { $sets[] = "$col=?"; $vals[] = $body[$k]; }
    }
    if ($sets) { $vals[] = $id; $pdo->prepare('UPDATE program_tersimpan SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals); }
    $st = $pdo->prepare('SELECT * FROM program_tersimpan WHERE id=?');
    $st->execute([$id]);
    json_out($st->fetch());
  }
}
