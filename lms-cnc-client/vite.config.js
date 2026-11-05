import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// target backend untuk proxy dev; override dengan DEV_API_URL bila perlu.
// 127.0.0.1, bukan localhost, karena `php -S` hanya mendengarkan IPv4.
const BACKEND = process.env.DEV_API_URL || 'http://127.0.0.1:8000';
export default defineConfig({
  base: './', // aset relatif → bisa di-root public_html maupun subfolder
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // dev: teruskan ke server PHP (php -S localhost:8000 backend-php/api.php)
      '/api': BACKEND,
      '/uploads': BACKEND
    }
  }
});
