'use strict';
// End-to-end API test. Starts a throw-away server on port 5055 with temporary
// data/storage/key directories, so your real data is never touched.
// OTP emails are captured by a LOCAL fake SMTP server (127.0.0.1:2526) - this exercises the real
// Nodemailer code path but never contacts Gmail and never sends a real email.
// Run with: npm test
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');

const PORT = 5055;
const SMTP_PORT = 2526;
const MAIL_USER = 'vault.sender@gmail.com';
const MAIL_PASS_SPACED = 'abcd efgh ijkl mnop'; // Google displays app passwords with spaces; the server must strip them
const COOLDOWN = 2;
const BASE = `http://localhost:${PORT}/api`;
const TTL = 4;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'securevault-test-'));
const dirs = { data: path.join(tmp, 'data'), storage: path.join(tmp, 'storage'), keys: path.join(tmp, 'keys') };

let passed = 0;
let failed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const mailbox = []; // captured emails
function startFakeSmtp() {
  const srv = new SMTPServer({
    authOptional: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'],
    onAuth(auth, session, cb) {
      if (auth.username === MAIL_USER && auth.password === MAIL_PASS_SPACED.replace(/\s+/g, '')) return cb(null, { user: auth.username });
      cb(new Error('Invalid login'));
    },
    async onData(stream, session, cb) {
      try { mailbox.push({ ...(await simpleParser(stream)), at: Date.now() }); cb(); } catch (e) { cb(e); }
    },
  });
  return new Promise((resolve) => srv.listen(SMTP_PORT, '127.0.0.1', () => resolve(srv)));
}
const mailsTo = (addr) => mailbox.filter((m) => (m.to?.value || []).some((v) => v.address === addr));
async function waitOtp(addr, before) {
  for (let i = 0; i < 40; i++) {
    const list = mailsTo(addr);
    if (list.length > before) return (list[list.length - 1].text.match(/code is: (\d{6})/) || [])[1];
    await sleep(100);
  }
  return undefined;
}
const EMAILS = { alice: 'alice@example.com', bob: 'bob@example.com' };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, { json, form, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let body;
    if (json) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(BASE + url, { method, headers: h, body });
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) {
      const [pair] = c.split(';');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) this.cookie = '';
      else this.cookie = pair;
    }
    if (raw) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()), setCookie: sc };
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers, setCookie: sc };
  }
}

async function login(c, username, password) {
  const addr = EMAILS[username.toLowerCase()];
  const before = addr ? mailsTo(addr).length : 0;
  const r = await c.req('POST', '/auth/login', { json: { username, password } });
  if (r.status === 200 && addr) r.otp = await waitOtp(addr, before); // OTP is read from the captured EMAIL
  return r;
}
async function resend(c, addr) {
  const before = mailsTo(addr).length;
  const r = await c.req('POST', '/auth/resend-otp');
  if (r.status === 200) r.otp = await waitOtp(addr, before);
  return r;
}
async function fullLogin(c, username, password) {
  const r = await login(c, username, password);
  const v = await c.req('POST', '/auth/verify-otp', { json: { otp: r.otp } });
  return { r, v };
}
function uploadForm(name, buf, type = 'application/pdf', description = 'test doc') {
  const f = new FormData();
  f.append('file', new Blob([buf], { type }), name);
  f.append('description', description);
  return f;
}

async function main() {
  const smtp = await startFakeSmtp();
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dirs.data, STORAGE_DIR: dirs.storage, KEYS_DIR: dirs.keys,
      SESSION_SECRET: 'test-session-secret', OTP_HMAC_SECRET: 'test-otp-secret', OTP_TTL_SECONDS: String(TTL),
      AUTH_RATE_LIMIT_MAX: '1000', BCRYPT_ROUNDS: '4', MAX_FILE_SIZE_MB: '1',
      EMAIL_USER: MAIL_USER, EMAIL_APP_PASSWORD: MAIL_PASS_SPACED, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SMTP_SECURE: 'false',
      OTP_RESEND_COOLDOWN_SECONDS: String(COOLDOWN), RESEND_RATE_LIMIT_MAX: '1000',
      CLIENT_ORIGIN: 'http://localhost:5173', NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  const stop = () => { try { server.kill(); } catch {} try { smtp.close(); } catch {} };

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
      await sleep(250);
      if (i === 59) throw new Error('Server did not start:\n' + log);
    }
    console.log('\n[1] Startup');
    check('server starts and /api/health responds', true);
    check('RSA key pair generated at runtime', fs.existsSync(path.join(dirs.keys, 'private.pem')) && fs.existsSync(path.join(dirs.keys, 'public.pem')));
    check('data JSON files initialised as valid JSON', ['users', 'documents', 'logs'].every((n) => Array.isArray(JSON.parse(fs.readFileSync(path.join(dirs.data, n + '.json'), 'utf8')))));

    console.log('\n[2] Protected routes without authentication');
    const anon = new Client();
    for (const [m, u] of [['GET', '/dashboard'], ['GET', '/documents'], ['GET', '/logs'], ['POST', '/documents'], ['GET', '/documents/' + crypto.randomUUID() + '/download']]) {
      const r = await anon.req(m, u);
      check(`${m} ${u.slice(0, 20)} -> 401`, r.status === 401, `got ${r.status}`);
    }

    console.log('\n[3] Registration');
    const A = { username: 'alice', email: 'alice@example.com', password: 'Str0ngPass!' };
    const B = { username: 'bob', email: 'bob@example.com', password: 'An0therPass!' };
    check('weak password rejected', (await anon.req('POST', '/auth/register', { json: { ...A, password: 'short' } })).status === 400);
    check('bad username rejected', (await anon.req('POST', '/auth/register', { json: { ...A, username: 'a b' } })).status === 400);
    check('registration succeeds (201)', (await anon.req('POST', '/auth/register', { json: A })).status === 201);
    check('duplicate username rejected (409)', (await anon.req('POST', '/auth/register', { json: { ...A, email: 'x@example.com' } })).status === 409);
    check('second user registers', (await anon.req('POST', '/auth/register', { json: B })).status === 201);
    const usersRaw = fs.readFileSync(path.join(dirs.data, 'users.json'), 'utf8');
    check('password stored only as bcrypt hash', !usersRaw.includes(A.password) && /\$2[aby]\$/.test(usersRaw));

    console.log('\n[4] Login + OTP');
    const a = new Client();
    check('wrong password -> 401', (await login(a, 'alice', 'WrongPass1')).status === 401);
    check('unknown user -> 401 (same message)', (await login(a, 'nobody', 'WrongPass1')).data.error === 'Invalid username or password.');
    const l1 = await login(a, 'alice', A.password);
    check('correct password -> OTP required', l1.status === 200 && l1.data.otpRequired === true);
    check('login triggers an email to the registered address', mailsTo(A.email).length >= 1);
    const m1 = mailsTo(A.email)[mailsTo(A.email).length - 1];
    check('SMTP auth used EMAIL_USER + app password (spaces stripped)', m1 && m1.from?.value?.[0]?.address === MAIL_USER);
    check('email subject / HTML / expiry info', m1 && /verification code/i.test(m1.subject) && /<table/.test(m1.html) && new RegExp(TTL + ' seconds').test(m1.html) && m1.html.includes(l1.otp));
    check('OTP in email is six digits', /^\d{6}$/.test(l1.otp || ''));
    check('API response never contains the OTP', !('devOtp' in l1.data) && !JSON.stringify(l1.data).includes(l1.otp) && typeof l1.data.emailMasked === 'string' && !l1.data.emailMasked.includes('alice@'));
    check('expiry advertised', l1.data.expiresInSeconds === TTL);
    check('session cookie is HttpOnly + SameSite', l1.setCookie.some((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)));
    check('password step alone does NOT grant access', (await a.req('GET', '/dashboard')).status === 401);
    check('/me reports pending 2FA', (await a.req('GET', '/auth/me')).data.pending2FA === true);

    const wrong = l1.otp === '000000' ? '111111' : '000000';
    const w1 = await a.req('POST', '/auth/verify-otp', { json: { otp: wrong } });
    check('wrong OTP -> 401 with 2 attempts left', w1.status === 401 && w1.data.attemptsLeft === 2);
    await a.req('POST', '/auth/verify-otp', { json: { otp: wrong } });
    const w3 = await a.req('POST', '/auth/verify-otp', { json: { otp: wrong } });
    check('third wrong attempt locks the OTP', w3.status === 401 && w3.data.code === 'OTP_LOCKED');
    const afterLock = await a.req('POST', '/auth/verify-otp', { json: { otp: l1.otp } });
    check('correct OTP rejected after lockout', afterLock.status === 401 && afterLock.data.code === 'NO_PENDING');

    const l2 = await login(a, 'alice', A.password);
    console.log(`  ...waiting ${TTL + 1}s for OTP expiry`);
    await sleep((TTL + 1) * 1000);
    const exp = await a.req('POST', '/auth/verify-otp', { json: { otp: l2.otp } });
    check('expired OTP rejected', exp.status === 401 && exp.data.code === 'OTP_EXPIRED');

    const l3 = await login(a, 'alice', A.password);
    const ok = await a.req('POST', '/auth/verify-otp', { json: { otp: l3.otp } });
    check('valid OTP -> 200 and authenticated', ok.status === 200 && ok.data.user.username === 'alice');
    check('OTP is single-use (replay rejected)', (await a.req('POST', '/auth/verify-otp', { json: { otp: l3.otp } })).status === 401);
    check('/me reports authenticated', (await a.req('GET', '/auth/me')).data.authenticated === true);
    check('dashboard now reachable', (await a.req('GET', '/dashboard')).status === 200);

    console.log('\n[5] Upload + encryption');
    const plain = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('TOP-SECRET-MARKER-' + crypto.randomBytes(8).toString('hex') + '\n'), crypto.randomBytes(20000)]);
    const up = await a.req('POST', '/documents', { form: uploadForm('secret report.pdf', plain) });
    check('upload succeeds (201)', up.status === 201, JSON.stringify(up.data));
    const doc = up.data.document;
    check('response exposes no keys / iv / tag', doc && !('encryptedKey' in doc) && !('iv' in doc) && !('authTag' in doc) && !JSON.stringify(up.data).includes('encryptedKey'));
    const meta = JSON.parse(fs.readFileSync(path.join(dirs.data, 'documents.json'), 'utf8'))[0];
    const encPath = path.join(dirs.storage, meta.userId, meta.storedFile);
    const enc = fs.readFileSync(encPath);
    check('stored file is ciphertext (no plaintext marker)', !enc.includes('TOP-SECRET-MARKER') && enc.length === plain.length);
    check('AES key wrapped by RSA-2048 OAEP (256-byte blob)', Buffer.from(meta.encryptedKey, 'base64').length === 256);
    check('GCM: 12-byte IV, 16-byte tag', Buffer.from(meta.iv, 'base64').length === 12 && Buffer.from(meta.authTag, 'base64').length === 16);
    check('SHA-256 recorded correctly', meta.sha256 === crypto.createHash('sha256').update(plain).digest('hex'));
    check('temp plaintext files removed', fs.readdirSync(path.join(dirs.storage, '_tmp')).length === 0);
    check('.exe upload rejected', (await a.req('POST', '/documents', { form: uploadForm('evil.exe', Buffer.from('MZ....'), 'application/octet-stream') })).status === 400);
    check('fake PDF (wrong content) rejected', (await a.req('POST', '/documents', { form: uploadForm('fake.pdf', Buffer.from('just text, not a pdf')) })).status === 400);
    const big = await a.req('POST', '/documents', { form: uploadForm('big.pdf', Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1.5 * 1024 * 1024, 1)])) });
    check('oversized file rejected (413)', big.status === 413, `got ${big.status}`);
    check('temp dir still clean after rejections', fs.readdirSync(path.join(dirs.storage, '_tmp')).length === 0);

    console.log('\n[6] Listing, download, decryption, integrity');
    const list = await a.req('GET', '/documents');
    check('document listed', list.data.documents.length === 1 && list.data.documents[0].originalName === 'secret report.pdf');
    const dl = await a.req('GET', `/documents/${doc.id}/download`, { raw: true });
    check('download returns identical decrypted bytes', dl.status === 200 && dl.buf.equals(plain));
    check('download sent as attachment', /attachment/i.test(dl.headers.get('content-disposition') || ''));
    const v1 = await a.req('POST', `/documents/${doc.id}/verify`);
    check('SHA-256 integrity verification passes', v1.data.intact === true && v1.data.actualSha256 === meta.sha256);

    console.log('\n[7] Tamper detection');
    const tampered = Buffer.from(enc); tampered[100] ^= 0xff;
    fs.writeFileSync(encPath, tampered);
    const v2 = await a.req('POST', `/documents/${doc.id}/verify`);
    check('modified ciphertext detected', v2.data.intact === false, JSON.stringify(v2.data));
    const dl2 = await a.req('GET', `/documents/${doc.id}/download`);
    check('download blocked with 409 on tamper', dl2.status === 409 && dl2.data.code === 'INTEGRITY_FAILED');
    check('dashboard flags At Risk', (await a.req('GET', '/dashboard')).data.securityStatus.status === 'At Risk');
    fs.writeFileSync(encPath, enc);
    check('restored file verifies again', (await a.req('POST', `/documents/${doc.id}/verify`)).data.intact === true);
    // metadata hash tamper (ciphertext unchanged)
    const docsPath = path.join(dirs.data, 'documents.json');
    const origDocs = fs.readFileSync(docsPath, 'utf8');
    const m2 = JSON.parse(origDocs); m2[0].sha256 = '0'.repeat(64); fs.writeFileSync(docsPath, JSON.stringify(m2));
    check('wrong stored SHA-256 detected', (await a.req('POST', `/documents/${doc.id}/verify`)).data.intact === false);
    fs.writeFileSync(docsPath, origDocs);
    check('metadata restored', (await a.req('POST', `/documents/${doc.id}/verify`)).data.intact === true);

    console.log('\n[8] Ownership enforcement');
    const b = new Client();
    const { v: bv } = await fullLogin(b, 'bob', B.password);
    check('bob logs in with 2FA', bv.status === 200);
    check('bob sees no documents', (await b.req('GET', '/documents')).data.documents.length === 0);
    check("bob cannot download alice's file (404)", (await b.req('GET', `/documents/${doc.id}/download`)).status === 404);
    check("bob cannot verify alice's file (404)", (await b.req('POST', `/documents/${doc.id}/verify`)).status === 404);
    check("bob cannot delete alice's file (404)", (await b.req('DELETE', `/documents/${doc.id}`)).status === 404);
    check('bob dashboard shows 0 documents', (await b.req('GET', '/dashboard')).data.totalDocuments === 0);
    const bLogs = (await b.req('GET', '/logs')).data.logs;
    check("bob's logs contain none of alice's events", bLogs.every((l) => l.username === 'bob'));
    check("alice's file survived bob's attempts", (await a.req('GET', '/documents')).data.documents.length === 1);

    console.log('\n[9] Dashboard, logs, CSRF origin check');
    const dash = (await a.req('GET', '/dashboard')).data;
    check('dashboard stats are real', dash.totalDocuments === 1 && dash.totalSizeBytes === plain.length && dash.authentication.status === 'Two-factor verified');
    const evil = await a.req('POST', '/documents/' + doc.id + '/verify', { headers: { origin: 'http://evil.example' } });
    check('foreign Origin rejected (403)', evil.status === 403);

    console.log('\n[10] Logout and second login');
    check('logout succeeds', (await a.req('POST', '/auth/logout')).status === 200);
    check('session unusable after logout', (await a.req('GET', '/dashboard')).status === 401);
    await fullLogin(a, 'alice', A.password);
    const dash2 = (await a.req('GET', '/dashboard')).data;
    check('last login now populated', typeof dash2.lastLogin === 'string');
    const types = new Set((await a.req('GET', '/logs')).data.logs.map((l) => l.type));
    for (const t of ['REGISTER', 'LOGIN_FAILED', 'PASSWORD_VERIFIED', 'OTP_FAILED', 'OTP_EXPIRED', 'OTP_VERIFIED', 'LOGIN_SUCCESS', 'DOCUMENT_UPLOAD', 'DOCUMENT_DOWNLOAD', 'INTEGRITY_CHECK', 'LOGOUT']) {
      check(`security log contains ${t}`, types.has(t));
    }
    const logsRaw = fs.readFileSync(path.join(dirs.data, 'logs.json'), 'utf8');
    check('no OTP / password in logs', !logsRaw.includes(l3.otp + '"') && !logsRaw.includes(A.password));
    check('filter by type works', (await a.req('GET', '/logs?type=LOGOUT')).data.logs.every((l) => l.type === 'LOGOUT'));

    console.log('\n[11] Resend OTP: cooldown, invalidation, limits');
    const r1 = new Client();
    const rl = await login(r1, 'alice', A.password);
    const rs0 = await r1.req('POST', '/auth/resend-otp');
    check('immediate resend blocked by cooldown (429)', rs0.status === 429 && rs0.data.code === 'OTP_COOLDOWN');
    await sleep((COOLDOWN + 0.3) * 1000);
    const rs1 = await resend(r1, A.email);
    check('resend after cooldown sends a new email', rs1.status === 200 && /^\d{6}$/.test(rs1.otp || ''));
    if (rs1.otp !== rl.otp) {
      const old = await r1.req('POST', '/auth/verify-otp', { json: { otp: rl.otp } });
      check('previous OTP is invalid after resend', old.status === 401 && old.data.code === 'OTP_INVALID');
    }
    const okNew = await r1.req('POST', '/auth/verify-otp', { json: { otp: rs1.otp } });
    check('new OTP works', okNew.status === 200);
    check('resend without a pending login is rejected', (await new Client().req('POST', '/auth/resend-otp')).status === 401);

    const r2 = new Client();
    await login(r2, 'alice', A.password);
    let last;
    for (let i = 0; i < 3; i++) { await sleep((COOLDOWN + 0.3) * 1000); last = await resend(r2, A.email); }
    check('three resends allowed', last.status === 200);
    await sleep((COOLDOWN + 0.3) * 1000);
    const over = await r2.req('POST', '/auth/resend-otp');
    check('fourth resend refused and login must restart', over.status === 429 && over.data.code === 'OTP_RESEND_LIMIT');

    console.log('\n[12] Email delivery failure handling (fake SMTP goes down)');
    const x = new Client();
    const xl = await login(x, 'alice', A.password);          // SMTP up: pending OTP exists
    await new Promise((r) => smtp.close(r));                    // SMTP now unreachable
    await sleep((COOLDOWN + 0.3) * 1000);
    const rf = await x.req('POST', '/auth/resend-otp');
    check('failed resend returns 502 EMAIL_FAILED (no false success)', rf.status === 502 && rf.data.code === 'EMAIL_FAILED' && !rf.data.otpRequired);
    check('error reveals no SMTP internals', !/ECONN|127\.0\.0\.1|smtp|password/i.test(JSON.stringify(rf.data)));
    const y = new Client();
    const yl = await login(y, 'bob', B.password);
    check('login with failed email returns 502 EMAIL_FAILED', yl.status === 502 && yl.data.code === 'EMAIL_FAILED' && !yl.data.otpRequired);
    check('no pending OTP after failed login email', (await y.req('GET', '/auth/me')).data.pending2FA === false);
    check('verify-otp impossible after failed email', (await y.req('POST', '/auth/verify-otp', { json: { otp: '123456' } })).status === 401);
    check('dashboard stays locked after failed email', (await y.req('GET', '/dashboard')).status === 401);
    const okOld = await x.req('POST', '/auth/verify-otp', { json: { otp: xl.otp } });
    check('earlier delivered OTP still valid after failed resend', okOld.status === 200);
    const failLogs = (await x.req('GET', '/logs?type=OTP_EMAIL_FAILED')).data.logs;
    check('failure recorded in security log', failLogs.length >= 1 && failLogs.every((l) => l.success === false));

    console.log('\n[13] Email not configured');
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'securevault-test2-'));
    const s2 = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: '5056', DATA_DIR: path.join(tmp2, 'd'), STORAGE_DIR: path.join(tmp2, 's'), KEYS_DIR: path.join(tmp2, 'k'),
        SESSION_SECRET: 't', OTP_HMAC_SECRET: 't', BCRYPT_ROUNDS: '4', EMAIL_USER: '', EMAIL_APP_PASSWORD: '', AUTH_RATE_LIMIT_MAX: '1000' },
      stdio: 'ignore',
    });
    try {
      for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:5056/api/health')).ok) break; } catch {} await sleep(250); }
      const post = (u, body) => fetch('http://localhost:5056/api' + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await post('/auth/register', { username: 'carol', email: 'carol@example.com', password: 'Str0ngPass!' });
      const lr = await post('/auth/login', { username: 'carol', password: 'Str0ngPass!' });
      const lj = await lr.json();
      check('missing EMAIL_USER/EMAIL_APP_PASSWORD -> 503, no OTP flow', lr.status === 503 && lj.code === 'EMAIL_FAILED' && !lj.otpRequired);
    } finally { s2.kill(); fs.rmSync(tmp2, { recursive: true, force: true }); }

    console.log('\n[14] Delete');
    check('owner can delete document', (await a.req('DELETE', `/documents/${doc.id}`)).status === 200);
    check('encrypted file removed from disk', !fs.existsSync(encPath));
    check('listing is empty again', (await a.req('GET', '/documents')).data.documents.length === 0);
  } catch (err) {
    failed++;
    console.log('  ERROR', err.stack || err);
    console.log('--- server log ---\n' + log);
  } finally {
    stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
