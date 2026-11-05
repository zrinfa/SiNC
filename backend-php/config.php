<?php
// =============================================================
// config.php — koneksi MySQL (PDO), CORS, JSON, JWT manual, auth
// Tanpa composer agar mudah di-hosting shared hosting sekolah.
//
// Kredensial dibaca dengan urutan prioritas:
//   1. SetEnv/PassEnv di .htaccess atau environment server
//   2. file .env di folder ini (salin dari .env.example)
// Jadi untuk pindah hosting cukup edit .env, tidak menyentuh kode.
//
// Env: DB_HOST, DB_NAME, DB_USER, DB_PASS, JWT_SECRET,
//      CLIENT_URL (boleh koma, mis. http://localhost:5173),
//      APP_DEBUG (1 = tampilkan detail error, kosongkan di produksi),
//      LLM_API_URL, LLM_API_KEY, LLM_MODEL
// =============================================================

function env_file(string $path): array {
  if (!is_readable($path)) return [];
  $out = [];
  foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
    [$k, $v] = explode('=', $line, 2);
    $v = trim($v);
    if (strlen($v) > 1 && ($v[0] === '"' || $v[0] === "'") && $v[strlen($v) - 1] === $v[0]) {
      $v = substr($v, 1, -1);
    }
    $out[trim($k)] = $v;
  }
  return $out;
}

function envv($key, $default = null) {
  static $env = null;
  if ($env === null) $env = env_file(__DIR__ . '/.env');
  foreach ([getenv($key), $_SERVER[$key] ?? false, $env[$key] ?? false] as $v) {
    if ($v !== false && $v !== null && $v !== '') return $v;
  }
  return $default;
}

// Warning/fatal PHP tidak boleh tercetak ke body respons: klien JSON akan
// gagal parsing dan error sebenarnya tertutup HTML. Error selalu dicatat ke
// log (cPanel: Error Logs / error_log di folder ini); APP_DEBUG=1 menambah
// detailnya ke pesan JSON supaya mudah ditelusuri saat setup.
function harden_output(): void {
  error_reporting(E_ALL);
  ini_set('display_errors', '0');
  ini_set('log_errors', '1');
  set_exception_handler(function (Throwable $e) {
    if (headers_sent()) return;
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    $msg = 'Terjadi kesalahan pada server.';
    if (envv('APP_DEBUG')) $msg = get_class($e) . ': ' . $e->getMessage() . ' [' . $e->getFile() . ':' . $e->getLine() . ']';
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
  });
}
harden_output();

// Batas ukuran berkas dari php.ini ("8M", "1G") dalam byte.
function bytes_limit(string $key): int {
  $v = trim((string)ini_get($key));
  if ($v === '' || (float)$v <= 0) return 0;
  $n = (float)$v;
  switch (strtolower(substr($v, -1))) {
    case 'g': $n *= 1024;
    case 'm': $n *= 1024;
    case 'k': $n *= 1024;
  }
  return (int)$n;
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $dsn = 'mysql:host=' . envv('DB_HOST', '127.0.0.1')
       . ';dbname=' . envv('DB_NAME', 'cnc_lms')
       . ';charset=utf8mb4';
  $pdo = new PDO($dsn, envv('DB_USER', 'root'), envv('DB_PASS', ''), [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $pdo;
}

function cors(): void {
  $allowed = array_map('trim', explode(',', envv('CLIENT_URL', 'http://localhost:5173')));
  // Origin yang sama dengan host API selalu dipercaya, supaya deployment
  // satu domain (public_html + public_html/api) jalan tanpa mengisi CLIENT_URL.
  $host = $_SERVER['HTTP_HOST'] ?? '';
  if ($host !== '') {
    $allowed[] = 'http://' . $host;
    $allowed[] = 'https://' . $host;
  }
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
  }
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
}

function json_out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function json_in(): array {
  if (!empty($_POST)) return $_POST; // multipart/form-data
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $d = json_decode($raw, true);
  return is_array($d) ? $d : [];
}

// ---------- JWT HS256 minimal (tanpa library) ----------
function b64url_enc(string $b): string {
  return rtrim(strtr(base64_encode($b), '+/', '-_'), '=');
}
function b64url_dec(string $s): string {
  return base64_decode(strtr($s, '-_', '+/'));
}
function jwt_sign(array $payload): string {
  $secret = envv('JWT_SECRET', 'ganti-secret-ini');
  $h = b64url_enc(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
  $payload['exp'] = time() + 7 * 86400;
  $p = b64url_enc(json_encode($payload));
  $sig = b64url_enc(hash_hmac('sha256', "$h.$p", $secret, true));
  return "$h.$p.$sig";
}
function jwt_verify(string $token): ?array {
  $secret = envv('JWT_SECRET', 'ganti-secret-ini');
  $parts = explode('.', $token);
  if (count($parts) !== 3) return null;
  [$h, $p, $sig] = $parts;
  $expect = b64url_enc(hash_hmac('sha256', "$h.$p", $secret, true));
  if (!hash_equals($expect, $sig)) return null;
  $payload = json_decode(b64url_dec($p), true);
  if (!is_array($payload) || ($payload['exp'] ?? 0) < time()) return null;
  return $payload;
}

function current_user(): ?array {
  // Apache/LiteSpeed shared hosting sering membuang HTTP_AUTHORIZATION sebelum
  // sampai ke PHP; .htaccess meng-copy-nya ke env REDIRECT_HTTP_AUTHORIZATION.
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (stripos($h, 'Bearer ') === 0) {
    $u = jwt_verify(substr($h, 7));
    if ($u) return $u;
  }
  return null;
}
function require_auth(): array {
  $u = current_user();
  if (!$u) json_out(['error' => 'Token hilang/tidak valid'], 401);
  return $u;
}
function require_role(array $u, string ...$roles): void {
  if (!in_array($u['role'] ?? '', $roles, true)) json_out(['error' => 'Akses ditolak untuk peran ini'], 403);
}

function uuid4(): string {
  $b = random_bytes(16);
  $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
  $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
