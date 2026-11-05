<?php
// =============================================================
// lib/GCode.php - mesin simulasi bubut CNC (dipakai API scoring).
// Mendukung G00/G01/G02/G03/G90/G91 (MVP proposal §10.1).
// X diprogram sebagai DIAMETER, Z = posisi sepanjang benda kerja
// (negatif menjauhi chuck di Z=0). Harus paritas dengan engine
// frontend (lms-cnc-client/src/api.js).
// Konvensi busur: bidang X-Z dilihat dengan sumbu Z horizontal
// (membesar ke kanan = menjauhi chuck) dan X vertikal (membesar
// ke atas). G02 = searah jarum jam, G03 = berlawanan.
// R: radius busur. I/K: offset titik awal→pusat; I dalam
// radius-mm (setengah diameter), K dalam mm searah -Z.
// =============================================================

class GCode {
  const RES = 0.5;   // resolusi profil (mm)
  const TOL = 0.5;   // toleransi target (mm)

  public static function parse(string $text): array {
    $out = [];
    foreach (preg_split('/\r?\n/', $text) as $line) {
      $line = trim($line);
      if ($line === '' || str_starts_with($line, ';')) continue;
      // buang komentar dalam kurung (Fanuc style)
      $line = trim(preg_replace('/\(.*?\)/', '', $line));
      if ($line === '') continue;
      preg_match_all('/([A-Z])\s*(-?\d+(?:\.\d+)?)/i', $line, $m, PREG_SET_ORDER);
      $ins = ['raw' => $line];
      foreach ($m as $t) $ins[strtoupper($t[1])] = (float)$t[2];
      $out[] = $ins;
    }
    return $out;
  }

  /** Simulasi penuh. Return [profile, moves, events, resolution]. */
  public static function simulate(array $ins, float $stockD, float $stockL): array {
    $res = self::RES;
    $steps = (int)round($stockL / $res) + 1;
    $profile = array_fill(0, $steps, $stockD / 2);
    $stockR = $stockD / 2;

    $x = $stockD; $z = 0.0; $mode = 'abs';
    $moves = []; $events = [];
    $hasMode = false; $hasFeed = false;

    $zToIdx = function (float $zv) use ($steps, $res): int {
      $i = (int)round(-$zv / $res);
      return max(0, min($steps - 1, $i));
    };
    // titik (x=diameter, z) aman thd chuck? bahaya jika Z>0 (b<0) & radius < stock
    $chuckHit = function (float $px, float $pz) use ($stockR): bool {
      return (-$pz) < 0 && ($px / 2) < $stockR + 1.0 - 1e-9 && (-$pz) < -1e-9;
    };
    $cut = function (float $x1, float $z1, float $x2, float $z2) use (&$profile, $steps, $res, $zToIdx): void {
      $iA = $zToIdx(max($z1, $z2));
      $iB = $zToIdx(min($z1, $z2));
      $lo = max(0, min($iA, $iB)); $hi = min($steps - 1, max($iA, $iB));
      $rS = $x1 / 2; $rE = $x2 / 2;
      if ($lo === $hi) {
        if ($rE < $profile[$lo]) $profile[$lo] = max(0.0, $rE);
        return;
      }
      for ($i = $lo; $i <= $hi; $i++) {
        $t = ($i - $lo) / ($hi - $lo);
        $r = $z1 <= $z2 ? $rS + ($rE - $rS) * $t : $rE + ($rS - $rE) * (1 - $t);
        if ($r < $profile[$i]) $profile[$i] = max(0.0, $r);
      }
    };

    $first = true;
    foreach ($ins as $in) {
      $g = $in['G'] ?? null;
      if ($g === 90.0) { $mode = 'abs'; $hasMode = true; continue; }
      if ($g === 91.0) { $mode = 'inc'; $hasMode = true; continue; }
      if ($g === null) continue;
      $gi = (int)$g;
      if (!in_array($gi, [0, 1, 2, 3], true)) {
        if ($g == floor($g) && $g >= 0 && $g <= 99) {
          // kode G/M lain (mis. G28, M03) diabaikan simulator v1
          $events[] = ['type' => 'warn', 'msg' => "Baris \"{$in['raw']}\": G" . (int)$g . ' diabaikan simulator v1 (hanya G00/G01/G02/G03/G90/G91).'];
        }
        continue;
      }
      $tX = array_key_exists('X', $in) ? ($mode === 'abs' ? $in['X'] : $x + $in['X']) : $x;
      $tZ = array_key_exists('Z', $in) ? ($mode === 'abs' ? $in['Z'] : $z + $in['Z']) : $z;

      if ($tX < -1e-9) {
        $events[] = ['type' => 'err', 'msg' => "Baris \"{$in['raw']}\": diameter X tidak boleh negatif.", 'moveIndex' => count($moves)];
      }

      if ($gi === 0) {
        if (!$first) {
          // cek tabrakan rapid: sampling titik di sepanjang segmen,
          // tiap titik dibandingkan dgn profil pada Z-nya sendiri
          $segLen = abs($tX - $x) + abs($tZ - $z);
          $n = (int)max(1, min(400, ceil($segLen / 0.5)));
          for ($k = 1; $k <= $n; $k++) {
            $qx = $x + ($tX - $x) * $k / $n;
            $qz = $z + ($tZ - $z) * $k / $n;
            if ($qx / 2 < $profile[$zToIdx($qz)] - 0.05 || $chuckHit($qx, $qz)) {
              $events[] = ['type' => 'err', 'msg' => "Baris \"{$in['raw']}\": gerakan cepat (G00) menabrak material/chuck di Z≈" . round($qz, 1) . ".", 'moveIndex' => count($moves)];
              break;
            }
          }
        }
        $moves[] = ['x1' => $x, 'z1' => $z, 'x2' => $tX, 'z2' => $tZ, 'rapid' => true];
      } elseif ($gi === 1) {
        if (!isset($in['F'])) $events[] = ['type' => 'warn', 'msg' => "Baris \"{$in['raw']}\": G01 tanpa F (feed rate)."];
        elseif ($in['F'] > 2000) $events[] = ['type' => 'warn', 'msg' => "Baris \"{$in['raw']}\": F{$in['F']} berlebihan untuk bubut latihan."];
        if ($chuckHit($tX, $tZ)) $events[] = ['type' => 'err', 'msg' => "Baris \"{$in['raw']}\": pahat masuk zona chuck (Z>0 di dalam material).", 'moveIndex' => count($moves)];
        $cut($x, $z, $tX, $tZ);
        $moves[] = ['x1' => $x, 'z1' => $z, 'x2' => $tX, 'z2' => $tZ, 'rapid' => false];
      } else {
        // ---- G02 / G03 busur (feed) ----
        if (!isset($in['F'])) $events[] = ['type' => 'warn', 'msg' => "Baris \"{$in['raw']}\": busur tanpa F (feed rate)."];
        $a1 = $x / 2; $b1 = -$z;   // (radial, aksial)
        $a2 = $tX / 2; $b2 = -$tZ;
        $arc = self::arcPoints($a1, $b1, $a2, $b2, $in, $gi === 2);
        if (isset($arc['error'])) {
          $events[] = ['type' => 'err', 'msg' => "Baris \"{$in['raw']}\": {$arc['error']}", 'moveIndex' => count($moves)];
        } else {
          $px = $x; $pz = $z;
          foreach ($arc['points'] as $pt) {
            [$qx, $qz] = [$pt[0] * 2, -$pt[1]]; // kembali ke (diameter, Z)
            if ($chuckHit($qx, $qz)) {
              $events[] = ['type' => 'err', 'msg' => "Baris \"{$in['raw']}\": busur masuk zona chuck.", 'moveIndex' => count($moves)];
              break;
            }
            $cut($px, $pz, $qx, $qz);
            $moves[] = ['x1' => $px, 'z1' => $pz, 'x2' => $qx, 'z2' => $qz, 'rapid' => false, 'arc' => true];
            $px = $qx; $pz = $qz;
          }
        }
      }
      $x = $tX; $z = $tZ; $first = false;
    }

    if (!$hasMode) $events[] = ['type' => 'warn', 'msg' => 'Tidak ada G90/G91 - diasumsikan absolut (G90).'];
    $hasErr = false;
    foreach ($events as $e) if ($e['type'] === 'err') { $hasErr = true; break; }
    if (!$hasErr && count(array_filter($events, fn($e) => $e['type'] === 'warn')) === 0) {
      $events[] = ['type' => 'ok', 'msg' => 'Simulasi selesai tanpa tabrakan terdeteksi.'];
    }
    return ['profile' => $profile, 'moves' => $moves, 'events' => $events, 'resolution' => $res];
  }

  /** Titik-titik busur pada bidang (radial, aksial). Return ['points'=>...] atau ['error'=>...]. */
  private static function arcPoints(float $a1, float $b1, float $a2, float $b2, array $in, bool $cw): array {
    if (isset($in['I']) || isset($in['K'])) {
      $ca = $a1 + ($in['I'] ?? 0.0);
      $cb = $b1 + ($in['K'] ?? 0.0);
      $r = hypot($a1 - $ca, $b1 - $cb);
      if ($r < 1e-9) return ['error' => 'pusat busur sama dengan titik awal (I/K nol).'];
      if (abs(hypot($a2 - $ca, $b2 - $cb) - $r) > 0.5) {
        return ['error' => 'titik akhir tidak pada lingkaran I/K (selisih > 0.5 mm). Periksa I/K.'];
      }
    } elseif (isset($in['R'])) {
      $r = $in['R'];
      if ($r <= 0) return ['error' => 'R harus positif.'];
      $dx = $b2 - $b1; $dy = $a2 - $a1; // x=aksial(b), y=radial(a)
      $d = hypot($dx, $dy);
      if ($d < 1e-9) return ['error' => 'titik awal = titik akhir, busur tak terdefinisi.'];
      if ($r < $d / 2 - 1e-9) return ['error' => "R=$r terlalu kecil untuk jarak titik ($d mm)."];
      $mx = ($b1 + $b2) / 2; $my = ($a1 + $a2) / 2;
      $h = sqrt(max(0.0, $r * $r - ($d / 2) * ($d / 2)));
      $rx = -$dy / $d; $ry = $dx / $d; // normal kiri arah gerak
      $s = $cw ? -1 : 1; // CW → pusat di kanan arah gerak
      $cb = $mx + $s * $h * $rx; $ca = $my + $s * $h * $ry;
    } else {
      return ['error' => 'busur butuh R atau I/K (mis. G03 X20 Z-20 R5).'];
    }
    $ang1 = atan2($a1 - $ca, $b1 - $cb);
    $ang2 = atan2($a2 - $ca, $b2 - $cb);
    if ($cw) { // sudut mengecil (searah jarum jam pada bidang b-kanan/a-atas)
      $sweep = $ang1 - $ang2;
      while ($sweep <= 0) $sweep += 2 * M_PI;
    } else {
      $sweep = $ang2 - $ang1;
      while ($sweep <= 0) $sweep += 2 * M_PI;
    }
    if ($sweep < 1e-9) $sweep = 2 * M_PI;
    $len = $r * $sweep;
    $n = (int)max(8, min(200, ceil($len / 0.5)));
    $pts = [];
    for ($i = 1; $i <= $n; $i++) {
      $a = $cw ? $ang1 - $sweep * $i / $n : $ang1 + $sweep * $i / $n;
      $pts[] = [$ca + $r * sin($a), $cb + $r * cos($a)]; // (radial, aksial)
    }
    return ['points' => $pts];
  }

  /** Bandingkan profil hasil vs target. */
  public static function compare(array $profile, float $res, float $targetD, float $targetZ, float $stockL): array {
    $tol = self::TOL;
    $idx = (int)round($targetZ / $res);
    if ($idx >= count($profile)) return ['match' => false, 'diff' => null, 'detail' => 'Target di luar panjang stock.'];
    $got = $profile[max(0, $idx - 1)];
    $want = $targetD / 2;
    $diff = abs($got - $want);
    return [
      'match' => $diff <= $tol,
      'diff' => round($diff, 2),
      'detail' => 'Radius di Z≈' . $targetZ . 'mm: ' . round($got, 2) . 'mm (target ' . $want . 'mm, toleransi ±' . $tol . 'mm)',
    ];
  }

  /** Skor otomatis 0–100 (proposal §5.4): akurasi profil + jumlah kesalahan. */
  public static function score(array $events, ?array $cmp): array {
    $errs = 0; $warns = 0;
    foreach ($events as $e) {
      if ($e['type'] === 'err') $errs++;
      elseif ($e['type'] === 'warn') $warns++;
    }
    $s = 100 - 25 * $errs - 5 * $warns;
    if ($errs === 0 && $cmp && $cmp['diff'] !== null && !$cmp['match']) {
      $s -= $cmp['diff'] * 8;
    }
    $s = (int)max(0, min(100, round($s)));
    return ['skor' => $s, 'ada_error' => $errs > 0, 'jumlah_error' => $errs, 'jumlah_warning' => $warns];
  }
}
