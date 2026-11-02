'use strict';
const store = require('../utils/store');

// Requires a fully authenticated session: password AND OTP verified.
async function requireAuth(req, res, next) {
  const s = req.session;
  if (!s || !s.userId || s.twoFactorVerified !== true) {
    return res.status(401).json({ error: 'Authentication required. Please log in and verify your OTP.', code: 'UNAUTHENTICATED' });
  }
  const users = await store.read('users');
  const user = users.find((u) => u.id === s.userId);
  if (!user) {
    return req.session.destroy(() =>
      res.status(401).json({ error: 'Account no longer exists.', code: 'UNAUTHENTICATED' }));
  }
  req.user = user;
  next();
}

module.exports = { requireAuth };
