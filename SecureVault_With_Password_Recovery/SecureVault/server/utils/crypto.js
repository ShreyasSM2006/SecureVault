'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

let publicKey;
let privateKey;

class IntegrityError extends Error {
  constructor(message) { super(message); this.name = 'IntegrityError'; }
}

/* ---------- RSA-2048 key management (generated at runtime, never shipped) ---------- */
async function loadKeys() {
  const pubPath = path.join(config.keysDir, 'public.pem');
  const privPath = path.join(config.keysDir, 'private.pem');
  await fs.promises.mkdir(config.keysDir, { recursive: true });
  let generated = false;
  if (!fs.existsSync(pubPath) || !fs.existsSync(privPath)) {
    const pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: config.keyPassphrase
        ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: config.keyPassphrase }
        : { type: 'pkcs8', format: 'pem' },
    });
    await fs.promises.writeFile(pubPath, pair.publicKey, { mode: 0o644 });
    await fs.promises.writeFile(privPath, pair.privateKey, { mode: 0o600 });
    generated = true;
  }
  publicKey = crypto.createPublicKey(await fs.promises.readFile(pubPath));
  privateKey = crypto.createPrivateKey({
    key: await fs.promises.readFile(privPath),
    passphrase: config.keyPassphrase || undefined,
  });
  return { generated };
}

/* ---------- SHA-256 helpers ---------- */
const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/* ---------- OTP: crypto.randomInt + HMAC-SHA-256 ---------- */
const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const newNonce = () => crypto.randomBytes(16).toString('hex');
const hmacOtp = (otp, nonce, userId) =>
  crypto.createHmac('sha256', config.otpSecret).update(`${userId}:${nonce}:${otp}`).digest('hex');

/* ---------- Documents: AES-256-GCM, AES key wrapped with RSA-OAEP/SHA-256 ---------- */
const aad = (userId, docId) => Buffer.from(`${userId}:${docId}`);

function encryptDocument(plaintext, userId, docId) {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    cipher.setAAD(aad(userId, docId));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const encryptedKey = crypto.publicEncrypt(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      aesKey
    );
    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      encryptedKey: encryptedKey.toString('base64'),
      sha256: sha256Hex(plaintext),
      ciphertextSha256: sha256Hex(ciphertext),
    };
  } finally {
    aesKey.fill(0);
  }
}

// Decrypts and verifies integrity; throws IntegrityError if anything was tampered with.
function decryptDocument(ciphertext, meta) {
  if (!safeEqualHex(sha256Hex(ciphertext), meta.ciphertextSha256)) {
    throw new IntegrityError('Stored ciphertext hash mismatch - the encrypted file was modified');
  }
  let aesKey;
  try {
    aesKey = crypto.privateDecrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(meta.encryptedKey, 'base64')
    );
  } catch {
    throw new IntegrityError('Unable to unwrap the AES key with the RSA private key');
  }
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(meta.iv, 'base64'));
    decipher.setAAD(aad(meta.userId, meta.id));
    decipher.setAuthTag(Buffer.from(meta.authTag, 'base64'));
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new IntegrityError('AES-GCM authentication tag mismatch - data was tampered with');
  } finally {
    aesKey.fill(0);
  }
  const actual = sha256Hex(plaintext);
  if (!safeEqualHex(actual, meta.sha256)) {
    throw new IntegrityError('SHA-256 of the decrypted document does not match the stored hash');
  }
  return { plaintext, sha256: actual };
}

module.exports = {
  IntegrityError, loadKeys, sha256Hex, safeEqualHex,
  generateOtp, newNonce, hmacOtp, encryptDocument, decryptDocument,
};
