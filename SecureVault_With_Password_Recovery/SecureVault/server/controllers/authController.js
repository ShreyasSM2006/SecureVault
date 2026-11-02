'use strict';
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const config = require('../config');
const store = require('../utils/store');
const sec = require('../utils/crypto');
const { logEvent } = require('../utils/logger');
const mailer = require('../utils/mailer');

const regenerate = (req) => new Promise((res, rej) => req.session.regenerate((e) => (e ? rej(e) : res())));
const destroy = (req) => new Promise((res) => req.session.destroy(() => res()));
let dummyHash;
const getDummyHash = () => (dummyHash ||= bcrypt.hash('not-a-real-password', config.bcryptRounds));

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (v) => (typeof v === 'string' ? v : '');

function passwordProblem(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password must be at most 128 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    return 'Password must contain an uppercase letter, a lowercase letter and a digit.';
  }
  return null;
}

// Builds a fresh OTP and its pending-login record. Only the HMAC of the OTP is kept.
function createOtp(userId, resends = 0) {
  const otp = sec.generateOtp();
  const nonce = sec.newNonce();
  const now = Date.now();
  return {
    otp,
    pending: {
      userId,
      nonce,
      otpHash: sec.hmacOtp(otp, nonce, userId), // only the HMAC is kept - never the OTP itself
      expiresAt: now + config.otpTtlSeconds * 1000,
      attempts: 0,
      resends,
      lastAttemptAt: now, // used for the resend cooldown
    },
  };
}

// Emails a new OTP. The session's pending record is replaced (invalidating any previous OTP)
// ONLY after the SMTP server accepted the message, so a failed send never reports success.
async function deliverOtp(req, user, resends = 0) {
  const { otp, pending } = createOtp(user.id, resends);
  await mailer.sendOtpEmail({ to: user.email, username: user.username, otp, ttlSeconds: config.otpTtlSeconds });
  pending.emailMasked = mailer.maskEmail(user.email);
  req.session.pending = pending;
}

const otpPayload = (req) => {
  const p = req.session.pending;
  return {
    otpRequired: true,
    expiresAt: p.expiresAt,
    expiresInSeconds: config.otpTtlSeconds,
    attemptsLeft: Math.max(0, config.otpMaxAttempts - p.attempts),
    emailMasked: p.emailMasked,
    resendAvailableAt: p.lastAttemptAt + config.otpResendCooldownSeconds * 1000,
    resendsLeft: Math.max(0, config.otpMaxResends - p.resends),
  };
};

// Safe, generic error for the client; details stay in the server console / security log.
async function emailFailure(req, res, err, user) {
  if (!(err instanceof mailer.MailError)) throw err;
  await logEvent(req, { userId: user.id, username: user.username, type: 'OTP_EMAIL_FAILED', success: false, detail: `OTP email not delivered (${err.code})` });
  const notConfigured = err.code === 'EMAIL_NOT_CONFIGURED';
  return res.status(notConfigured ? 503 : 502).json({
    error: notConfigured
      ? 'The email service is not configured on the server. Please contact the administrator.'
      : 'We could not send the verification email. Please try again in a moment.',
    code: 'EMAIL_FAILED',
  });
}

exports.register = async (req, res) => {
  const body = req.body || {};
  const username = str(body.username).trim();
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);

  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3-30 characters: letters, numbers or underscore.' });
  if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const pwErr = passwordProblem(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const user = {
    id: crypto.randomUUID(),
    username,
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    previousLoginAt: null,
  };
  const conflict = await store.update('users', (users) => {
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return 'Username is already taken.';
    if (users.some((u) => u.email === email)) return 'An account with this email already exists.';
    users.push(user);
    return null;
  });
  if (conflict) return res.status(409).json({ error: conflict });
  await logEvent(req, { userId: user.id, username, type: 'REGISTER', detail: 'Account created' });
  res.status(201).json({ message: 'Account created. You can now log in.' });
};

exports.login = async (req, res) => {
  const username = str((req.body || {}).username).trim();
  const password = str((req.body || {}).password);
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  const users = await store.read('users');
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  // Always run bcrypt so response time does not reveal whether the username exists.
  const ok = await bcrypt.compare(password, user ? user.passwordHash : await getDummyHash());

  if (!user || !ok) {
    await logEvent(req, { userId: user?.id || null, username: username.slice(0, 40), type: 'LOGIN_FAILED', success: false, detail: 'Invalid username or password' });
    return res.status(401).json({ error: 'Invalid username or password.', code: 'INVALID_CREDENTIALS' });
  }

  await regenerate(req); // prevent session fixation
  await logEvent(req, { userId: user.id, username: user.username, type: 'PASSWORD_VERIFIED', detail: 'Step 1 of 2 passed' });
  try {
    await deliverOtp(req, user);
  } catch (err) {
    return emailFailure(req, res, err, user); // no pending OTP -> no way to reach the dashboard
  }
  await logEvent(req, { userId: user.id, username: user.username, type: 'OTP_SENT', detail: 'OTP emailed to registered address' });
  res.json(otpPayload(req));
};

exports.resendOtp = async (req, res) => {
  const p = req.session.pending;
  if (!p) return res.status(401).json({ error: 'No login in progress. Please log in again.', code: 'NO_PENDING' });
  if (Date.now() > p.expiresAt + 5 * 60 * 1000) {
    delete req.session.pending; // password step is only valid for a short window
    return res.status(401).json({ error: 'Login session expired. Please log in again.', code: 'NO_PENDING' });
  }
  if (p.resends >= config.otpMaxResends) {
    delete req.session.pending;
    return res.status(429).json({ error: 'Too many OTP requests. Please log in again.', code: 'OTP_RESEND_LIMIT' });
  }
  const availableAt = p.lastAttemptAt + config.otpResendCooldownSeconds * 1000;
  if (Date.now() < availableAt) {
    return res.status(429).json({
      error: `Please wait ${Math.ceil((availableAt - Date.now()) / 1000)} second(s) before requesting another code.`,
      code: 'OTP_COOLDOWN',
      resendAvailableAt: availableAt,
    });
  }
  const users = await store.read('users');
  const user = users.find((u) => u.id === p.userId);
  if (!user) {
    delete req.session.pending;
    return res.status(401).json({ error: 'No login in progress. Please log in again.', code: 'NO_PENDING' });
  }
  try {
    await deliverOtp(req, user, p.resends + 1);
  } catch (err) {
    p.lastAttemptAt = Date.now(); // failed sends also trigger the cooldown; the previous OTP stays as it was
    return emailFailure(req, res, err, user);
  }
  await logEvent(req, { userId: user.id, username: user.username, type: 'OTP_SENT', detail: 'New OTP emailed (resend); previous OTP invalidated' });
  res.json(otpPayload(req));
};

exports.verifyOtp = async (req, res) => {
  const p = req.session.pending;
  if (!p) return res.status(401).json({ error: 'No login in progress. Please log in again.', code: 'NO_PENDING' });

  const users = await store.read('users');
  const user = users.find((u) => u.id === p.userId);
  const who = { userId: p.userId, username: user?.username };

  if (Date.now() > p.expiresAt) {
    delete req.session.pending;
    await logEvent(req, { ...who, type: 'OTP_EXPIRED', success: false, detail: 'OTP expired before verification' });
    return res.status(401).json({ error: 'OTP expired. Please log in again.', code: 'OTP_EXPIRED' });
  }

  const otp = str((req.body || {}).otp).trim();
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'OTP must be exactly 6 digits.', code: 'OTP_FORMAT' });

  p.attempts += 1;
  const valid = sec.safeEqualHex(sec.hmacOtp(otp, p.nonce, p.userId), p.otpHash);

  if (!valid) {
    const attemptsLeft = Math.max(0, config.otpMaxAttempts - p.attempts);
    if (attemptsLeft === 0) {
      delete req.session.pending; // OTP is burned after the maximum number of attempts
      await logEvent(req, { ...who, type: 'OTP_FAILED', success: false, detail: 'Maximum OTP attempts reached; OTP invalidated' });
      return res.status(401).json({ error: 'Too many incorrect attempts. Please log in again.', code: 'OTP_LOCKED', attemptsLeft: 0 });
    }
    await logEvent(req, { ...who, type: 'OTP_FAILED', success: false, detail: `Incorrect OTP (${attemptsLeft} attempt(s) left)` });
    return res.status(401).json({ error: `Incorrect OTP. ${attemptsLeft} attempt(s) left.`, code: 'OTP_INVALID', attemptsLeft });
  }

  // Success: OTP is consumed (single use) and the session is rotated.
  const userId = p.userId;
  await regenerate(req);
  req.session.userId = userId;
  req.session.twoFactorVerified = true;
  req.session.authenticatedAt = new Date().toISOString();

  const now = new Date().toISOString();
  await store.update('users', (all) => {
    const u = all.find((x) => x.id === userId);
    if (u) { u.previousLoginAt = u.lastLoginAt; u.lastLoginAt = now; }
  });
  await logEvent(req, { ...who, type: 'OTP_VERIFIED', detail: 'OTP verified successfully' });
  await logEvent(req, { ...who, type: 'LOGIN_SUCCESS', detail: 'Two-factor login completed' });
  res.json({ message: 'Verified.', user: { id: user.id, username: user.username, email: user.email } });
};

exports.logout = async (req, res) => {
  const { userId } = req.session || {};
  if (userId && req.session.twoFactorVerified) {
    const users = await store.read('users');
    await logEvent(req, { userId, username: users.find((u) => u.id === userId)?.username, type: 'LOGOUT', detail: 'User logged out' });
  }
  await destroy(req);
  res.clearCookie('sv.sid');
  res.json({ message: 'Logged out.' });
};

exports.me = async (req, res) => {
  const s = req.session || {};
  if (s.userId && s.twoFactorVerified) {
    const users = await store.read('users');
    const u = users.find((x) => x.id === s.userId);
    if (u) return res.json({ authenticated: true, pending2FA: false, user: { id: u.id, username: u.username, email: u.email } });
  }
  if (s.pending && Date.now() <= s.pending.expiresAt) {
    return res.json({
      authenticated: false,
      pending2FA: true,
      expiresAt: s.pending.expiresAt,
      attemptsLeft: Math.max(0, config.otpMaxAttempts - s.pending.attempts),
      emailMasked: s.pending.emailMasked,
      resendAvailableAt: s.pending.lastAttemptAt + config.otpResendCooldownSeconds * 1000,
    });
  }
  res.json({ authenticated: false, pending2FA: false });
};
