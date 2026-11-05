<?php
// =============================================================
// lib/AITutor.php - feedback edukatif atas G-Code siswa.
// 1) Cek otomatis (selalu jalan, offline).
// 2) Jika LLM_API_KEY diisi → panggil LLM OpenAI-compatible,
//    lalu gabungkan dengan hasil cek otomatis.
// 3) Rekomendasi modul berikutnya berdasar pola kesalahan
//    (proposal §9.1 nilai tambah).
// =============================================================

class AITutor {
  public static function cekOtomatis(string $gcode, array $sim, ?array $modul, ?array $user = null): array {
    $fb = [];
    $isGuru = ($user && ($user['role'] ?? '') === 'guru');

    // Jika input bukan kode G-Code (misal pertanyaan/konsultasi guru atau siswa)
    $hasGcode = preg_match('/G\d+|M\d+|X-?\d+|Z-?\d+/i', $gcode);
    if (!$hasGcode) {
      if ($isGuru) {
        return [
          'Halo Bapak/Ibu Guru! Untuk konsultasi AI (merancang soal, modul tugas, dan rubrik), pastikan LLM_API_KEY terkonfigurasi di file .env.',
          'Tips Cepat: Untuk membuat tugas praktik bubut baru, Anda dapat menentukan ukuran awal stock (mis. Ø40 L60) dan target pembubutan (mis. Ø20 Z-40).'
        ];
      }
      return [
        'Ketikkan perintah G-Code atau pertanyaan seputar pemrograman bubut CNC.',
        'Contoh kode awal: G90 (sistem absolut), G00 X40 Z2 (posisi aman), G01 X30 Z-20 F100 (pemakanan).'
      ];
    }
    if (!preg_match('/G9[01]/i', $gcode)) {
      $fb[] = 'Tambahkan G90 (absolut) atau G91 (inkremental) di awal agar sistem koordinat jelas.';
    }
    if (preg_match('/G0?[123]/i', $gcode) && !preg_match('/F\d+/i', $gcode)) {
      $fb[] = 'Gerak feed (G01/G02/G03) butuh feed rate F, mis. F100. Tanpa F mesin tak tahu kecepatan potong.';
    }
    foreach (preg_split('/\r?\n/', $gcode) as $i => $ln) {
      $t = trim(preg_replace('/\(.*?\)/', '', $ln));
      if ($t === '' || str_starts_with($t, ';')) continue;
      if (preg_match('/X\s*-\s*\d| X-\d/i', ' ' . $t)) {
        $fb[] = 'Baris ' . ($i + 1) . ': nilai X negatif - diameter tidak boleh negatif.';
      }
    }
    foreach ($sim['events'] as $e) {
      if ($e['type'] === 'err') {
        $fb[] = 'Tabrakan/error: ' . $e['msg'] . ' Perbaiki dengan menarik pahat ke X aman sebelum G00, mis. G00 X50 (di atas diameter stock).';
      } elseif ($e['type'] === 'warn') {
        $fb[] = 'Perhatian: ' . $e['msg'];
      }
    }
    if ($modul) {
      $tp = $modul['target'];
      $fb[] = "Target modul: Ø{$tp['target_d']} sepanjang {$tp['target_z']} mm dari stock Ø{$tp['stock_d']} L{$tp['stock_l']}. Cek panel hasil sebelum menyimpan percobaan.";
    }
    if (!$fb) $fb[] = 'G-Code lolos cek dasar dan tanpa tabrakan. Verifikasi geometri hasil vs target, lalu simpan sebagai percobaan.';
    return $fb;
  }

  /** Rekomendasi modul berikutnya: modul level terendah yg belum tuntas (skor<70) di atas level saat ini. */
  public static function rekomendasi(PDO $db, string $userId, ?array $modul, array $allModul): ?array {
    $best = [];
    $st = $db->prepare('SELECT modul_id, MAX(skor) m FROM percobaan WHERE user_id=? GROUP BY modul_id');
    $st->execute([$userId]);
    foreach ($st->fetchAll() as $r) $best[$r['modul_id']] = (int)$r['m'];
    $curLevel = $modul ? (int)$modul['level'] : 0;
    usort($allModul, fn($a, $b) => $a['level'] <=> $b['level']);
    foreach ($allModul as $m) {
      if ($m['level'] <= $curLevel) continue;
      if (($best[$m['id']] ?? 0) < 70) {
        return ['modul_id' => $m['id'], 'judul' => $m['judul'], 'level' => (int)$m['level'],
                'alasan' => 'Tantangan berikutnya setelah level ' . $curLevel . ' (belum tuntas, skor terbaik ' . ($best[$m['id']] ?? 0) . ').'];
      }
    }
    return null;
  }

  public static function denganLLM(string $gcode, array $sim, ?array $modul, ?array $siswa = null): ?string {
    $key = envv('LLM_API_KEY', '');
    $url = envv('LLM_API_URL', '');
    if (!$key || !$url) return null;

    $isGuru = ($siswa && ($siswa['role'] ?? '') === 'guru');
    $tugas = $modul ? $modul['judul'] . ' - ' . ($modul['deskripsi'] ?? '') : '-';
    $namaUser = $siswa['nama'] ?? 'pengguna';

    if ($isGuru) {
      // System prompt Asisten Guru CNC (CNC-TeacherBot)
      $systemPrompt = <<<PROMPT
Kamu adalah "CNC-TeacherBot", asisten AI cerdas untuk Guru Teknik Pemesinan Bubut CNC di tingkat SMK.

Tugasmu adalah mendampingi Bapak/Ibu guru dalam merancang, mengevaluasi, dan mengelola pembelajaran CNC:
1. Memberikan ide tugas praktik bubut CNC kreatif (tirus, bertingkat, ulir, alur, chamfer/radius) beserta estimasi parameter stock awal dan target akhir.
2. Membuat draf soal kuis (pilihan ganda dengan 4 opsi A/B/C/D atau soal uraian teknis) lengkap dengan kunci jawaban dan pembahasan mendalam.
3. Membantu merumuskan kriteria rubrik penilaian dan catatan umpan balik yang konstruktif untuk siswa.
4. Menjawab pertanyaan teknis pemesinan (rumus Cutting Speed Vc, Spindle Speed n = (1000 * Vc) / (pi * d), Feed rate F, pemilihan insert carbide/HSS, dan K3 bengkel mesin).
5. Menganalisis program G-Code siswa jika guru menyertakan kode untuk didiagnosis.

Gaya interaksi:
- Gunakan bahasa Indonesia yang santun, profesional, terstruktur, dan siap pakai dalam KBM.
- Berikan jawaban yang rapi dengan format poin-poin jelas.
- Sapa dengan hormat: "Bapak/Ibu $namaUser".
PROMPT;

      $userMessage = "Pertanyaan / Permintaan Guru:\n$gcode\n";
      if (!empty($sim['moves'])) {
        $userMessage .= "\nLampiran kode G-Code terdeteksi dengan hasil simulasi:\n" . substr(json_encode($sim['events'], JSON_UNESCAPED_UNICODE), 0, 1000);
      }
    } else {
      // System prompt CNC-Bot untuk Siswa (metode Sokratik)
      $systemPrompt = <<<PROMPT
Kamu adalah "CNC-Bot", seorang guru mentor senior bidang Teknik Pemesinan CNC yang ramah, sabar, dan menggunakan metode pembelajaran Sokratik untuk siswa SMK.

Tugasmu adalah membimbing siswa yang sedang belajar menulis G-Code.

Aturan interaksi:
1. Jangan pernah langsung memberikan kode jawaban yang benar secara utuh kepada siswa.
2. Jika siswa mengalami error atau collision, jelaskan di bagian mana letak kesalahannya secara ringkas (misal: koordinat X keliru atau kecepatan feed rate terlalu tinggi).
3. Berikan satu pertanyaan pemancing (pancingan berpikir) agar siswa dapat memperbaiki kodenya sendiri.
4. Gunakan bahasa Indonesia yang santai, memotivasi, dan mudah dipahami anak SMK (hindari istilah akademis yang terlalu rumit tanpa penjelasan).
5. Sapaan: sapa siswa dengan nama "$namaUser".

Format output:
- Mulai dengan sapaan singkat.
- Jelaskan temuan (maks 2-3 poin utama, ringkas).
- Akhiri dengan SATU pertanyaan pemancing berpikir.
- Maksimal 200 kata.
PROMPT;

      $userMessage = "Tugas: $tugas\n\nG-Code siswa:\n$gcode\n\n"
        . 'Hasil simulasi: ' . substr(json_encode($sim['events'], JSON_UNESCAPED_UNICODE), 0, 1500);

      if ($modul && isset($modul['target'])) {
        $tp = $modul['target'];
        $userMessage .= "\n\nTarget: diameter {$tp['target_d']}mm, panjang Z-{$tp['target_z']}mm dari stock diameter {$tp['stock_d']}mm panjang {$tp['stock_l']}mm.";
      }
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
      CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer $key"],
      CURLOPT_POSTFIELDS => json_encode([
        'model' => envv('LLM_MODEL', 'gpt-4o-mini'),
        'messages' => [
          ['role' => 'system', 'content' => $systemPrompt],
          ['role' => 'user', 'content' => $userMessage],
        ],
        'temperature' => $isGuru ? 0.7 : 0.5, 'max_tokens' => $isGuru ? 750 : 500,
      ]),
    ]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err || !$raw) return null;
    $data = json_decode($raw, true);
    $text = $data['choices'][0]['message']['content'] ?? null;
    return $text ?: null;
  }
}
