'use strict';
const store = require('../utils/store');
const config = require('../config');

exports.summary = async (req, res) => {
  const [docs, logs] = await Promise.all([store.read('documents'), store.read('logs')]);
  const mine = docs.filter((d) => d.userId === req.user.id);
  const myLogs = logs.filter((l) => l.userId === req.user.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const failedLast24h = myLogs.filter((l) => !l.success && l.type !== 'INTEGRITY_CHECK' && Date.parse(l.timestamp) >= dayAgo).length;
  const integrityFailures = mine.filter((d) => d.lastVerifyResult === false).length;
  const verified = mine.filter((d) => d.lastVerifyResult === true).length;

  let status = 'Secure';
  let statusDetail = 'Two-factor session active. All checked documents are intact.';
  if (integrityFailures > 0) {
    status = 'At Risk';
    statusDetail = `${integrityFailures} document(s) failed their integrity check.`;
  } else if (failedLast24h >= 3) {
    status = 'Warning';
    statusDetail = `${failedLast24h} failed security events in the last 24 hours.`;
  }

  res.json({
    user: { username: req.user.username, email: req.user.email },
    totalDocuments: mine.length,
    totalSizeBytes: mine.reduce((n, d) => n + d.size, 0),
    verifiedDocuments: verified,
    integrityFailures,
    failedEventsLast24h: failedLast24h,
    securityStatus: { status, detail: statusDetail },
    authentication: {
      status: 'Two-factor verified',
      method: 'Password + OTP (HMAC-SHA-256)',
      sessionStartedAt: req.session.authenticatedAt,
      sessionIdleTimeoutMinutes: config.sessionMinutes,
    },
    lastLogin: req.user.previousLoginAt, // previous successful login (null on first ever login)
    currentLogin: req.user.lastLoginAt,
    recentActivity: myLogs.slice(0, 8),
  });
};
