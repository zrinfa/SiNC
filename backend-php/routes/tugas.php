<?php
// =============================================================
// routes/tugas.php — tugas praktik G-Code dan kuis, termasuk soal.
// docs/API-LMS.md §6. Pengerjaan/penilaian ada di routes/penilaian.php.
// =============================================================
require_once __DIR__ . '/penilaian.php';

function r_tugas(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  if ($route !== 'tugas') return;
  $me = auth($pdo);
  $anak = $seg[3] ?? null;

  // ---------- daftar untuk guru/admin ----------
  if ($method === 'GET' && !$id) {
    require_role($me, 'admin', 'guru');
    $kelasId = (string)($_GET['kelas_id'] ?? '');
    if ($kelasId !== '') {
      akses_kelas($pdo, $me, $kelasId, false);
      $st = $pdo->prepare('SELECT * FROM tugas WHERE kelas_id=? ORDER BY created_at DESC');
      $st->execute([$kelasId]);
    } else {
      $milik = array_map(fn($k) => $k['id'], daftar_kelas($pdo, $me));
      if (!$milik) json_out([]);
      $st = $pdo->prepare('SELECT * FROM tugas WHERE kelas_id IN (' . implode(',', array_fill(0, count($milik), '?')) . ')
                           ORDER BY created_at DESC');
      $st->execute($milik);
    }
    $rows = $st->fetchAll();
    if (!empty($_GET['status'])) {
      $rows = array_values(array_filter($rows, fn($t) => $t['status'] === $_GET['status']));
    }
    $out = array_map(fn($t) => dengan_soal($pdo, $t, true), $rows);
    json_out($out);
  }

  // ---------- daftar milik siswa ----------
  if ($method === 'GET' && $id === 'saya') {
    json_out(daftar_tugas_siswa($pdo, $me));
  }

  // ---------- buat ----------
  if ($method === 'POST' && !$id) {
    require_role($me, 'admin', 'guru');
    cek_post_kebesaran();
    $kelasId = (string)($body['kelas_id'] ?? '');
    if ($kelasId === '') json_out(['error' => 'kelas_id wajib diisi'], 400);
    akses_kelas_tulis($pdo, $me, $kelasId);
    $judul = trim((string)($body['judul'] ?? ''));
    if ($judul === '') json_out(['error' => 'Judul tugas wajib diisi'], 400);
    $jenis = in_array($body['jenis'] ?? '', ['praktik', 'kuis'], true) ? $body['jenis'] : 'praktik';
    $status = ($body['status'] ?? 'draf') === 'terbit' ? 'terbit' : 'draf';
    $poin = max(1, (int)($body['poin'] ?? 100));
    $batas = max(0, min($poin, (int)($body['batas_lulus'] ?? round($poin * .7))));
    $target = array_key_exists('target_profil', $body) && $body['target_profil']
      ? json_encode(target_dari_body(is_array($body['target_profil']) ? $body['target_profil'] + $body : $body))
      : null;
    $lkpd = trim((string)($body['lkpd_url'] ?? '')) ?: null;
    $terunggah = simpan_unggah('lkpd', 'LKPD');
    if ($terunggah) $lkpd = $terunggah;

    $tid = uuid4();
    $pdo->prepare('INSERT INTO tugas(id,kelas_id,dibuat_oleh,modul_id,judul,instruksi,jenis,target_profil,starter_gcode,
                                     lkpd_url,materi_ids,poin,batas_lulus,tenggat,boleh_ulang,status)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$tid, $kelasId, $me['id'], $body['modul_id'] ?? null, $judul,
                   $body['instruksi'] ?? null, $jenis, $target, $body['starter_gcode'] ?? null,
                   $lkpd, json_encode(array_values(array_map('strval', (array)($body['materi_ids'] ?? [])))),
                   $poin, $batas, isi_tenggat($body['tenggat'] ?? null),
                   empty($body['boleh_ulang']) ? 0 : 1, $status]);
    if (!empty($body['soal']) && is_array($body['soal'])) simpan_soal($pdo, $tid, $body['soal']);
    json_out(dengan_soal($pdo, cari_tugas($pdo, $tid), true), 201);
  }

  // ---------- satu tugas ----------
  if ($id) {
    $t = cari_tugas($pdo, $id);
    if (!$t) json_out(['error' => 'Tugas tidak ditemukan'], 404);
    $kelas = akses_kelas($pdo, $me, $t['kelas_id'], $me['role'] === 'siswa');
    $guru = $me['role'] !== 'siswa';
    if ($guru) akses_kelas($pdo, $me, $t['kelas_id'], false);
    else if ($t['status'] !== 'terbit') json_out(['error' => 'Tugas belum diterbitkan'], 403);

    // pengerjaan & penilaian (helper ada di routes/penilaian.php)
    if ($method === 'POST' && $anak === 'submit') { penilaian_submit($pdo, $me, $t); }
    if ($method === 'POST' && $anak === 'kuis')   { penilaian_kuis($pdo, $me, $t); }
    if ($method === 'GET'  && $anak === 'pengumpulan') { daftar_pengumpulan($pdo, $me, $t); }
    if ($method === 'GET'  && $anak === 'hasil')  { hasil_siswa($pdo, $me, $t); }

    if ($method === 'GET' && !$anak) {
      $out = dengan_soal($pdo, $t, $guru);
      $out['punya_saya'] = $guru ? null : punya_saya($pdo, $t['id'], $me['id']);
      if ($guru) $out['pengumpulan'] = baris_pengumpulan($pdo, $t);
      json_out($out);
    }

    if ($method === 'PUT' && !$anak) {
      if (!$guru) json_out(['error' => 'Hanya guru pengampu yang dapat mengubah tugas'], 403);
      cek_post_kebesaran();
      $sets = []; $vals = [];
      foreach (['judul', 'instruksi', 'starter_gcode', 'modul_id', 'lkpd_url'] as $k) {
        if (array_key_exists($k, $body)) {
          $v = is_string($body[$k]) ? trim($body[$k]) : $body[$k];
          $sets[] = "$k=?"; $vals[] = ($v === '' ? null : $v);
        }
      }
      if (array_key_exists('jenis', $body) && in_array($body['jenis'], ['praktik', 'kuis'], true)) {
        $sets[] = 'jenis=?'; $vals[] = $body['jenis'];
      }
      if (array_key_exists('poin', $body)) {
        $sets[] = 'poin=?'; $vals[] = max(1, (int)$body['poin']);
      }
      if (array_key_exists('batas_lulus', $body)) {
        $batas = (int)$body['batas_lulus'];
        $poinTerpakai = $sets && in_array('poin=?', $sets, true) ? (int)$body['poin'] : (int)$t['poin'];
        $sets[] = 'batas_lulus=?'; $vals[] = max(0, min($poinTerpakai, $batas));
      }
      if (array_key_exists('tenggat', $body)) { $sets[] = 'tenggat=?'; $vals[] = isi_tenggat($body['tenggat']); }
      if (array_key_exists('boleh_ulang', $body)) { $sets[] = 'boleh_ulang=?'; $vals[] = empty($body['boleh_ulang']) ? 0 : 1; }
      if (array_key_exists('status', $body)) {
        $sets[] = 'status=?'; $vals[] = $body['status'] === 'terbit' ? 'terbit' : 'draf';
      }
      if (array_key_exists('materi_ids', $body)) {
        $sets[] = 'materi_ids=?';
        $vals[] = json_encode(array_values(array_map('strval', (array)$body['materi_ids'])));
      }
      if (array_key_exists('target_profil', $body)) {
        $sets[] = 'target_profil=?';
        $vals[] = $body['target_profil'] ? json_encode(target_dari_body(is_array($body['target_profil']) ? $body['target_profil'] : $body)) : null;
      }
      $terunggah = simpan_unggah('lkpd', 'LKPD');
      if ($terunggah) { $sets[] = 'lkpd_url=?'; $vals[] = $terunggah; }
      if ($sets) { $vals[] = $id; $pdo->prepare('UPDATE tugas SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals); }
      if (array_key_exists('soal', $body) && is_array($body['soal'])) {
        $pdo->prepare('DELETE FROM soal WHERE tugas_id=?')->execute([$id]);
        simpan_soal($pdo, $id, $body['soal']);
      }
      json_out(dengan_soal($pdo, cari_tugas($pdo, $id), true));
    }

    if ($method === 'PUT' && $anak === 'status') {
      if (!$guru) json_out(['error' => 'Hanya guru pengampu yang dapat mengubah status'], 403);
      $status = ($body['status'] ?? '') === 'terbit' ? 'terbit' : 'draf';
      $pdo->prepare('UPDATE tugas SET status=? WHERE id=?')->execute([$status, $id]);
      json_out(dengan_soal($pdo, cari_tugas($pdo, $id), true));
    }

    if ($method === 'DELETE') {
      if (!$guru) json_out(['error' => 'Hanya guru pengampu yang dapat menghapus tugas'], 403);
      $pdo->prepare('DELETE FROM tugas WHERE id=?')->execute([$id]);
      json_out(['ok' => true]);
    }
  }
}

// =============================================================
// helper lokal
// =============================================================
