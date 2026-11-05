<?php
require __DIR__ . '/../lib/GCode.php';
function show($label, $gcode, $sd, $sl, $td, $tz) {
  $s = GCode::simulate(GCode::parse($gcode), $sd, $sl);
  $c = GCode::compare($s['profile'], $s['resolution'], $td, $tz, $sl);
  $sc = GCode::score($s['events'], $c);
  echo "== $label ==\nSkor: " . json_encode($sc, JSON_UNESCAPED_UNICODE) . "\n" . $c['detail'] . "\n";
  foreach ($s['events'] as $e) echo '[' . $e['type'] . '] ' . $e['msg'] . "\n";
  echo 'moves: ' . count($s['moves']) . "\n\n";
}
show('tirus benar', "G90\nG00 X40 Z0\nG01 X20 Z-40 F100\nG00 X50 Z5", 40, 60, 20, 40);
show('radius G03 R', "G90\nG00 X40 Z0\nG01 X30 Z-15 F100\nG03 X20 Z-20 R5 F80\nG00 X50 Z5", 40, 40, 30, 20);
show('salah (tanpa G90/F + rapid nabrak)', "G01 X20 Z-40\nG00 X10 Z-20", 40, 60, 20, 40);
show('R terlalu kecil', "G90\nG01 X30 Z-10 F100\nG02 X20 Z-30 R2 F80", 40, 40, 20, 30);
