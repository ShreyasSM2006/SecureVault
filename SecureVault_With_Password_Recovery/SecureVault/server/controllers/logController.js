'use strict';
const store = require('../utils/store');

exports.list = async (req, res) => {
  const { type, success } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const logs = await store.read('logs');
  let mine = logs.filter((l) => l.userId === req.user.id);
  const types = [...new Set(mine.map((l) => l.type))].sort();
  if (typeof type === 'string' && type) mine = mine.filter((l) => l.type === type);
  if (success === 'true' || success === 'false') mine = mine.filter((l) => String(l.success) === success);
  mine.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  res.json({
    total: mine.length,
    types,
    logs: mine.slice(0, limit).map(({ userId, ...rest }) => rest),
  });
};
