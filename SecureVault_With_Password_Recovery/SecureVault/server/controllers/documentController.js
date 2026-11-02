'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const store = require('../utils/store');
const sec = require('../utils/crypto');
const { logEvent } = require('../utils/logger');
const { validateContent, extOf, cleanName, TYPES } = require('../middleware/upload');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unlinkQuiet = (p) => (p ? fs.promises.unlink(p).catch(() => {}) : Promise.resolve());
const userDir = (userId) => path.join(config.storageDir, userId);

// Public view of a document: never includes keys, IV, auth tag or storage paths.
const view = (d) => ({
  id: d.id,
  originalName: d.originalName,
  mimeType: d.mimeType,
  size: d.size,
  description: d.description,
  sha256: d.sha256,
  uploadedAt: d.uploadedAt,
  encryption: { cipher: 'AES-256-GCM', keyWrap: 'RSA-2048 OAEP (SHA-256)' },
  integrity: { lastVerifiedAt: d.lastVerifiedAt || null, lastResult: d.lastVerifyResult ?? null },
});

// Ownership is enforced here for every single-document operation. A document owned
// by someone else is indistinguishable from a missing one (404).
async function findOwned(req, res) {
  const id = req.params.id;
  if (!UUID_RE.test(id)) { res.status(404).json({ error: 'Document not found.' }); return null; }
  const docs = await store.read('documents');
  const doc = docs.find((d) => d.id === id && d.userId === req.user.id);
  if (!doc) { res.status(404).json({ error: 'Document not found.' }); return null; }
  return doc;
}

async function readCiphertext(doc) {
  return fs.promises.readFile(path.join(userDir(doc.userId), doc.storedFile));
}

async function recordVerification(docId, ok) {
  await store.update('documents', (docs) => {
    const d = docs.find((x) => x.id === docId);
    if (d) { d.lastVerifiedAt = new Date().toISOString(); d.lastVerifyResult = ok; }
  });
}

exports.upload = async (req, res) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received. Choose a file to upload.' });
    if (req.file.size === 0) return res.status(400).json({ error: 'The file is empty.' });

    const ext = extOf(req.file.originalname);
    if (!(await validateContent(tmpPath, ext))) {
      await logEvent(req, { userId: req.user.id, username: req.user.username, type: 'DOCUMENT_UPLOAD', success: false, detail: `Rejected: content does not match .${ext}` });
      return res.status(400).json({ error: `File content does not look like a valid .${ext} file.`, code: 'INVALID_FILE_CONTENT' });
    }

    const plaintext = await fs.promises.readFile(tmpPath);
    const id = crypto.randomUUID();
    const enc = sec.encryptDocument(plaintext, req.user.id, id);
    const storedFile = `${crypto.randomUUID()}.enc`;
    await fs.promises.mkdir(userDir(req.user.id), { recursive: true });
    await fs.promises.writeFile(path.join(userDir(req.user.id), storedFile), enc.ciphertext, { mode: 0o600 });

    const description = String((req.body || {}).description || '').trim().slice(0, 200);
    const doc = {
      id,
      userId: req.user.id,
      originalName: cleanName(req.file.originalname),
      mimeType: TYPES[ext].mime,
      size: req.file.size,
      description,
      storedFile,
      sha256: enc.sha256,
      ciphertextSha256: enc.ciphertextSha256,
      iv: enc.iv,
      authTag: enc.authTag,
      encryptedKey: enc.encryptedKey,
      uploadedAt: new Date().toISOString(),
      lastVerifiedAt: null,
      lastVerifyResult: null,
    };
    try {
      await store.update('documents', (docs) => { docs.push(doc); });
    } catch (err) {
      await unlinkQuiet(path.join(userDir(req.user.id), storedFile));
      throw err;
    }
    await logEvent(req, { userId: req.user.id, username: req.user.username, type: 'DOCUMENT_UPLOAD', detail: `Uploaded and encrypted "${doc.originalName}" (${doc.size} bytes)` });
    res.status(201).json({ message: 'Document encrypted and stored securely.', document: view(doc) });
  } finally {
    await unlinkQuiet(tmpPath); // always remove the temporary plaintext file
  }
};

exports.list = async (req, res) => {
  const docs = await store.read('documents');
  const mine = docs.filter((d) => d.userId === req.user.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json({ documents: mine.map(view) });
};

exports.verify = async (req, res) => {
  const doc = await findOwned(req, res);
  if (!doc) return;
  let ok = true;
  let reason = null;
  let actual = null;
  try {
    const result = sec.decryptDocument(await readCiphertext(doc), doc);
    actual = result.sha256;
  } catch (err) {
    if (err instanceof sec.IntegrityError) { ok = false; reason = err.message; }
    else if (err.code === 'ENOENT') { ok = false; reason = 'Encrypted file is missing from storage'; }
    else throw err;
  }
  await recordVerification(doc.id, ok);
  await logEvent(req, { userId: req.user.id, username: req.user.username, type: 'INTEGRITY_CHECK', success: ok, detail: ok ? `SHA-256 verified for "${doc.originalName}"` : `FAILED for "${doc.originalName}": ${reason}` });
  res.json({ intact: ok, expectedSha256: doc.sha256, actualSha256: actual, reason });
};

exports.download = async (req, res) => {
  const doc = await findOwned(req, res);
  if (!doc) return;
  let plaintext;
  try {
    plaintext = sec.decryptDocument(await readCiphertext(doc), doc).plaintext;
  } catch (err) {
    const missing = err.code === 'ENOENT';
    if (!(err instanceof sec.IntegrityError) && !missing) throw err;
    await recordVerification(doc.id, false);
    await logEvent(req, { userId: req.user.id, username: req.user.username, type: 'DOCUMENT_DOWNLOAD', success: false, detail: `Blocked "${doc.originalName}": ${missing ? 'file missing' : err.message}` });
    return res.status(409).json({ error: 'Integrity check failed - download blocked. The stored document may have been tampered with.', code: 'INTEGRITY_FAILED' });
  }
  await recordVerification(doc.id, true);
  await logEvent(req, { userId: req.user.id, username: req.user.username, type: 'DOCUMENT_DOWNLOAD', detail: `Decrypted and downloaded "${doc.originalName}"` });
  res.set({
    'Content-Type': doc.mimeType,
    'Content-Length': plaintext.length,
    'Cache-Control': 'no-store',
    'X-Document-SHA256': doc.sha256,
  });
  res.attachment(doc.originalName);
  res.end(plaintext);
};

exports.remove = async (req, res) => {
  const doc = await findOwned(req, res);
  if (!doc) return;
  await store.update('documents', (docs) => {
    const i = docs.findIndex((d) => d.id === doc.id && d.userId === req.user.id);
    if (i >= 0) docs.splice(i, 1);
  });
  await unlinkQuiet(path.join(userDir(doc.userId), doc.storedFile));
  await logEvent(req, { userId: req.user.id, username: req.user.username, type: 'DOCUMENT_DELETE', detail: `Deleted "${doc.originalName}"` });
  res.json({ message: 'Document deleted.' });
};
