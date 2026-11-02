import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Express backend, so the session cookie is
// same-origin (no third-party cookie problems) and the API URL is never hard-coded.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: false } },
  },
});
