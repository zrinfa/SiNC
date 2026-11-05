<?php
// =============================================================
// routes/stats.php — kartu dasbor per peran dan rekap kemajuan siswa
// (docs/API-LMS.md §9, §8).
// =============================================================

function r_stats(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  if ($method !== 'GET') return;

  // ---------- progress lama (matriks modul per siswa) ----------
  if ($route === 'progress') {
    $me = auth($pdo);
    require_role($me, 'admin', 'guru');
    $siswa = daftar_anggota_progress($pdo, $me, $_GET['kelas_id'] ?? null);
    $mods = all_modul($pdo);
    $rows = $pdo->query("SELECT user_id, modul_id, COUNT(*) n, MAX(skor) best, MAX(waktu_selesai) last_at
                         FROM percobaan GROUP BY user_id, modul_id")->fetchAll();
    $map = [];
    foreach ($rows as $r) $map[$r['user_id'] . '|' . ($r['modul_id'] ?? '')] = $r;
    $out = [];
    foreach ($siswa as $s) {
      $perMod = [];
      foreach ($mods as $m) {
        $k = $s['id'] . '|' . $m['id'];
        $perMod[] = ['modul_id' => $m['id'], 'judul' => $m['judul'], 'level' => $m['level'],
          'percobaan' => (int)($map[$k]['n'] ?? 0), 'skor_terbaik' => $map[$k]['best'] ?? null,
          'tuntas' => ($map[$k]['best'] ?? 0) >= 70];
      }
      $out[] = ['siswa' => $s, 'modul' => $perMod];
    }
    json_out($out);
  }

  if ($route !== 'stats') return;
  $me = auth($pdo);
  $bagian = $id ?: '';
  $kelasId = $seg[3] ?? null;

  // ---------- dasbor siswa ----------
  if ($bagian === 'siswa') {
    if ($me['role'] !== 'siswa') json_out(['error' => 'Endpoint ini untuk siswa'], 403);
    $tugas = daftar_tugas_siswa($pdo, $me);
    $perlu = 0; $dekat = []; $tuntas = 0; $nilai = [];
    foreach ($tugas as $t) {
      $p = $t['punya_saya'];
      if (!$p || $p['status'] === 'perlu_revisi') {
        $perlu++;
        if (!empty($t['tenggat']) && strtotime($t['tenggat']) < strtotime('+3 days')) {
          $dekat[] = ['id' => $t['id'], 'judul' => $t['judul'], 'tenggat' => $t['tenggat'],
                     'kelas_nama' => $t['kelas_nama']];
        }
      } elseif (($p['nilai_guru'] ?? null) !== null || ($p['skor_simulasi'] ?? null) !== null) {
        $n = nilai_akhir(['nilai_guru' => $p['nilai_guru'], 'skor_simulasi' => $p['skor_simulasi']],
                         ['poin' => max(1, (int)$t['poin'])]);
        $nilai[] = $n;
        if ($n >= (int)$t['batas_lulus']) $tuntas++;
      }
    }
    json_out(['tugas_aktif' => count($tugas), 'perlu_dikerjakan' => $perlu,
              'tenggat_dekat' => $dekat, 'rata_nilai' => $nilai ? (int)round(array_sum($nilai) / count($nilai)) : null,
              'tuntas' => $tuntas, 'total' => count($tugas)]);
  }

  // ---------- dasbor guru ----------
  if ($bagian === 'guru') {
    require_role($me, 'admin', 'guru');
    $kelas = daftar_kelas($pdo, $me);
    $siswa = 0; $menunggu = 0; foreach ($kelas as $k) { $siswa += $k['jumlah_siswa']; $menunggu += $k['perlu_dinilai']; }
    $st = $pdo->prepare("SELECT COUNT(*) FROM tugas t WHERE t.status='terbit' AND t.kelas_id IN ("
                        ._placeholder(count($kelas)) . ')');
    $ids = array_map(fn($k) => $k['id'], $kelas);
    $terbit = 0;
    if ($ids) { $st->execute($ids); $terbit = (int)$st->fetchColumn(); }
    $st = $pdo->prepare('SELECT AVG(' . nilai_akhir_sql('t.poin') . ') FROM pengumpulan p
                         JOIN tugas t ON t.id=p.tugas_id WHERE t.kelas_id IN (' . _placeholder(count($ids)) . ')');
    $rata = null;
    if ($ids) { $st->execute($ids); $v = $st->fetchColumn(); $rata = $v === null ? null : (int)round((float)$v); }
    json_out(['kelas' => count($kelas), 'siswa' => $siswa, 'tugas_terbit' => $terbit,
              'menunggu_dinilai' => $menunggu, 'rata_nilai' => $rata,
              'teratas' => siswa_teratas($pdo, $ids, 5),
              'kelas_list' => $kelas]);
  }

  // ---------- rekap satu kelas ----------
  if ($bagian === 'kelas' && $kelasId) {
    $kelas = akses_kelas($pdo, $me, $kelasId, false);
    $st = $pdo->prepare("SELECT * FROM tugas WHERE kelas_id=? AND status='terbit' ORDER BY created_at");
    $st->execute([$kelasId]);
    $tugasOut = []; $distribusi = array_fill(0, 5, 0); $semua = [];
    foreach ($st->fetchAll() as $t) {
      $st2 = $pdo->prepare('SELECT u.id, ' . nilai_akhir_sql('t.poin') . ' AS nilai
                            FROM anggota_kelas a
                            JOIN users u ON u.id=a.user_id AND u.role=\'siswa\'
                            JOIN tugas t ON t.id=?
                            LEFT JOIN pengumpulan p ON p.tugas_id=t.id AND p.siswa_id=u.id
                            WHERE a.kelas_id=?');
      $st2->execute([$t['id'], $kelasId]);
      $tuntas = 0; $belum = 0; $r = [];
      foreach ($st2->fetchAll() as $row) {
        if ($row['nilai'] === null) { $belum++; continue; }
        $n = (int)round((float)$row['nilai']);
        $r[] = $n; $semua[] = $n;
        if ($n >= (int)$t['batas_lulus']) $tuntas++;
        $distribusi[min(4, intdiv($n, 20))]++;
      }
      $tugasOut[] = ['id' => $t['id'], 'judul' => $t['judul'], 'jenis' => $t['jenis'],
                     'rata' => $r ? (int)round(array_sum($r) / count($r)) : null,
                     'tuntas' => $tuntas, 'belum_kumpul' => $belum, 'jumlah_siswa' => count($r) + $belum];
    }
    json_out(['kelas' => fmt_kelas($pdo, $kelas), 'tugas' => $tugasOut,
              'distribusi' => [['rentang' => '0-19', 'jumlah' => $distribusi[0]],
                               ['rentang' => '20-39', 'jumlah' => $distribusi[1]],
                               ['rentang' => '40-59', 'jumlah' => $distribusi[2]],
                               ['rentang' => '60-79', 'jumlah' => $distribusi[3]],
                               ['rentang' => '80-100', 'jumlah' => $distribusi[4]]],
              'rata_kelas' => $semua ? (int)round(array_sum($semua) / count($semua)) : null]);
  }

  // ---------- rekap sekolah (admin) ----------
  if ($bagian === 'sekolah') {
    require_role($me, 'admin');
    $hitung = fn(string $role) => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role=" . $pdo->quote($role))->fetchColumn();
    $nonaktif = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE status<>'aktif'")->fetchColumn();
    $kelas = (int)$pdo->query('SELECT COUNT(*) FROM kelas')->fetchColumn();
    $terbit = (int)$pdo->query("SELECT COUNT(*) FROM tugas WHERE status='terbit'")->fetchColumn();
    $dinilai = (int)$pdo->query("SELECT COUNT(*) FROM pengumpulan WHERE status='dinilai'")->fetchColumn();
    $totalKumpul = (int)$pdo->query('SELECT COUNT(*) FROM pengumpulan')->fetchColumn();
    $v = $pdo->query('SELECT AVG(' . nilai_akhir_sql('t.poin') . ') FROM pengumpulan p JOIN tugas t ON t.id=p.tugas_id')->fetchColumn();
    $ids = array_map(fn($k) => $k['id'], $pdo->query('SELECT id FROM kelas')->fetchAll());
    json_out([
      'user' => ['admin' => $hitung('admin'), 'guru' => $hitung('guru'), 'siswa' => $hitung('siswa'),
                 'nonaktif' => $nonaktif],
      'kelas' => $kelas, 'tugas_terbit' => $terbit,
      'pengumpulan' => ['total' => $totalKumpul, 'dinilai' => $dinilai],
      'rata_nilai_sekolah' => $v === null ? null : (int)round((float)$v),
      'siswa_teratas' => siswa_teratas($pdo, $ids, 8),
      'kelas_teratas' => rekap_sekolah_kelas($pdo),
      'simulasi' => (int)$pdo->query('SELECT COUNT(*) FROM percobaan')->fetchColumn(),
    ]);
  }

  json_out(['error' => 'Endpoint tidak dikenal'], 404);
}

function _placeholder(int $n): string {
  return implode(',', array_fill(0, max(1, $n), '?'));
}

function daftar_anggota_progress(PDO $pdo, array $me, ?string $kelasId): array {
  if ($kelasId) {
    akses_kelas($pdo, $me, $kelasId, false);
    $st = $pdo->prepare("SELECT u.id, u.nama, u.email, u.kelas, u.nis FROM anggota_kelas a
                         JOIN users u ON u.id=a.user_id WHERE a.kelas_id=? AND u.role='siswa' ORDER BY u.nama");
    $st->execute([$kelasId]);
    return $st->fetchAll();
  }
  if ($me['role'] === 'admin') {
    return $pdo->query("SELECT id, nama, email, kelas, nis FROM users WHERE role='siswa' ORDER BY nama")->fetchAll();
  }
  $milik = array_map(fn($k) => $k['id'], daftar_kelas($pdo, $me));
  if (!$milik) return [];
  $st = $pdo->prepare("SELECT DISTINCT u.id, u.nama, u.email, u.kelas, u.nis FROM anggota_kelas a
                       JOIN users u ON u.id=a.user_id WHERE a.kelas_id IN (" . _placeholder(count($milik)) . ")
                       AND u.role='siswa' ORDER BY u.nama");
  $st->execute($milik);
  return $st->fetchAll();
}

function siswa_teratas(PDO $pdo, array $kelasIds, int $maks): array {
  if (!$kelasIds) return [];
  $st = $pdo->prepare('SELECT u.id, u.nama, u.nis, k.nama AS kelas_nama,
                              AVG(' . nilai_akhir_sql('t.poin') . ') AS rata
                       FROM pengumpulan p
                       JOIN users u ON u.id=p.siswa_id
                       JOIN tugas t ON t.id=p.tugas_id
                       JOIN kelas k ON k.id=t.kelas_id
                       WHERE t.kelas_id IN (' . _placeholder(count($kelasIds)) . ')
                       GROUP BY u.id, u.nama, u.nis, k.nama
                       ORDER BY rata DESC LIMIT ' . (int)$maks);
  $st->execute($kelasIds);
  return array_map(fn($r) => ['id' => $r['id'], 'nama' => $r['nama'], 'nis' => $r['nis'],
                              'kelas' => $r['kelas_nama'], 'rata_nilai' => (int)round((float)$r['rata'])],
                   $st->fetchAll());
}

function rekap_sekolah_kelas(PDO $pdo): array {
  $rows = $pdo->query('SELECT k.id, k.nama, k.kode, k.tingkat,
                              (SELECT COUNT(*) FROM anggota_kelas a JOIN users u ON u.id=a.user_id
                                WHERE a.kelas_id=k.id AND u.role=\'siswa\') AS siswa,
                              (SELECT COUNT(*) FROM tugas t WHERE t.kelas_id=k.id AND t.status=\'terbit\') AS tugas
                       FROM kelas k ORDER BY k.nama')->fetchAll();
  $out = [];
  foreach ($rows as $r) {
    $st = $pdo->prepare('SELECT AVG(' . nilai_akhir_sql('t.poin') . ') FROM pengumpulan p
                         JOIN tugas t ON t.id=p.tugas_id WHERE t.kelas_id=?');
    $st->execute([$r['id']]);
    $v = $st->fetchColumn();
    $out[] = ['id' => $r['id'], 'nama' => $r['nama'], 'kode' => $r['kode'], 'tingkat' => $r['tingkat'],
              'siswa' => (int)$r['siswa'], 'tugas' => (int)$r['tugas'],
              'rata_nilai' => $v === null ? null : (int)round((float)$v)];
  }
  usort($out, fn($a, $b) => ($b['rata_nilai'] ?? -1) <=> ($a['rata_nilai'] ?? -1));
  return $out;
}
