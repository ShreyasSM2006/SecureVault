import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const tlsCertPath = fileURLToPath(new URL('../localhost+2.pem', import.meta.url));
const tlsKeyPath = fileURLToPath(new URL('../localhost+2-key.pem', import.meta.url));
const mkcertCaPath = process.env.LOCALAPPDATA
  ? `${process.env.LOCALAPPDATA}\\mkcert\\rootCA.pem`
  : `${os.homedir()}/.local/share/mkcert/rootCA.pem`;
const proxyHttpsAgent = fs.existsSync(mkcertCaPath)
  ? new https.Agent({ ca: fs.readFileSync(mkcertCaPath) })
  : undefined;

// The dev server proxies /api to the Express backend, so the session cookie is
// same-origin (no third-party cookie problems) and the API URL is never hard-coded.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    https: {
      key: fs.readFileSync(tlsKeyPath),
      cert: fs.readFileSync(tlsCertPath),
    },
    proxy: {
      '/api': { target: 'https://127.0.0.1:5000', changeOrigin: false, agent: proxyHttpsAgent },
      '/network-lab-http': {
        target: 'http://localhost:5001',
        changeOrigin: false,
        rewrite: (pathname) => pathname.replace('/network-lab-http', '/network'),
      },
    },
  },
});
