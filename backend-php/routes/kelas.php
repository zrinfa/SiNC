<?php
// =============================================================
// routes/kelas.php — rombel, keanggotaan, import massal, rekap nilai,
// ekspor CSV (docs/API-LMS.md §3).
// =============================================================

function r_kelas(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  $anak = $seg[3] ?? null;
  $cucu = $seg[4] ?? null;

  // ---------- ekspor CSV ----------
  if ($route === 'export' && $method === 'GET') {
    $me = auth($pdo);
    $kelasId = (string)($_GET['kelas_id'] ?? '');
    if ($kelasId === '') json_out(['error' => 'Parameter kelas_id wajib'], 400);
    $kelas = akses_kelas($pdo, $me, $kelasId, false);
    $data = rekap_kelas($pdo, $kelas);
    $baris = [['NIS', 'Nama', 'Kelas']];
    foreach ($data['tugas'] as $t) $baris[0][] = $t['judul'] . ' (' . $t['poin'] . ')';
    $baris[0][] = 'Rata-rata';
    foreach ($data['baris'] as $b) {
      $row = [$b['siswa']['nis'] ?? '', $b['siswa']['nama'], $b['siswa']['kelas'] ?? $kelas['nama']];
      $isi = [];
      foreach ($data['tugas'] as $t) {
        $n = $b['nilai'][$t['id']] ?? null;
        $row[] = $n === null ? '' : $n;
        if ($n !== null) $isi[] = (int)$n;
      }
      $row[] = $isi ? round(array_sum($isi) / count($isi), 1) : '';
      $baris[] = $row;
    }
    kirim_csv('nilai-' . $kelas['kode'], $baris);
  }

  if ($route !== 'kelas') return;
  $me = auth($pdo);

  // ---------- bergabung dengan kode undangan (siswa) ----------
  if ($method === 'POST' && $id === 'gabung') {
    if ($me['role'] !== 'siswa') json_out(['error' => 'Hanya siswa yang dapat bergabung dengan kode kelas'], 403);
    $kode = strtoupper(trim((string)($body['kode'] ?? '')));
    if ($kode === '') json_out(['error' => 'Kode kelas wajib diisi'], 400);
    $st = $pdo->prepare('SELECT * FROM kelas WHERE kode=?');
    $st->execute([$kode]);
    $k = $st->fetch();
    if (!$k) json_out(['error' => 'Kode kelas tidak dikenali'], 404);
    gabung_kelas($pdo, $k['id'], $me['id']);
    $pdo->prepare('UPDATE users SET kelas=? WHERE id=?')->execute([potong_teks($k['nama']), $me['id']]);
    json_out(fmt_kelas($pdo, $k));
  }

  // ---------- daftar & buat ----------
  if ($method === 'GET' && !$id) json_out(daftar_kelas($pdo, $me));

  if ($method === 'POST' && !$id) {
    require_role($me, 'admin', 'guru');
    $nama = trim((string)($body['nama'] ?? ''));
    if ($nama === '') json_out(['error' => 'Nama kelas wajib diisi'], 400);
    $guruId = $me['role'] === 'admin' && !empty($body['guru_id']) ? $body['guru_id'] : $me['id'];
    if ($guruId !== $me['id']) {
      $st = $pdo->prepare("SELECT id FROM users WHERE id=? AND role='guru'");
      $st->execute([$guruId]);
      if (!$st->fetch()) json_out(['error' => 'Guru pengampu tidak ditemukan'], 400);
    }
    $kid = uuid4();
    $pdo->prepare('INSERT INTO kelas(id,nama,kode,guru_id,tingkat,kompetensi,tahun_ajaran,deskripsi)
                   VALUES(?,?,?,?,?,?,?,?)')
        ->execute([$kid, $nama, kode_unik($pdo), $guruId,
                   trim((string)($body['tingkat'] ?? '')) ?: null,
                   trim((string)($body['kompetensi'] ?? '')) ?: null,
                   trim((string)($body['tahun_ajaran'] ?? '')) ?: null,
                   $body['deskripsi'] ?? null]);
    json_out(fmt_kelas($pdo, cari_kelas($pdo, $kid)), 201);
  }

  // ---------- satu kelas ----------
  if ($id) {
    $kelas = akses_kelas($pdo, $me, $id, $me['role'] === 'siswa');
    $menulis = function () use ($pdo, $me, $id) { return akses_kelas_tulis($pdo, $me, $id); };

    if ($method === 'GET' && !$anak) {
      $out = fmt_kelas($pdo, $kelas);
      $out['anggota'] = daftar_anggota($pdo, $id, $me['role'] !== 'siswa');
      $st = $pdo->prepare('SELECT * FROM tugas WHERE kelas_id=? ORDER BY created_at DESC');
      $st->execute([$id]);
      $rows = $st->fetchAll();
      if ($me['role'] === 'siswa') $rows = array_filter($rows, fn($t) => $t['status'] === 'terbit');
      $out['tugas'] = array_values(array_map(fn($t) => $me['role'] === 'siswa'
        ? fmt_tugas_siswa($pdo, $t, $me['id']) : fmt_tugas($pdo, $t), $rows));
      json_out($out);
    }

    if ($method === 'PUT' && $anak === 'kode') {
      $menulis();
      $pdo->prepare('UPDATE kelas SET kode=? WHERE id=?')->execute([kode_unik($pdo), $id]);
      json_out(fmt_kelas($pdo, cari_kelas($pdo, $id)));
    }

    if ($method === 'PUT') {
      $menulis();
      $sets = []; $vals = [];
      foreach (['nama', 'tingkat', 'kompetensi', 'tahun_ajaran', 'deskripsi'] as $k) {
        if (array_key_exists($k, $body)) { $sets[] = "$k=?"; $vals[] = trim((string)$body[$k]) ?: null; }
      }
      if ($me['role'] === 'admin' && !empty($body['guru_id'])) {
        $st = $pdo->prepare("SELECT id FROM users WHERE id=? AND role='guru'");
        $st->execute([$body['guru_id']]);
        if (!$st->fetch()) json_out(['error' => 'Guru pengampu tidak ditemukan'], 400);
        $sets[] = 'guru_id=?'; $vals[] = $body['guru_id'];
      }
      if ($sets) { $vals[] = $id; $pdo->prepare('UPDATE kelas SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals); }
      json_out(fmt_kelas($pdo, cari_kelas($pdo, $id)));
    }

    if ($method === 'DELETE') {
      $menulis();
      $pdo->prepare('DELETE FROM kelas WHERE id=?')->execute([$id]);
      json_out(['ok' => true]);
    }

    // ---------- keanggotaan ----------
    if ($anak === 'anggota') {
      if ($method === 'GET' && !$cucu) json_out(daftar_anggota($pdo, $id, $me['role'] !== 'siswa'));

      if ($method === 'POST' && !$cucu) {
        $menulis();
        $ids = $body['user_ids'] ?? ($body['user_id'] ?? null);
        $ids = is_array($ids) ? $ids : ($ids ? [$ids] : []);
        if (!$ids) json_out(['error' => 'Pilih minimal satu siswa'], 400);
        $tambah = 0;
        foreach ($ids as $uid) {
          $st = $pdo->prepare("SELECT id FROM users WHERE id=? AND role='siswa'");
          $st->execute([$uid]);
          if (!$st->fetch()) continue;
          if (gabung_kelas($pdo, $id, $uid)) {
            $tambah++;
            $pdo->prepare('UPDATE users SET kelas=? WHERE id=?')->execute([potong_teks($kelas['nama']), $uid]);
          }
        }
        json_out(['ditambah' => $tambah, 'anggota' => daftar_anggota($pdo, $id, true)]);
      }

      if ($method === 'DELETE' && $cucu) {
        $menulis();
        $pdo->prepare('DELETE FROM anggota_kelas WHERE kelas_id=? AND user_id=?')->execute([$id, $cucu]);
        json_out(['ok' => true]);
      }
    }

    // ---------- import massal NIS ----------
    if ($anak === 'import' && $method === 'POST') {
      $menulis();
      $pemisah = $body['pisahkan'] ?? null;
      // Satu password untuk seluruh batch supaya guru cukup mencatat satu
      // nilai; bisa diganti dengan password_sementara dari request.
      $sandi = trim((string)($body['password_sementara'] ?? '')) ?: sandi_sementara();
      $daftar = baca_daftar_siswa((string)($body['teks'] ?? ''), $pemisah);
      if (!$daftar) json_out(['error' => 'Tidak ada baris yang terbaca. Format: NIS;Nama;Email (Email boleh dikosongkan)'], 400);
      $dibuat = []; $sudahAda = 0;
      foreach ($daftar as $b) {
        $st = $pdo->prepare('SELECT id FROM users WHERE nis=? OR email=?');
        $st->execute([$b['nis'], $b['email']]);
        $lama = $st->fetch();
        if ($lama) {
          gabung_kelas($pdo, $id, $lama['id']);
          $sudahAda++;
          continue;
        }
        $akun = buat_user($pdo, ['nama' => $b['nama'], 'email' => $b['email'], 'nis' => $b['nis'],
                                 'role' => 'siswa', 'kelas' => $kelas['nama'], 'password' => $sandi]);
        gabung_kelas($pdo, $id, $akun['user']['id']);
        $dibuat[] = $akun['user'];
      }
      json_out(['dibuat' => $dibuat, 'sudah_ada' => $sudahAda,
                'password_sementara' => $sandi, 'anggota' => daftar_anggota($pdo, $id, true)]);
    }

    // ---------- rekap nilai ----------
    if ($anak === 'rekap' && $method === 'GET') {
      if ($me['role'] === 'siswa') json_out(['error' => 'Rekap nilai hanya untuk guru pengampu'], 403);
      json_out(rekap_kelas($pdo, $kelas));
    }
  }
}

// =============================================================
// helper
// =============================================================
function daftar_anggota(PDO $pdo, string $kelasId, bool $lengkap = true): array {
  $ang = $pdo->prepare("SELECT a.id, a.user_id, a.gabung_pada, u.nama, u.email, u.nis, u.kelas, u.status
                        FROM anggota_kelas a JOIN users u ON u.id=a.user_id
                        WHERE a.kelas_id=? ORDER BY u.nama");
  $ang->execute([$kelasId]);
  $rows = $ang->fetchAll();

  $st = $pdo->prepare("SELECT COUNT(*) FROM tugas WHERE kelas_id=? AND status='terbit'");
  $st->execute([$kelasId]);
  $jumlahTugas = (int)$st->fetchColumn();

  $st = $pdo->prepare("SELECT p.siswa_id, COUNT(*) terkumpul,
                              SUM(CASE WHEN p.status='dinilai' THEN 1 ELSE 0 END) dinilai
                       FROM pengumpulan p JOIN tugas t ON t.id=p.tugas_id
                       WHERE t.kelas_id=? GROUP BY p.siswa_id");
  $st->execute([$kelasId]);
  $kumpul = [];
  foreach ($st->fetchAll() as $r) $kumpul[$r['siswa_id']] = $r;

  $st = $pdo->prepare('SELECT p.siswa_id, AVG(' . nilai_akhir_sql('t.poin') . ') rata
                       FROM pengumpulan p JOIN tugas t ON t.id=p.tugas_id
                       WHERE t.kelas_id=? AND COALESCE(p.nilai_guru,p.skor_simulasi) IS NOT NULL
                       GROUP BY p.siswa_id');
  $st->execute([$kelasId]);
  $rata = [];
  foreach ($st->fetchAll() as $r) $rata[$r['siswa_id']] = (int)round((float)$r['rata']);

  $out = [];
  foreach ($rows as $a) {
    $b = [
      'id' => $a['id'], 'user_id' => $a['user_id'], 'nama' => $a['nama'],
      'nis' => $a['nis'], 'kelas' => $a['kelas'], 'gabung_pada' => $a['gabung_pada'],
      'jumlah_tugas' => $jumlahTugas,
      'terkumpul' => (int)($kumpul[$a['user_id']]['terkumpul'] ?? 0),
      'dinilai' => (int)($kumpul[$a['user_id']]['dinilai'] ?? 0),
      'rata_nilai' => $rata[$a['user_id']] ?? null,
    ];
    if ($lengkap) {
      $b['email'] = $a['email'];
      $b['status'] = $a['status'];
    }
    $out[] = $b;
  }
  return $out;
}

function rekap_kelas(PDO $pdo, array $kelas): array {
  $st = $pdo->prepare("SELECT * FROM tugas WHERE kelas_id=? AND status='terbit' ORDER BY created_at ASC, judul ASC");
  $st->execute([$kelas['id']]);
  $tugas = array_map(fn($t) => fmt_tugas($pdo, $t), $st->fetchAll());

  $outBaris = [];
  foreach (daftar_anggota($pdo, $kelas['id']) as $a) {
    $nilai = [];
    foreach ($tugas as $t) {
      $st = $pdo->prepare('SELECT p.*, ' . nilai_akhir_sql() . ' AS nilai_akhir FROM pengumpulan p
                           JOIN tugas t ON t.id=p.tugas_id WHERE p.tugas_id=? AND p.siswa_id=?');
      $st->execute([$t['id'], $a['user_id']]);
      $p = $st->fetch();
      $nilai[$t['id']] = $p && $p['nilai_akhir'] !== null ? (int)round((float)$p['nilai_akhir']) : null;
    }
    $outBaris[] = ['siswa' => ['id' => $a['user_id'], 'nama' => $a['nama'], 'nis' => $a['nis'], 'kelas' => $a['kelas']],
                  'nilai' => $nilai, 'rata_nilai' => $a['rata_nilai']];
  }
  return ['kelas' => fmt_kelas($pdo, $kelas), 'tugas' => $tugas, 'baris' => $outBaris];
}
