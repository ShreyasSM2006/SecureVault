'use strict';
// One-time setup: creates .env with random secrets and generates the RSA-2048 key pair.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const filled = example
    .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${crypto.randomBytes(48).toString('hex')}`)
    .replace(/^OTP_HMAC_SECRET=.*$/m, `OTP_HMAC_SECRET=${crypto.randomBytes(48).toString('hex')}`);
  fs.writeFileSync(envPath, filled, { mode: 0o600 });
  console.log('Created server/.env with freshly generated secrets.');
} else {
  console.log('server/.env already exists - leaving it unchanged.');
}

(async () => {
  const store = require('../utils/store');
  const sec = require('../utils/crypto');
  await store.init();
  const { generated } = await sec.loadKeys();
  console.log(generated ? 'Generated RSA-2048 key pair in server/keys/.' : 'RSA keys already exist - leaving them unchanged.');
  console.log('Setup complete. Start the API with: npm start');
})().catch((e) => { console.error(e); process.exit(1); });
