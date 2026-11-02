'use strict';
const fs = require('fs');
const path = require('path');
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
    const server = app.listen(config.port, () => {
      console.log(`SecureVault API listening on http://localhost:${config.port}`);
      if (!mailer.isConfigured()) console.warn('[warn] EMAIL_USER / EMAIL_APP_PASSWORD are not set in server/.env - login cannot send OTP emails until they are configured.');
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((err) => { console.error('Failed to start:', err); process.exit(1); });
}

module.exports = { app, start };
