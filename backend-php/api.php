<?php
// =============================================================
// api.php — front controller REST API LMS Simulator Bubut CNC.
// Produksi (Apache/shared hosting): taruh folder ini di
// public_html/api + aktifkan .htaccess agar /api/* → api.php.
// Dev (XAMPP PHP):  php -S localhost:8000 api.php   (dari folder ini)
//
// Endpoint dipecah ke routes/<nama>.php sesuai docs/API-LMS.md.
// Handler yang cocok selalu mengirim respons dan selesai lewat json_out();
// handler yang tidak mengenali route langsung mengembalikan kendali.
// =============================================================
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/GCode.php';
require_once __DIR__ . '/lib/AITutor.php';
require_once __DIR__ . '/lib/Lms.php';

cors();

// file statis (dev server + fallback): /uploads/xxx
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
if (str_starts_with($uri, '/uploads/')) {
  $f = realpath(__DIR__ . $uri);
  $base = realpath(__DIR__ . '/uploads');
  if ($f && $base && str_starts_with($f, $base) && is_file($f)) {
    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    $mime = ['pdf' => 'application/pdf', 'png' => 'image/png', 'jpg' => 'image/jpeg',
             'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif'][$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Disposition: inline');
    header('X-Content-Type-Options: nosniff');
    readfile($f);
    exit;
  }
  json_out(['error' => 'File tidak ditemukan'], 404);
}

// normalisasi path → buang prefix direktori hingga /api
$path = $uri;
if (($pos = strpos($path, '/api')) !== false) $path = substr($path, $pos);
$seg = array_values(array_filter(explode('/', trim($path, '/')))); // ['api', route, id, anak]
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = ($method === 'GET' || $method === 'DELETE') ? [] : json_in();

if (($seg[0] ?? '') !== 'api') json_out(['error' => 'Endpoint tidak dikenal. Gunakan /api/...'], 404);
$route = $seg[1] ?? '';
$id = $seg[2] ?? null;

try {
  $pdo = db();
} catch (Throwable $e) {
  $msg = 'Gagal konek MySQL. Cek isi file .env (DB_HOST/DB_NAME/DB_USER/DB_PASS) dan pastikan tabel sudah diimpor.';
  if (envv('APP_DEBUG')) $msg .= ' Detail: ' . $e->getMessage();
  json_out(['error' => $msg], 500);
}

$HANDLER = [
  'auth'      => ['login', 'register', 'me', 'logout'],
  'users'     => ['users'],
  'kelas'     => ['kelas', 'export'],
  'materi'    => ['materi'],
  'modul'     => ['modules', 'module'],
  'tugas'     => ['tugas'],
  'penilaian' => ['pengumpulan', 'nilai'],
  'attempts'  => ['attempts'],
  'programs'  => ['programs'],
  'stats'     => ['stats', 'progress'],
  'aitutor'   => ['ai-tutor'],
];

foreach ($HANDLER as $file => $routes) {
  if (!in_array($route, $routes, true)) continue;
  require_once __DIR__ . '/routes/' . $file . '.php';
  $fn = 'r_' . $file;
  $fn($pdo, $route, $id, $method, $body, $seg);
}

json_out(['error' => 'Endpoint tidak dikenal'], 404);
