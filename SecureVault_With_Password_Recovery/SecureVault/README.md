# SecureVault — Two-Factor Authenticated Secure Document Management System

SecureVault is a local, academic demonstration of a document vault that protects confidential files with
**two-factor authentication (password + one-time code)** and **layered cryptography**. Uploaded files are
encrypted on the server (AES-256-GCM), the per-file AES key is wrapped with RSA-2048, and a SHA-256 hash is
used to verify integrity every time a file is checked or downloaded.

> 📧 **Email OTP.** The one-time code is sent to the user's registered email address through **Gmail SMTP
> (Nodemailer)**. It is never shown in the UI or returned by the API. You must configure a Gmail address and a
> Google *App Password* in `server/.env` before login works — see **Gmail App Password setup** below.

## Features

- Registration, login (password), OTP verification (2nd factor), email-OTP password recovery, logout
- Login OTP and password-recovery OTP use Gmail SMTP + Nodemailer: 6 digits, **120-second expiry**, **3 attempts**, **single use**, HMAC-SHA-256 digest storage, resend cooldown and rate limiting
- Dashboard accessible only after full 2FA (server-enforced, not just hidden in the UI)
- Upload with file-type, content (magic-byte) and size validation; AES-256-GCM encryption; RSA-OAEP key wrapping
- My Documents: list, download (decrypt), SHA-256 integrity verification, delete, filter, copy hash
- Per-user ownership enforced on **every** document operation (other users' IDs return 404)
- Dashboard with real statistics: total documents, security status, last login, authentication status, recent activity
- Security logs: login success/failure, OTP verification, upload, download, delete, integrity checks, logout
- Dark-navy cybersecurity UI with glassmorphism, Inter font, Lucide icons, responsive sidebar layout

## Password recovery

The login page includes a **Forgot password?** flow. A user enters their registered email, receives a separate six-digit recovery OTP, verifies it, and sets a new password. Recovery OTPs are purpose-bound HMAC-SHA-256 digests stored in the server-side session, expire after 120 seconds, allow at most three attempts, and are single-use. Resending replaces the previous code. After a successful reset, existing sessions and pending login-OTP sessions for that account are invalidated; the user must sign in again with the new password and complete normal login OTP verification. Unknown email addresses receive a generic response to reduce account enumeration.

API endpoints: `POST /api/password-reset/request`, `/resend`, `/verify`, and `/confirm`.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, React Router, Axios, CSS3, Lucide React, Inter (self-hosted via `@fontsource`) |
| Backend | Node.js, Express 5, Node `crypto`, bcrypt, express-session, Multer, Helmet, express-rate-limit, dotenv, CORS, Nodemailer (Gmail SMTP) |
| Storage | JSON files (users, documents, logs) + encrypted files on the local filesystem. No external DB or paid API |

## Cryptographic algorithms

| # | Algorithm | Where / purpose |
|---|---|---|
| 1 | **bcrypt** (cost 12) | Password hashing. Plaintext passwords are never stored. |
| 2 | **`crypto.randomInt()`** | Cryptographically secure 6-digit OTP generation. |
| 3 | **HMAC-SHA-256** | OTPs are never stored; only `HMAC(secret, userId:nonce:otp)` is kept in the server-side session and compared with `timingSafeEqual`. |
| 4 | **AES-256-GCM** | Encrypts each document with a fresh random 256-bit key and 96-bit IV. The auth tag detects tampering; user ID + document ID are bound as AAD. |
| 5 | **RSA-2048, RSA-OAEP / SHA-256** | Encrypts (wraps) only the 32-byte AES key — never the document itself. |
| 6 | **SHA-256** | Hash of the plaintext (and of the stored ciphertext) recorded at upload and re-checked on verify/download. |

**Upload flow:** temp file → magic-byte check → SHA-256(plaintext) → random AES key + IV → AES-256-GCM encrypt →
RSA-OAEP wrap AES key → write `<uuid>.enc` to `server/storage/<userId>/` → delete temp plaintext file (always, in `finally`).

**Download flow:** ownership check → verify ciphertext hash → RSA-unwrap AES key → AES-GCM decrypt (tag verified) →
SHA-256(plaintext) compared to stored hash (timing-safe) → send to user. Any mismatch blocks the download (HTTP 409).

## Folder structure

```
SecureVault/
├── package.json            convenience scripts (install:all, setup, server, client, build, test)
├── README.md  .gitignore
├── client/                 React + Vite frontend
│   ├── index.html  vite.config.js  package.json
│   └── src/
│       ├── main.jsx  App.jsx
│       ├── components/     Layout (sidebar), Guards (route protection), ui (Alert, Button, Badge...)
│       ├── context/        AuthContext (session state)
│       ├── pages/          Login, Register, VerifyOtp, ForgotPassword, ResetPassword, Dashboard, UploadDocument, MyDocuments, SecurityLogs
│       ├── services/       api.js (Axios instance + endpoints)
│       ├── styles/         global.css, PasswordRecovery.css
│       └── utils/          format.js
└── server/                 Express backend
    ├── server.js  package.json  .env.example
    ├── config/             environment configuration
    ├── controllers/        auth, passwordReset, document, dashboard, log
    ├── middleware/         auth (requireAuth), security (rate limit, origin check), upload (Multer + validation)
    ├── routes/             API routes, passwordResetRoutes.js
    ├── utils/              crypto.js, store.js (JSON storage), logger.js, mailer.js (Gmail SMTP)
    ├── scripts/            setup.js (creates .env + RSA keys), test.js (end-to-end tests)
    ├── data/               users.json, documents.json, logs.json (created empty; git-ignored once they hold data)
    ├── storage/            encrypted documents (one folder per user)
    └── keys/               RSA key pair (generated locally - never shipped)
```

## Installation (Windows — PowerShell or Command Prompt)

Requires **Node.js 18.12+** (LTS recommended). After extracting `SecureVault.zip`:

```bat
cd SecureVault
npm run install:all
npm run setup
```

`npm run setup` creates `server\.env` with freshly generated random secrets and generates the RSA-2048 key pair
in `server\keys\`. (Manual alternative: copy `server\.env.example` to `server\.env` and edit it; keys are also
auto-generated on first server start.)

Then add your Gmail details to `server\.env` (next section) **before** starting the server.

## Gmail App Password setup

1. Sign in to the Google account that will **send** the OTP emails and turn on **2-Step Verification**
   (https://myaccount.google.com/security). App Passwords are unavailable without it.
2. Open https://myaccount.google.com/apppasswords, create an app password (name it e.g. `SecureVault`) and copy the
   16-character code. Spaces are optional — the server strips them.
3. Open `server\.env` and set:
   ```env
   EMAIL_USER=yourname@gmail.com
   EMAIL_APP_PASSWORD=abcdefghijklmnop
   ```
4. Restart the backend (`npm run server`). OTP emails go to the **email address entered at registration**, so
   register with an inbox you can open (it can be the same Gmail account). Check Spam if it doesn't arrive.

Credentials are read only by the backend from `server/.env` (which is git-ignored and not in the ZIP) and are never sent
to the browser. Use a **new** app password for this project and revoke it when you are done. If the credentials
are missing or wrong, login shows a safe error and does not grant access.

If `bcrypt` fails to install, use a current Node LTS (bcrypt 6 ships prebuilt binaries for Windows).

## Running

Open **two terminals** in the `SecureVault` folder:

```bat
:: Terminal 1 - HTTPS backend (https://localhost:5000)
npm run server

:: Terminal 2 - HTTPS frontend (https://localhost:5173)
npm run client
```

Open **https://localhost:5173**. Accept the browser's local certificate warning for the same self-signed certificate used by
Vite and Express. The Vite dev server proxies `/api` to the HTTPS backend, so application requests remain same-origin.

The local HTTP network-lab endpoint is **http://localhost:5001/network/http** and is reachable only from loopback.
It accepts only synthetic `message` values and rejects keys resembling passwords, OTPs, or documents. The API HTTPS
network endpoint is **https://localhost:5000/api/network/https**.

For a new local certificate, run:

```bat
cd server\certs
openssl req -x509 -newkey rsa:2048 -nodes -keyout localhost-key.pem -out localhost-cert.pem -sha256 -days 365 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

**Single-process alternative:** `npm run build`, then `npm run server`, and open http://localhost:5000
(Express serves the built React app).

### Run the automated tests

```bat
npm test
```

Starts a throw-away server on port 5055 with temporary data/keys (your data is untouched) and runs 100 checks:
registration, login, email OTP (expiry / attempts / single use / resend / email failure), protected routes, encryption,
decryption, SHA-256 and tamper detection, ownership isolation, logging, and more. The tests capture OTP emails with a
**local fake SMTP server** (they never contact Gmail and never use your real credentials).

## Environment variables (`server/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 5000 | API port (if you change it, also change the proxy target in `client/vite.config.js`) |
| `CLIENT_ORIGIN` | http://localhost:5173 | Allowed browser origin(s) for CORS / origin check |
| `SESSION_SECRET` | *(generated by setup)* | Signs the session cookie |
| `OTP_HMAC_SECRET` | *(generated by setup)* | Key for HMAC-SHA-256 of OTPs |
| `KEY_PASSPHRASE` | empty | Optional passphrase encrypting the RSA private key file. Set **before** first run |
| `COOKIE_SECURE` | false | Set `true` when served over HTTPS |
| `SESSION_MINUTES` | 30 | Idle session timeout |
| `OTP_TTL_SECONDS` | 120 | Login OTP lifetime |
| `PASSWORD_RESET_TTL_SECONDS` | 120 | Password recovery OTP lifetime |
| `PASSWORD_RESET_RESEND_COOLDOWN_SECONDS` | 30 | Wait time between password recovery OTP emails |
| `EMAIL_USER` | *(you set it)* | Gmail address that sends OTP emails |
| `EMAIL_APP_PASSWORD` | *(you set it)* | Google App Password for that account (not your normal password) |
| `OTP_RESEND_COOLDOWN_SECONDS` | 30 | Wait time between OTP emails |
| `RESEND_RATE_LIMIT_MAX` | 10 | Resend requests per IP per 15 min |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | smtp.gmail.com / 465 / true | Optional overrides (used by the tests to point at a local fake SMTP server) |
| `MAX_FILE_SIZE_MB` | 10 | Upload size limit |
| `BCRYPT_ROUNDS` | 12 | bcrypt cost factor |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | 600 / 30 | Requests per 15 min (general / auth endpoints) |

## Demo workflow

1. Open http://localhost:5173 → **Create an account** (password: 8+ chars with upper, lower, digit).
2. **Login** with username + password → you are taken to **Verify OTP**.
3. Open the email from SecureVault in the inbox you registered with and type the 6-digit code in. (Try a wrong code to see the attempt counter, wait 2 minutes to see expiry, or use **Resend code** after the cooldown.)
4. **Dashboard** shows live stats. Go to **Upload Document**, drop a PDF/image/text file, and submit.
5. **My Documents** → *Verify* (SHA-256 check), *Download* (decrypts), *Delete*.
6. Open `server/storage/<userId>/*.enc` — the contents are unreadable ciphertext.
7. **Tamper test:** flip a byte in an `.enc` file, click *Verify* → "Integrity failed"; download is blocked.
8. Register a second user: they cannot see or fetch the first user's documents.
9. **Security Logs** shows every event; **Logout** ends the session.

## Security notes & limitations

This is a teaching project, **not production-ready**. Known limitations:

- **JSON-file storage** has no transactions, indexing, or multi-process safety. Writes are atomic and serialised
  within one Node process only; do not run several server instances against the same files. It will not scale.
- **Metadata is unauthenticated.** An attacker with filesystem write access could alter both a ciphertext and its
  recorded hashes in `documents.json`. (AES-GCM's tag still protects against modification without the AES key, and
  the user/document-bound AAD prevents swapping ciphertexts between records.)
- **The RSA private key lives on the same server** as the data. Anyone who gets both can decrypt everything. Use
  `KEY_PASSPHRASE`, OS file permissions, or a KMS/HSM in real deployments. The server holds plaintext briefly in memory.
- **Sessions use the default in-memory store**: they reset when the server restarts and are not shared across instances.
- **Email OTP depends on Gmail SMTP.** Gmail may rate-limit or delay messages, and email is a weaker second factor than an authenticator app (TOTP) because anyone with access to the inbox gets the code. Personal Gmail accounts have a daily sending limit.
- Resend is limited to 3 per login and auth endpoints are rate-limited per IP, but there is **no account lockout**
  or CAPTCHA. Registration email ownership is not separately verified; password recovery is protected by a separate, purpose-bound email OTP flow.
- Served over plain HTTP locally. Use HTTPS + `COOKIE_SECURE=true` anywhere else.
- Uploads are limited by extension, MIME, magic bytes and size, but there is **no antivirus scanning**.
  Whole files are processed in memory (hence the 10 MB default limit).
- Logs are capped at the latest 5000 entries and are not tamper-evident. Users only see their own events.
- Not implemented: document sharing, versioning, admin role, key rotation, SMS delivery, email address verification at registration.
