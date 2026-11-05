<?php
// =============================================================
// routes/penilaian.php — pengerjaan tugas oleh siswa dan penilaian
// oleh guru (docs/API-LMS.md §7). Fungsinya dipanggil juga dari
// routes/tugas.php untuk path /api/tugas/{id}/...
// =============================================================

// ---------- jalur /api/tugas/{id}/... ----------
function penilaian_submit(PDO $pdo, array $me, array $t): void {
  if ($me['role'] !== 'siswa') json_out(['error' => 'Endpoint ini untuk siswa'], 403);
  if ($t['jenis'] !== 'praktik') json_out(['error' => 'Tugas ini berbentuk kuis, gunakan endpoint kuis'], 400);
  akses_kelas($pdo, $me, $t['kelas_id'], true);
  $body = json_in();
  $gcode = (string)($body['gcode'] ?? '');
  if (trim($gcode) === '') json_out(['error' => 'gcode wajib diisi'], 400);
  periksa_tenggat($pdo, $t, $me['id']);

  $target = target_tugas($pdo, $t);
  [$sim, $cmp, $sc] = run_sim($gcode, $target);

  $aid = uuid4();
  $pdo->prepare('INSERT INTO percobaan(id,user_id,modul_id,tugas_id,gcode_input,skor,ada_error,detail)
                 VALUES(?,?,?,?,?,?,?,?)')
      ->execute([$aid, $me['id'], $t['modul_id'] ?? null, $t['id'], $gcode, $sc['skor'],
                 $sc['ada_error'] ? 1 : 0,
                 json_encode(['events' => $sim['events'], 'compare' => $cmp, 'target' => $target], JSON_UNESCAPED_UNICODE)]);

  $p = simpan_pengumpulan($pdo, $t, $me['id'], [
    'gcode' => $gcode, 'skor_simulasi' => $sc['skor'], 'ada_error' => $sc['ada_error'],
    'detail' => json_encode(['events' => $sim['events'], 'compare' => $cmp], JSON_UNESCAPED_UNICODE),
    'status' => 'terkumpul',
  ]);
  json_out([
    'pengumpulan' => fmt_pengumpulan($pdo, $p),
    'percobaan_id' => $aid,
    'skor' => $sc['skor'], 'ada_error' => $sc['ada_error'], 'match' => $cmp['match'],
    'events' => $sim['events'], 'compare' => $cmp, 'target' => $target,
  ]);
}

function penilaian_kuis(PDO $pdo, array $me, array $t): void {
  if ($me['role'] !== 'siswa') json_out(['error' => 'Endpoint ini untuk siswa'], 403);
  if ($t['jenis'] !== 'kuis') json_out(['error' => 'Tugas ini berbentuk praktik, gunakan endpoint submit'], 400);
  akses_kelas($pdo, $me, $t['kelas_id'], true);
  $body = json_in();
  periksa_tenggat($pdo, $t, $me['id']);

  $soalList = daftar_soal($pdo, $t['id'], true);
  if (!$soalList) json_out(['error' => 'Kuis ini belum punya soal'], 400);
  $input = [];
  foreach ((array)($body['jawaban'] ?? []) as $j) {
    if (!is_array($j) || empty($j['soal_id'])) continue;
    $input[$j['soal_id']] = $j;
  }

  $totalPoin = 0; $poinDapat = 0; $benar = 0; $jawabanOut = []; $periksa = [];
  foreach ($soalList as $s) {
    $totalPoin += (int)$s['poin'];
    $is = $input[$s['id']] ?? [];
    $hasil = periksa_jawaban($s, $is['jawaban'] ?? null, (string)($is['gcode'] ?? ''));
    $poinDapat += $hasil['poin'];
    if ($hasil['benar']) $benar++;
    $periksa[] = [
      'id' => uuid4(), 'soal_id' => $s['id'], 'jawaban' => $hasil['jawaban_tersimpan'],
      'gcode' => $hasil['gcode'], 'benar' => $hasil['benar'] ? 1 : 0, 'poin' => $hasil['poin'],
    ];
    $jawabanOut[] = [
      'soal_id' => $s['id'], 'urutan' => $s['urutan'], 'tipe' => $s['tipe'], 'teks' => $s['teks'],
      'jawaban' => $hasil['jawaban_tersimpan'], 'gcode' => $hasil['gcode'],
      'benar' => $hasil['benar'], 'poin' => $hasil['poin'], 'soal_poin' => (int)$s['poin'],
      'kunci' => $s['kunci'] ?? null, 'pembahasan' => $s['pembahasan'] ?? null,
      'events' => $hasil['events'], 'skor_simulasi' => $hasil['skor'],
    ];
  }
  $skor = $totalPoin > 0 ? (int)round($poinDapat * 100 / $totalPoin) : 0;

  $detail = json_encode(['jawaban' => $jawabanOut, 'total_poin' => $totalPoin, 'benar' => $benar], JSON_UNESCAPED_UNICODE);
  $p = simpan_pengumpulan($pdo, $t, $me['id'], [
    'gcode' => null, 'skor_simulasi' => $skor, 'ada_error' => false,
    'detail' => $detail, 'status' => 'terkumpul',
  ]);
  $pdo->prepare('DELETE FROM jawaban_kuis WHERE pengumpulan_id=?')->execute([$p['id']]);
  $st = $pdo->prepare('INSERT INTO jawaban_kuis(id,pengumpulan_id,tugas_id,siswa_id,soal_id,jawaban,gcode,benar,poin)
                       VALUES(?,?,?,?,?,?,?,?,?)');
  foreach ($periksa as $j) {
    $st->execute([$j['id'], $p['id'], $t['id'], $me['id'], $j['soal_id'], $j['jawaban'], $j['gcode'], $j['benar'], $j['poin']]);
  }
  json_out(['pengumpulan' => fmt_pengumpulan($pdo, $p), 'skor' => $skor,
            'benar' => $benar, 'total' => count($soalList), 'jawaban' => $jawabanOut]);
}

// ---------- akses guru: daftar & penilaian ----------
function daftar_pengumpulan(PDO $pdo, array $me, array $t): void {
  if ($me['role'] === 'siswa') json_out(['error' => 'Akses ditolak untuk peran ini'], 403);
  akses_kelas($pdo, $me, $t['kelas_id'], false);
  json_out(baris_pengumpulan($pdo, $t, $_GET['status'] ?? null));
}

// Semua anggota kelas beserta pengumpulannya; yang belum mengumpulkan ikut
// dikirim supaya guru melihat daftar hadir lengkap.
function baris_pengumpulan(PDO $pdo, array $t, ?string $filter = null): array {
  $ang = $pdo->prepare("SELECT a.user_id, u.nama, u.nis FROM anggota_kelas a JOIN users u ON u.id=a.user_id
                        WHERE a.kelas_id=? AND u.role='siswa' ORDER BY u.nama");
  $ang->execute([$t['kelas_id']]);
  $out = [];
  foreach ($ang->fetchAll() as $a) {
    $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE tugas_id=? AND siswa_id=?');
    $st->execute([$t['id'], $a['user_id']]);
    $p = $st->fetch();
    if ($p) {
      $row = fmt_pengumpulan($pdo, $p);
    } else {
      $row = ['id' => null, 'tugas_id' => $t['id'], 'tugas_judul' => $t['judul'],
              'siswa_id' => $a['user_id'], 'siswa_nama' => $a['nama'], 'nis' => $a['nis'],
              'gcode' => null, 'skor_simulasi' => null, 'ada_error' => false, 'nilai_guru' => null,
              'nilai_akhir' => null, 'catatan_guru' => null, 'status' => 'belum',
              'jumlah_percobaan' => 0, 'waktu_submit' => null, 'waktu_periksa' => null,
              'diperiksa_nama' => null, 'detail' => null];
    }
    if ($filter && $filter !== 'belum' && $filter !== $row['status']) continue;
    if ($filter === 'belum' && $row['id'] !== null) continue;
    $out[] = $row;
  }
  return $out;
}

function hasil_siswa(PDO $pdo, array $me, array $t): void {
  if ($me['role'] !== 'siswa') json_out(['error' => 'Endpoint ini untuk siswa'], 403);
  akses_kelas($pdo, $me, $t['kelas_id'], true);
  $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE tugas_id=? AND siswa_id=?');
  $st->execute([$t['id'], $me['id']]);
  $p = $st->fetch();
  $jawaban = [];
  if ($p) {
    $st = $pdo->prepare('SELECT j.*, s.urutan, s.tipe, s.teks, s.poin AS soal_poin, s.kunci, s.pembahasan
                         FROM jawaban_kuis j JOIN soal s ON s.id=j.soal_id
                         WHERE j.pengumpulan_id=? ORDER BY s.urutan');
    $st->execute([$p['id']]);
    foreach ($st->fetchAll() as $j) {
      $c = json_cols($j, 'kunci');
      $jawaban[] = ['id' => $j['id'], 'soal_id' => $j['soal_id'], 'urutan' => (int)$j['urutan'],
                    'tipe' => $j['tipe'], 'teks' => $j['teks'], 'jawaban' => $j['jawaban'],
                    'gcode' => $j['gcode'], 'benar' => (int)$j['benar'] === 1,
                    'poin' => (int)$j['poin'], 'soal_poin' => (int)$j['soal_poin'],
                    'kunci' => $c['kunci'], 'pembahasan' => $j['pembahasan']];
    }
  }
  json_out(['pengumpulan' => $p ? fmt_pengumpulan($pdo, $p) : null,
            'jawaban' => $jawaban, 'tugas' => dengan_soal($pdo, $t, false)]);
}

// ---------- jalur /api/pengumpulan & /api/nilai ----------
function r_penilaian(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  if ($route === 'pengumpulan') {
    $me = auth($pdo);
    if (!$id) json_out(['error' => 'Endpoint tidak dikenal'], 404);
    $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE id=?');
    $st->execute([$id]);
    $p = $st->fetch();
    if (!$p) json_out(['error' => 'Pengumpulan tidak ditemukan'], 404);
    $t = cari_tugas($pdo, $p['tugas_id']);
    akses_kelas($pdo, $me, $t['kelas_id'], false);

    if ($method === 'GET') json_out(fmt_pengumpulan($pdo, $p));

    if ($method === 'POST' && ($seg[3] ?? '') === 'koreksi') {
      $catatan = trim((string)($body['catatan_guru'] ?? ''));
      if ($catatan === '') json_out(['error' => 'Catatan perbaikan wajib diisi'], 400);
      $pdo->prepare("UPDATE pengumpulan SET catatan_guru=?, status='perlu_revisi', waktu_periksa=NOW(), diperiksa_oleh=? WHERE id=?")
          ->execute([$catatan, $me['id'], $id]);
      $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE id=?');
      $st->execute([$id]);
      json_out(fmt_pengumpulan($pdo, $st->fetch()));
    }

    if ($method === 'PUT') {
      $poin = max(1, (int)$t['poin']);
      $sets = []; $vals = [];
      $nilai = $body['nilai_guru'] ?? null;
      if ($nilai !== null && $nilai !== '') {
        $nilai = (int)$nilai;
        if ($nilai < 0 || $nilai > $poin) json_out(['error' => "Nilai harus antara 0 dan $poin sesuai poin tugas"], 400);
        $sets[] = 'nilai_guru=?'; $vals[] = $nilai;
      } elseif (array_key_exists('nilai_guru', $body)) {
        $sets[] = 'nilai_guru=?'; $vals[] = null;
      }
      if (array_key_exists('catatan_guru', $body)) {
        $sets[] = 'catatan_guru=?'; $vals[] = trim((string)$body['catatan_guru']) ?: null;
      }
      $status = $body['status'] ?? null;
      if ($status === null && $nilai !== null && $nilai !== '') $status = 'dinilai';
      if ($status !== null) {
        if (!in_array($status, ['terkumpul', 'dinilai', 'perlu_revisi'], true)) json_out(['error' => 'Status tidak dikenal'], 400);
        $sets[] = 'status=?'; $vals[] = $status;
        if ($status === 'dinilai') { $sets[] = 'waktu_periksa=NOW()'; $sets[] = 'diperiksa_oleh=?'; $vals[] = $me['id']; }
      }
      if (!$sets) json_out(['error' => 'Tidak ada yang diubah'], 400);
      $vals[] = $id;
      $pdo->prepare('UPDATE pengumpulan SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals);
      $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE id=?');
      $st->execute([$id]);
      json_out(fmt_pengumpulan($pdo, $st->fetch()));
    }
    json_out(['error' => 'Endpoint tidak dikenal'], 404);
  }

  if ($route === 'nilai' && $method === 'GET' && $id === 'saya') {
    $me = auth($pdo);
    if ($me['role'] !== 'siswa') json_out(['error' => 'Endpoint ini untuk siswa'], 403);
    $baris = []; $semua = []; $perKelas = [];
    foreach (daftar_tugas_siswa($pdo, $me) as $t) {
      $st = $pdo->prepare('SELECT * FROM pengumpulan WHERE tugas_id=? AND siswa_id=?');
      $st->execute([$t['id'], $me['id']]);
      $p = $st->fetch();
      $nilai = $p ? nilai_akhir($p, ['poin' => max(1, (int)$t['poin'])]) : null;
      $baris[] = ['tugas' => $t, 'nilai' => $nilai,
                  'skor_simulasi' => ($p && $p['skor_simulasi'] !== null) ? (int)$p['skor_simulasi'] : null,
                  'nilai_guru' => ($p && $p['nilai_guru'] !== null) ? (int)$p['nilai_guru'] : null,
                  'catatan_guru' => $p['catatan_guru'] ?? null,
                  'status' => $p['status'] ?? 'belum',
                  'batas_lulus' => (int)$t['batas_lulus'],
                  'tuntas' => $nilai !== null && $nilai >= (int)$t['batas_lulus']];
      if ($nilai !== null) {
        $semua[] = $nilai;
        $perKelas[$t['kelas_id']] ??= ['kelas_nama' => $t['kelas_nama'], 'nilai' => []];
        $perKelas[$t['kelas_id']]['nilai'][] = $nilai;
      }
    }
    $out = [];
    foreach ($perKelas as $kid => $v) {
      $out[] = ['kelas_id' => $kid, 'kelas_nama' => $v['kelas_nama'],
                'rata' => (int)round(array_sum($v['nilai']) / count($v['nilai'])), 'jumlah' => count($v['nilai'])];
    }
    json_out(['nilai' => $baris, 'rata_rata' => $semua ? (int)round(array_sum($semua) / count($semua)) : null,
              'per_kelas' => $out]);
  }
}

// =============================================================
// koreksi otomatis
// =============================================================
function periksa_tenggat(PDO $pdo, array $t, string $siswaId): void {
  if (empty($t['tenggat'])) return;
  if (strtotime((string)$t['tenggat']) >= time()) return;
  $st = $pdo->prepare("SELECT status FROM pengumpulan WHERE tugas_id=? AND siswa_id=? AND status='perlu_revisi'");
  $st->execute([$t['id'], $siswaId]);
  if ($st->fetch()) return; // guru meminta revisi, pengumpulan ulang tetap dibuka
  json_out(['error' => 'Tenggat tugas sudah lewat pada ' . $t['tenggat'] . '. Hubungi guru untuk memperpanjang.'], 403);
}

// Nilai satu jawaban. $soal bentuk keluaran daftar_soal (sudah dengan kunci).
function periksa_jawaban(array $soal, $jawaban, string $gcode): array {
  $poin = (int)$soal['poin'];
  $kunci = $soal['kunci'] ?? null;
  $out = ['benar' => false, 'poin' => 0, 'gcode' => null, 'jawaban_tersimpan' => null,
          'events' => null, 'skor' => null];

  if ($soal['tipe'] === 'praktik') {
    if (trim($gcode) === '') { $out['jawaban_tersimpan'] = null; return $out; }
    $target = $soal['target'] ?: target_baku();
    [$sim, $cmp, $sc] = run_sim($gcode, $target);
    $out['gcode'] = $gcode;
    $out['events'] = $sim['events'];
    $out['skor'] = $sc['skor'];
    $out['benar'] = $sc['skor'] >= 70 && !$sc['ada_error'];
    $out['poin'] = (int)round($poin * $sc['skor'] / 100);
    return $out;
  }

  if ($soal['tipe'] === 'pg') {
    $pilih = $jawaban === null || $jawaban === '' ? null : (int)$jawaban;
    $out['jawaban_tersimpan'] = $pilih === null ? null : (string)$pilih;
    $out['benar'] = $pilih !== null && $pilih === (int)$kunci;
  } elseif ($soal['tipe'] === 'benar_salah') {
    $pilih = null;
    if (is_bool($jawaban)) $pilih = $jawaban;
    elseif ($jawaban !== null && $jawaban !== '') {
      $pilih = in_array(strtolower((string)$jawaban), ['true', '1', 'benar', 'ya'], true);
    }
    $out['jawaban_tersimpan'] = $pilih === null ? null : ($pilih ? 'true' : 'false');
    $out['benar'] = $pilih !== null && $pilih === (bool)$kunci;
  } else {
    $teks = trim(preg_replace('/\s+/', ' ', (string)($jawaban ?? '')));
    $out['jawaban_tersimpan'] = $teks === '' ? null : $teks;
    $terima = is_array($kunci) ? $kunci : (array)($kunci ?? []);
    foreach ($terima as $t) {
      if ($teks !== '' && strtolower($teks) === strtolower(trim(preg_replace('/\s+/', ' ', (string)$t)))) {
        $out['benar'] = true; break;
      }
    }
  }
  if ($out['benar']) $out['poin'] = $poin;
  return $out;
}
