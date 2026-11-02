'use strict';
// Email delivery of one-time codes via Gmail SMTP (Nodemailer).
// Credentials are read from backend environment variables only (server/.env).
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter;

const isConfigured = () => Boolean(config.emailUser && config.emailAppPassword);

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,      // smtp.gmail.com
      port: config.smtpPort,      // 465
      secure: config.smtpSecure,  // true (implicit TLS)
      auth: { user: config.emailUser, pass: config.emailAppPassword },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "john.doe@gmail.com" -> "j*******@gmail.com"
function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return '***';
  return `${name[0]}${'*'.repeat(Math.max(2, Math.min(name.length - 1, 8)))}@${domain}`;
}

function buildMessage({ to, username, otp, ttlSeconds }) {
  const minutes = ttlSeconds % 60 === 0 ? `${ttlSeconds / 60} minute${ttlSeconds === 60 ? '' : 's'}` : `${ttlSeconds} seconds`;
  const subject = 'Your SecureVault verification code';
  const text = [
    `Hello ${username},`, '',
    `Your SecureVault verification code is: ${otp}`, '',
    `It expires in ${minutes} and can be used only once. You have 3 attempts.`,
    'If you did not try to sign in, please change your password - someone may know it.', '',
    '— SecureVault Security',
  ].join('\n');
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#070d1f;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070d1f;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;width:100%;background:#0f1a3a;border:1px solid #1f3270;border-radius:14px;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#4da3ff;letter-spacing:.3px;">&#128737; SecureVault</div>
          <div style="font-size:13px;color:#8b9bc4;margin-top:4px;">Two-Factor Authentication</div>
        </td></tr>
        <tr><td style="padding:16px 32px 0;color:#e8eeff;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;">Hello <strong>${esc(username)}</strong>,</p>
          <p style="margin:0 0 18px;">Use the verification code below to finish signing in to your vault:</p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px;">
          <div style="display:inline-block;padding:16px 28px;background:#0a1230;border:1px solid #2f81ff;border-radius:12px;font-size:34px;font-weight:700;letter-spacing:10px;color:#ffffff;font-family:'Courier New',monospace;">${esc(otp)}</div>
        </td></tr>
        <tr><td style="padding:18px 32px 0;color:#c4cff0;font-size:14px;line-height:1.6;text-align:center;">
          This code expires in <strong style="color:#ffffff;">${esc(minutes)}</strong> and can be used only once.<br/>You have 3 attempts.
        </td></tr>
        <tr><td style="padding:22px 32px 28px;color:#8b9bc4;font-size:12px;line-height:1.6;text-align:center;">
          Didn&rsquo;t try to sign in? Someone may know your password &mdash; please change it. Never share this code with anyone.
        </td></tr>
      </table>
      <div style="color:#55648f;font-size:11px;margin-top:14px;">Automated message from SecureVault. Please do not reply.</div>
    </td></tr>
  </table>
</body></html>`;
  return { from: `"SecureVault" <${config.emailUser}>`, to, subject, text, html };
}

class MailError extends Error {
  constructor(message, code) { super(message); this.name = 'MailError'; this.code = code; }
}

// Resolves only when the SMTP server has accepted the message for the recipient.
async function sendOtpEmail({ to, username, otp, ttlSeconds }) {
  if (!isConfigured()) throw new MailError('Email service is not configured', 'EMAIL_NOT_CONFIGURED');
  try {
    const info = await getTransporter().sendMail(buildMessage({ to, username, otp, ttlSeconds }));
    if (!info.accepted || !info.accepted.length) throw new Error('Recipient was not accepted by the SMTP server');
    return true;
  } catch (err) {
    // Log the reason server-side (never the OTP or credentials); give the client a generic message.
    console.error('[mail] OTP email failed:', err.code || err.responseCode || '', err.message);
    throw new MailError('Email delivery failed', err instanceof MailError ? err.code : 'EMAIL_SEND_FAILED');
  }
}


function buildPasswordResetMessage({ to, username, otp, ttlSeconds }) {
  const minutes = ttlSeconds % 60 === 0 ? `${ttlSeconds / 60} minute${ttlSeconds === 60 ? '' : 's'}` : `${ttlSeconds} seconds`;
  const subject = 'Your SecureVault password reset code';
  const text = [
    `Hello ${username},`, '',
    `Your SecureVault password reset code is: ${otp}`, '',
    `It expires in ${minutes} and can be used only once. You have 3 attempts.`,
    'If you did not request a password reset, you can ignore this email. Your password will not change.', '',
    '— SecureVault Security',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#070d1f;font-family:Arial,Helvetica,sans-serif;color:#e8eeff;">
    <div style="max-width:480px;margin:auto;padding:28px;background:#0f1a3a;border:1px solid #1f3270;border-radius:14px;text-align:center;">
      <div style="font-size:20px;font-weight:700;color:#4da3ff;">&#128737; SecureVault</div>
      <h2 style="font-size:20px;">Password reset requested</h2>
      <p>Hello <strong>${esc(username)}</strong>, use this code to reset your password:</p>
      <div style="display:inline-block;padding:16px 28px;background:#0a1230;border:1px solid #2f81ff;border-radius:12px;font-size:34px;font-weight:700;letter-spacing:10px;color:#fff;font-family:'Courier New',monospace;">${esc(otp)}</div>
      <p>This code expires in <strong>${esc(minutes)}</strong>. You have 3 attempts.</p>
      <p style="font-size:12px;color:#8b9bc4;">If you did not request this, ignore this email. Your password will remain unchanged. Never share this code.</p>
    </div></body></html>`;
  return { from: `"SecureVault" <${config.emailUser}>`, to, subject, text, html };
}

async function sendPasswordResetEmail({ to, username, otp, ttlSeconds }) {
  if (!isConfigured()) throw new MailError('Email service is not configured', 'EMAIL_NOT_CONFIGURED');
  try {
    const info = await getTransporter().sendMail(buildPasswordResetMessage({ to, username, otp, ttlSeconds }));
    if (!info.accepted || !info.accepted.length) throw new Error('Recipient was not accepted by the SMTP server');
    return true;
  } catch (err) {
    console.error('[mail] Password reset email failed:', err.code || err.responseCode || '', err.message);
    throw new MailError('Email delivery failed', err instanceof MailError ? err.code : 'EMAIL_SEND_FAILED');
  }
}

module.exports = { sendOtpEmail, sendPasswordResetEmail, isConfigured, maskEmail, MailError };
