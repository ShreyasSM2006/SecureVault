'use strict';
const rateLimit = require('express-rate-limit');
const config = require('../config');

const limiterOpts = (limit, message) => ({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: message, code: 'RATE_LIMITED' }),
});

const apiLimiter = rateLimit(limiterOpts(config.rateLimitMax, 'Too many requests. Please slow down.'));
const resendLimiter = rateLimit(limiterOpts(config.resendRateLimitMax, 'Too many OTP resend requests. Try again in 15 minutes.'));
const authLimiter = rateLimit(limiterOpts(config.authRateLimitMax, 'Too many authentication attempts. Try again in 15 minutes.'));

// Lightweight CSRF defence on top of SameSite cookies: reject state-changing
// requests whose Origin header is present but not an allowed origin.
function originCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  if (sameOrigin || config.clientOrigins.includes(origin)) return next();
  return res.status(403).json({ error: 'Origin not allowed.', code: 'BAD_ORIGIN' });
}

module.exports = { apiLimiter, authLimiter, resendLimiter, originCheck };
