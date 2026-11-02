'use strict';
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.join(__dirname, '..');
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const dir = (v, d) => (v ? path.resolve(root, v) : path.join(root, d));

const unplaceholder = (v) => (/^\s*<.*>\s*$/.test(v || '') ? '' : v || '');
const warnings = [];
const secret = (name) => {
  if (process.env[name] && process.env[name] !== 'change-me') return process.env[name];
  warnings.push(`${name} is not set - using a random value for this run (run "npm run setup").`);
  return crypto.randomBytes(48).toString('hex');
};

const storageDir = dir(process.env.STORAGE_DIR, 'storage');

module.exports = {
  root,
  warnings,
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 5000),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  dataDir: dir(process.env.DATA_DIR, 'data'),
  storageDir,
  tmpDir: path.join(storageDir, '_tmp'),
  keysDir: dir(process.env.KEYS_DIR, 'keys'),
  clientDist: path.join(root, '..', 'client', 'dist'),
  sessionSecret: secret('SESSION_SECRET'),
  otpSecret: secret('OTP_HMAC_SECRET'),
  keyPassphrase: process.env.KEY_PASSPHRASE || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionMinutes: int(process.env.SESSION_MINUTES, 30),
  otpTtlSeconds: int(process.env.OTP_TTL_SECONDS, 120),
  otpMaxAttempts: 3,
  passwordResetTtlSeconds: int(process.env.PASSWORD_RESET_TTL_SECONDS, 120),
  passwordResetMaxAttempts: 3,
  passwordResetMaxResends: 3,
  passwordResetResendCooldownSeconds: int(process.env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS, 30),
  otpMaxResends: 3,
  otpResendCooldownSeconds: int(process.env.OTP_RESEND_COOLDOWN_SECONDS, 30),
  resendRateLimitMax: int(process.env.RESEND_RATE_LIMIT_MAX, 10),
  // Email (Gmail SMTP via Nodemailer). Credentials come ONLY from backend environment variables.
  // Untouched .env.example placeholders such as <MY_GMAIL_ADDRESS> count as "not configured".
  emailUser: unplaceholder(process.env.EMAIL_USER).trim(),
  emailAppPassword: unplaceholder(process.env.EMAIL_APP_PASSWORD).replace(/\s+/g, ''), // Google shows app passwords with spaces
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: int(process.env.SMTP_PORT, 465),
  smtpSecure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
  maxFileSizeMb: int(process.env.MAX_FILE_SIZE_MB, 10),
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
  rateLimitMax: int(process.env.RATE_LIMIT_MAX, 600),
  authRateLimitMax: int(process.env.AUTH_RATE_LIMIT_MAX, 30),
};
