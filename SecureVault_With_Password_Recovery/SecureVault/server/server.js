'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const config = require('./config');
const store = require('./utils/store');
const sec = require('./utils/crypto');
const mailer = require('./utils/mailer');
const routes = require('./routes');
const { apiLimiter, originCheck } = require('./middleware/security');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'sv.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionMinutes * 60 * 1000,
  },
}));

app.get('/api/health', (req, res) => res.json({ status: 'ok', maxFileSizeMb: config.maxFileSizeMb, otpTtlSeconds: config.otpTtlSeconds }));
app.post(['/api/network/http', '/api/network/https'], (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 500) : '';
  res.json({
    protocol: req.secure || req.socket.encrypted ? 'HTTPS' : 'HTTP',
    message,
    echo: `SecureVault received: ${message}`,
    tls: req.socket.encrypted ? {
      version: req.socket.getProtocol(),
      cipher: req.socket.getCipher()?.standardName || req.socket.getCipher()?.name || null,
    } : { version: null, cipher: null },
    localOnly: req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  });
});
app.use('/api', apiLimiter, originCheck, routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built React app if present (production-style run: npm run build in client/).
if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
  app.use(express.static(config.clientDist));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(config.clientDist, 'index.html')) : next()));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Maximum size is ${config.maxFileSizeMb} MB.`, code: 'FILE_TOO_LARGE' });
  }
  if (err.name === 'MulterError') return res.status(400).json({ error: err.message, code: 'UPLOAD_ERROR' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

async function start() {
  await store.init();
  const { generated } = await sec.loadKeys();
  config.warnings.forEach((w) => console.warn(`[warn] ${w}`));
  if (generated) console.log('[setup] Generated new RSA-2048 key pair in', config.keysDir);
  return new Promise((resolve) => {
    const keyPath = path.resolve(config.root, '..', 'localhost+2-key.pem');
    const certPath = path.resolve(config.root, '..', 'localhost+2.pem');
    const startListener = (server) => server.listen(config.port, '127.0.0.1', () => {
      console.log(`SecureVault API listening on ${config.https ? 'https' : 'http'}://localhost:${config.port}`);
      if (!mailer.isConfigured()) console.warn('[warn] EMAIL_USER / EMAIL_APP_PASSWORD are not set in server/.env - login cannot send OTP emails until they are configured.');
      resolve(server);
    });
    let server;
    if (config.https) {
      if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        throw new Error(`Local TLS files are missing: ${certPath} and ${keyPath}`);
      }
      server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app);
    } else {
      server = http.createServer(app);
    }
    startListener(server);

    const labApp = express();
    labApp.disable('x-powered-by');
    labApp.use(express.json({ limit: '1kb' }));
    labApp.post('/network/http', (req, res) => {
      const remote = req.socket.remoteAddress;
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return res.status(403).json({ error: 'Local access only.' });
      if (req.body && Object.keys(req.body).some((key) => /password|otp|document/i.test(key))) {
        return res.status(400).json({ error: 'Sensitive fields are not accepted by the network lab.' });
      }
      const message = typeof req.body?.message === 'string' ? req.body.message.slice(0, 500) : '';
      res.json({ protocol: 'HTTP', message, echo: `SecureVault HTTP lab received: ${message}`, tls: false, response: 'Delivered without TLS encryption.' });
    });
    if (config.env !== 'test' && process.env.SECUREVAULT_DISABLE_NETWORK_LAB !== '1') {
      http.createServer(labApp).listen(config.httpLabPort, '127.0.0.1', () => {
        console.log(`Network Security HTTP lab listening on http://localhost:${config.httpLabPort}`);
      });
    }
  });
}

if (require.main === module) {
  start().catch((err) => { console.error('Failed to start:', err); process.exit(1); });
}

module.exports = { app, start };
