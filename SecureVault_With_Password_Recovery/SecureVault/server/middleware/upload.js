'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

// extension -> { canonical mime, accepted client mimes }
const TYPES = {
  pdf: { mime: 'application/pdf', accept: ['application/pdf'] },
  txt: { mime: 'text/plain', accept: ['text/plain'] },
  md: { mime: 'text/markdown', accept: ['text/markdown', 'text/x-markdown', 'text/plain'] },
  csv: { mime: 'text/csv', accept: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'] },
  png: { mime: 'image/png', accept: ['image/png'] },
  jpg: { mime: 'image/jpeg', accept: ['image/jpeg'] },
  jpeg: { mime: 'image/jpeg', accept: ['image/jpeg'] },
  gif: { mime: 'image/gif', accept: ['image/gif'] },
  doc: { mime: 'application/msword', accept: ['application/msword'] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', accept: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  xls: { mime: 'application/vnd.ms-excel', accept: ['application/vnd.ms-excel'] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', accept: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] },
  ppt: { mime: 'application/vnd.ms-powerpoint', accept: ['application/vnd.ms-powerpoint'] },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', accept: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'] },
};

const MAGIC = {
  pdf: [Buffer.from('%PDF')],
  png: [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  jpg: [Buffer.from([0xff, 0xd8, 0xff])],
  jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  gif: [Buffer.from('GIF8')],
  docx: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  xlsx: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  pptx: [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  doc: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  xls: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  ppt: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
};

const extOf = (name) => path.extname(name || '').slice(1).toLowerCase();
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

fs.mkdirSync(config.tmpDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.tmpDir),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.tmp`),
  }),
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => {
    const t = TYPES[extOf(file.originalname)];
    const mimeOk = t && (t.accept.includes(file.mimetype) || file.mimetype === 'application/octet-stream');
    if (!t || !mimeOk) {
      return cb(httpError(400, `File type not allowed. Allowed: ${Object.keys(TYPES).join(', ')}`, 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// Verifies file content matches its extension (magic bytes / text sanity check).
async function validateContent(filePath, ext) {
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    const head = buf.subarray(0, bytesRead);
    if (MAGIC[ext]) return MAGIC[ext].some((sig) => head.subarray(0, sig.length).equals(sig));
    return !head.includes(0); // txt / md / csv must not contain NUL bytes
  } finally {
    await fd.close();
  }
}

const cleanName = (raw) => {
  const utf8 = Buffer.from(raw || 'document', 'latin1').toString('utf8');
  const base = path.basename(utf8.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').trim();
  return (base || 'document').slice(0, 150);
};

module.exports = { upload, validateContent, extOf, cleanName, TYPES };
