'use strict';
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const config = require('../config');
const store = require('../utils/store');
const sec = require('../utils/crypto');
const mailer = require('../utils/mailer');
const { logEvent } = require('../utils/logger');

const str = (v) => (typeof v === 'string' ? v : '');
const GENERIC_MESSAGE = 'If an account exists for that email, a password reset code has been sent.';

function savePendingReset(req, pending) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => {
    if (err) return reject(err);
    req.session.pendingPasswordReset = pending;
    req.session.save((saveErr) => saveErr ? reject(saveErr) : resolve());
  }));
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function createResetOtp(userId, resends = 0) {
  const otp = sec.generateOtp();
  const nonce = sec.newNonce();
  const now = Date.now();
  return {
    otp,
    pending: {
      userId,
      nonce,
      otpHash: sec.hmacOtp(otp, nonce, `password-reset:${userId}`),
      expiresAt: now + config.passwordResetTtlSeconds * 1000,
      attempts: 0,
      resends,
      lastSentAt: now,
    },
  };
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}

// Invalidate all sessions belonging to this account. The project currently uses
// express-session's MemoryStore, whose all() method allows this for the local demo.
function invalidateUserSessions(req, userId) {
  return new Promise((resolve) => {
    const sessionStore = req.sessionStore;
    if (!sessionStore || typeof sessionStore.all !== 'function') {
      return destroySession(req).then(resolve);
    }
    sessionStore.all((err, sessions) => {
      if (err || !sessions) return destroySession(req).then(resolve);
      const ids = Object.entries(sessions)
        .filter(([, data]) => data && (data.userId === userId || data.pending?.userId === userId || data.pendingPasswordReset?.userId === userId || data.passwordResetAuthorized?.userId === userId))
        .map(([id]) => id);
      if (req.sessionID && !ids.includes(req.sessionID)) ids.push(req.sessionID);
      if (!ids.length) return resolve();
      let remaining = ids.length;
      ids.forEach((id) => sessionStore.destroy(id, () => {
        remaining -= 1;
        if (remaining === 0) resolve();
      }));
    });
  });
}

exports.request = async (req, res) => {
  const email = str((req.body || {}).email).trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const users = await store.read('users');
  const user = users.find((u) => u.email === email);

  // Use a dummy session record for unknown addresses so the request and resend
  // endpoints do not reveal whether an account exists.
  if (!user) {
    const dummy = createResetOtp(null).pending;
    await savePendingReset(req, dummy);
    await logEvent(req, { type: 'PASSWORD_RESET_REQUEST', success: true, detail: 'Password reset request received' });
    return res.json({ message: GENERIC_MESSAGE });
  }

  const { otp, pending } = createResetOtp(user.id);
  try {
    await mailer.sendPasswordResetEmail({
      to: user.email,
      username: user.username,
      otp,
      ttlSeconds: config.passwordResetTtlSeconds,
    });
  } catch (err) {
    await logEvent(req, { userId: user.id, username: user.username, type: 'PASSWORD_RESET_EMAIL_FAILED', success: false, detail: `Password reset email failed (${err.code || 'EMAIL_ERROR'})` });
    // Don't disclose account existence or mail configuration to the browser.
    const dummy = createResetOtp(null).pending;
    await savePendingReset(req, dummy);
    return res.json({ message: GENERIC_MESSAGE });
  }

  await savePendingReset(req, pending);
  await logEvent(req, { userId: user.id, username: user.username, type: 'PASSWORD_RESET_OTP_SENT', detail: 'Password reset OTP sent by email' });
  return res.json({ message: GENERIC_MESSAGE });
};

exports.resend = async (req, res) => {
  const pending = req.session.pendingPasswordReset;
  if (!pending) return res.status(400).json({ error: 'Request a password reset code first.' });
  if (Date.now() > pending.expiresAt) {
    delete req.session.pendingPasswordReset;
    return res.status(400).json({ error: 'The reset code has expired. Request a new one.' });
  }
  if (pending.resends >= config.passwordResetMaxResends) {
    delete req.session.pendingPasswordReset;
    return res.status(429).json({ error: 'Resend limit reached. Start the password reset process again.' });
  }
  const availableAt = pending.lastSentAt + config.passwordResetResendCooldownSeconds * 1000;
  if (Date.now() < availableAt) {
    return res.status(429).json({ error: `Please wait ${Math.ceil((availableAt - Date.now()) / 1000)} seconds before requesting another code.`, resendAvailableAt: availableAt });
  }

  const users = await store.read('users');
  const user = pending.userId ? users.find((u) => u.id === pending.userId) : null;
  if (!user) {
    const dummy = createResetOtp(null, pending.resends + 1).pending;
    req.session.pendingPasswordReset = dummy;
    return res.json({ message: 'If an account exists, a new recovery code has been sent.' });
  }
  const next = createResetOtp(user.id, pending.resends + 1);
  try {
    await mailer.sendPasswordResetEmail({ to: user.email, username: user.username, otp: next.otp, ttlSeconds: config.passwordResetTtlSeconds });
  } catch (err) {
    pending.lastSentAt = Date.now();
    await logEvent(req, { userId: user.id, username: user.username, type: 'PASSWORD_RESET_EMAIL_FAILED', success: false, detail: `Password reset resend failed (${err.code || 'EMAIL_ERROR'})` });
    const dummy = createResetOtp(null, pending.resends + 1).pending;
    req.session.pendingPasswordReset = dummy;
    return res.json({ message: 'If an account exists, a new recovery code has been sent.' });
  }
  req.session.pendingPasswordReset = next.pending; // previous code is now invalid
  await logEvent(req, { userId: user.id, username: user.username, type: 'PASSWORD_RESET_OTP_RESENT', detail: 'New password reset OTP sent; previous code invalidated' });
  return res.json({ message: 'A new reset code has been sent.', expiresInSeconds: config.passwordResetTtlSeconds, resendAvailableAt: next.pending.lastSentAt + config.passwordResetResendCooldownSeconds * 1000 });
};

exports.verify = async (req, res) => {
  const pending = req.session.pendingPasswordReset;
  if (!pending) return res.status(400).json({ error: 'No active password reset request. Request a new code.' });
  if (Date.now() > pending.expiresAt) {
    delete req.session.pendingPasswordReset;
    return res.status(400).json({ error: 'The reset code has expired. Request a new one.' });
  }
  const otp = str((req.body || {}).otp).trim();
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Enter the six-digit code.' });

  pending.attempts += 1;
  const actual = sec.hmacOtp(otp, pending.nonce, `password-reset:${pending.userId}`);
  if (!sec.safeEqualHex(actual, pending.otpHash)) {
    const attemptsLeft = Math.max(0, config.passwordResetMaxAttempts - pending.attempts);
    if (!attemptsLeft) delete req.session.pendingPasswordReset;
    await logEvent(req, { userId: pending.userId, type: 'PASSWORD_RESET_OTP_FAILED', success: false, detail: `Incorrect reset OTP; ${attemptsLeft} attempt(s) left` });
    return res.status(400).json({ error: attemptsLeft ? `Incorrect code. ${attemptsLeft} attempt(s) left.` : 'Too many incorrect attempts. Request a new code.' });
  }

  const userId = pending.userId;
  await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
  req.session.passwordResetAuthorized = { userId, expiresAt: Date.now() + 5 * 60 * 1000, nonce: crypto.randomBytes(24).toString('hex') };
  await new Promise((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
  const user = (await store.read('users')).find((u) => u.id === userId);
  await logEvent(req, { userId, username: user?.username, type: 'PASSWORD_RESET_OTP_VERIFIED', detail: 'Password reset OTP verified' });
  return res.json({ message: 'Code verified. You can now set a new password.' });
};

function passwordProblem(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be at most 128 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return 'Password must contain an uppercase letter, a lowercase letter and a digit.';
  return null;
}

exports.confirm = async (req, res) => {
  const grant = req.session.passwordResetAuthorized;
  if (!grant || Date.now() > grant.expiresAt) {
    delete req.session.passwordResetAuthorized;
    return res.status(401).json({ error: 'Password reset authorization expired. Start again.' });
  }
  const password = str((req.body || {}).password);
  const confirmPassword = str((req.body || {}).confirmPassword);
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const result = await store.update('users', (users) => {
    const user = users.find((u) => u.id === grant.userId);
    if (!user) return null;
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date().toISOString();
    return { id: user.id, username: user.username };
  });
  if (!result) {
    await destroySession(req);
    return res.status(404).json({ error: 'Account no longer exists.' });
  }

  // Consume the reset grant and invalidate all sessions for this account.
  await invalidateUserSessions(req, grant.userId);
  await logEvent(req, { userId: result.id, username: result.username, type: 'PASSWORD_RESET_SUCCESS', detail: 'Password changed; existing sessions invalidated' });
  res.clearCookie('sv.sid');
  return res.json({ message: 'Password reset successful. Please log in with your new password.' });
};
