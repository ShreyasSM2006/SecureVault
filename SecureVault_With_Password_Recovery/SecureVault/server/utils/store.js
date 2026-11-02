'use strict';
// Minimal JSON-file store. Writes are atomic (temp file + rename) and serialised
// per collection through a promise chain. Suitable for a single-process demo only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataDir } = require('../config');

const COLLECTIONS = ['users', 'documents', 'logs'];
const locks = new Map();
const file = (name) => path.join(dataDir, `${name}.json`);

async function read(name) {
  return JSON.parse(await fs.promises.readFile(file(name), 'utf8'));
}

async function write(name, data) {
  const tmp = `${file(name)}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  for (let i = 0; ; i++) {
    try {
      await fs.promises.rename(tmp, file(name));
      return;
    } catch (err) {
      // Windows may briefly lock the target file; retry a few times.
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        await fs.promises.unlink(tmp).catch(() => {});
        throw err;
      }
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
}

function update(name, fn) {
  const prev = locks.get(name) || Promise.resolve();
  const next = prev.then(async () => {
    const data = await read(name);
    const result = await fn(data);
    await write(name, data);
    return result;
  });
  locks.set(name, next.catch(() => {}));
  return next;
}

async function init() {
  await fs.promises.mkdir(dataDir, { recursive: true });
  for (const name of COLLECTIONS) {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(file(name), 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('must contain a JSON array');
    } catch (err) {
      if (err.code === 'ENOENT') await write(name, []);
      else throw new Error(`Cannot load ${file(name)}: ${err.message}`);
    }
  }
}

module.exports = { init, read, update };
