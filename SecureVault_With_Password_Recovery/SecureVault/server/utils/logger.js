'use strict';
const crypto = require('crypto');
const store = require('./store');

const MAX_LOGS = 5000;

// Security event logger. Never throws - logging must not break a request.
async function logEvent(req, { userId = null, username = null, type, success = true, detail = '' }) {
  try {
    const entry = {
      id: crypto.randomUUID(),
      userId,
      username,
      type,
      success,
      detail: String(detail).slice(0, 300),
      ip: req?.ip || null,
      userAgent: String(req?.get?.('user-agent') || '').slice(0, 200),
      timestamp: new Date().toISOString(),
    };
    await store.update('logs', (logs) => {
      logs.push(entry);
      if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    });
  } catch (err) {
    console.error('Failed to write security log:', err.message);
  }
}

module.exports = { logEvent };
