import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// The dev server proxies /api to the Express backend, so the session cookie is
// same-origin (no third-party cookie problems) and the API URL is never hard-coded.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    https: {
      key: fs.readFileSync(path.resolve('../server/certs/localhost-key.pem')),
      cert: fs.readFileSync(path.resolve('../server/certs/localhost-cert.pem')),
    },
    proxy: {
      '/api': { target: 'https://localhost:5000', changeOrigin: false, secure: false },
      '/network-lab-http': {
        target: 'http://localhost:5001',
        changeOrigin: false,
        rewrite: (pathname) => pathname.replace('/network-lab-http', '/network'),
      },
    },
  },
});
