<?php
// =============================================================
// routes/aitutor.php - umpan balik G-Code: cek otomatis (offline),
// LLM bila terkonfigurasi, plus rekomendasi latihan berikutnya.
// Menerima modul_id atau tugas_id (docs/API-LMS.md §8).
// =============================================================

function r_aitutor(PDO $pdo, string $route, ?string $id, string $method, array $body, array $seg): void {
  if ($route !== 'ai-tutor' || $method !== 'POST') return;
  $me = auth($pdo);
  $gcode = (string)($body['gcode'] ?? '');
  if (trim($gcode) === '') json_out(['error' => 'gcode wajib diisi'], 400);

  $modul = !empty($body['modul_id']) ? get_modul($pdo, $body['modul_id']) : null;
  if (!empty($body['modul_id']) && !$modul) json_out(['error' => 'Modul tidak ditemukan'], 404);
  $tugas = !empty($body['tugas_id']) ? cari_tugas($pdo, $body['tugas_id']) : null;
  if (!empty($body['tugas_id']) && !$tugas) json_out(['error' => 'Tugas tidak ditemukan'], 404);

  if ($tugas) {
    $target = target_tugas($pdo, $tugas);
    $konteks = ['id' => $tugas['id'], 'judul' => $tugas['judul'], 'deskripsi' => $tugas['instruksi'],
                'level' => $modul['level'] ?? 0, 'target' => $target];
  } else {
    $target = $modul ? $modul['target'] : target_baku();
    $konteks = $modul;
  }

  [$sim, $cmp, $sc] = run_sim($gcode, $target);
  $fb = AITutor::cekOtomatis($gcode, $sim, $konteks, $me);
  $source = 'rule-based (offline)';
  $llm = AITutor::denganLLM($gcode, $sim, $konteks, $me);
  if ($llm) { array_unshift($fb, $llm); $source = 'llm:' . envv('LLM_MODEL', 'gpt-4o-mini'); }
  $fb[] = '[skor otomatis] ' . $sc['skor'] . '/100 - ' . $cmp['detail'];

  $rekomendasi = AITutor::rekomendasi($pdo, $me['id'], $modul, all_modul($pdo));
  if (!$rekomendasi && $me['role'] === 'siswa') {
    // arah belajar siswa datang dari tugas yang belum dikerjakan, bukan pustaka
    foreach (daftar_tugas_siswa($pdo, $me) as $t) {
      if ($t['punya_saya'] && $t['punya_saya']['status'] === 'dinilai') continue;
      if ($t['id'] === ($tugas['id'] ?? null)) continue;
      $rekomendasi = ['tugas_id' => $t['id'], 'judul' => $t['judul'], 'level' => null,
                      'alasan' => 'Tugas ' . ($t['kelas_nama'] ?? '') . ' yang belum Anda kumpulkan.'];
      break;
    }
  }
  json_out(['source' => $source, 'feedback' => $fb, 'skor' => $sc['skor'],
            'ada_error' => $sc['ada_error'], 'match' => $cmp['match'],
            'target' => $target, 'rekomendasi' => $rekomendasi]);
}
