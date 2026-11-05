<?php
// =============================================================
// routes/materi.php — materi kelas (pdf/video/tautan/teks) berikut
// unggah berkas. docs/API-LMS.md §4.
// =============================================================

function r_materi(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  if ($route !== 'materi') return;
  $me = auth($pdo);

  if ($method === 'GET') {
    $kelasId = (string)($_GET['kelas_id'] ?? '');
    if ($kelasId === '') json_out(['error' => 'Parameter kelas_id wajib'], 400);
    akses_kelas($pdo, $me, $kelasId, $me['role'] === 'siswa');
    $st = $pdo->prepare('SELECT * FROM materi WHERE kelas_id=? ORDER BY urutan, created_at');
    $st->execute([$kelasId]);
    json_out(array_map('fmt_materi', $st->fetchAll()));
  }

  $cekTulis = function (string $kelasId) use ($pdo, $me): void {
    akses_kelas_tulis($pdo, $me, $kelasId);
  };

  if ($method === 'POST') {
    cek_post_kebesaran();
    $kelasId = (string)($body['kelas_id'] ?? '');
    if ($kelasId === '') json_out(['error' => 'kelas_id wajib diisi'], 400);
    $cekTulis($kelasId);
    $judul = trim((string)($body['judul'] ?? ''));
    if ($judul === '') json_out(['error' => 'Judul materi wajib diisi'], 400);
    $tipe = in_array($body['tipe'] ?? '', ['pdf', 'video', 'tautan', 'teks'], true) ? $body['tipe'] : 'teks';
    $mid = uuid4();
    $pdo->prepare('INSERT INTO materi(id,kelas_id,judul,tipe,url,berkas,isi,urutan,dibuat_oleh)
                   VALUES(?,?,?,?,?,?,?,?,?)')
        ->execute([$mid, $kelasId, $judul, $tipe,
                   trim((string)($body['url'] ?? '')) ?: null,
                   simpan_unggah('berkas', 'Materi'),
                   $body['isi'] ?? null,
                   max(1, (int)($body['urutan'] ?? 1)), $me['id']]);
    json_out(get_materi($pdo, $mid), 201);
  }

  if ($method === 'PUT' && $id) {
    cek_post_kebesaran();
    $lama = cari_materi($pdo, $id);
    if (!$lama) json_out(['error' => 'Materi tidak ditemukan'], 404);
    $cekTulis($lama['kelas_id']);
    $sets = []; $vals = [];
    foreach (['judul', 'tipe', 'url', 'isi'] as $k) {
      if (array_key_exists($k, $body)) {
        $v = is_string($body[$k]) ? trim($body[$k]) : $body[$k];
        $sets[] = "$k=?"; $vals[] = ($v === '' ? null : $v);
      }
    }
    if (array_key_exists('urutan', $body)) { $sets[] = 'urutan=?'; $vals[] = max(1, (int)$body['urutan']); }
    $baru = simpan_unggah('berkas', 'Materi');
    if ($baru) {
      $sets[] = 'berkas=?'; $vals[] = $baru;
      if ($lama['berkas']) hapus_unggah($lama['berkas']);
    }
    if ($sets) { $vals[] = $id; $pdo->prepare('UPDATE materi SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals); }
    json_out(get_materi($pdo, $id));
  }

  if ($method === 'DELETE' && $id) {
    $lama = cari_materi($pdo, $id);
    if (!$lama) json_out(['error' => 'Materi tidak ditemukan'], 404);
    akses_kelas_tulis($pdo, $me, $lama['kelas_id']);
    if ($lama['berkas']) hapus_unggah($lama['berkas']);
    $pdo->prepare('DELETE FROM materi WHERE id=?')->execute([$id]);
    json_out(['ok' => true]);
  }
}

function cari_materi(PDO $pdo, string $id): ?array {
  $st = $pdo->prepare('SELECT * FROM materi WHERE id=?');
  $st->execute([$id]);
  $m = $st->fetch();
  return $m ?: null;
}

function get_materi(PDO $pdo, string $id): array {
  return fmt_materi(cari_materi($pdo, $id));
}

function fmt_materi(array $m): array {
  return [
    'id' => $m['id'], 'kelas_id' => $m['kelas_id'], 'judul' => $m['judul'], 'tipe' => $m['tipe'],
    'url' => $m['url'], 'berkas' => $m['berkas'], 'isi' => $m['isi'],
    'urutan' => (int)$m['urutan'], 'dibuat_oleh' => $m['dibuat_oleh'], 'created_at' => $m['created_at'] ?? null,
  ];
}

function hapus_unggah(string $path): void {
  if (!str_starts_with($path, '/uploads/')) return;
  $f = realpath(__DIR__ . '/../uploads/' . basename($path));
  $dir = realpath(__DIR__ . '/../uploads');
  if ($f && $dir && str_starts_with($f, $dir) && is_file($f)) @unlink($f);
}
