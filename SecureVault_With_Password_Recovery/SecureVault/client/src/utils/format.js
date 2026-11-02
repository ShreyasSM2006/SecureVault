export function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const EVENT_LABELS = {
  REGISTER: 'Account registered',
  LOGIN_FAILED: 'Failed login',
  PASSWORD_VERIFIED: 'Password verified',
  OTP_ISSUED: 'OTP re-issued',
  OTP_SENT: 'OTP emailed',
  OTP_EMAIL_FAILED: 'OTP email failed',
  OTP_VERIFIED: 'OTP verified',
  OTP_FAILED: 'OTP failed',
  OTP_EXPIRED: 'OTP expired',
  LOGIN_SUCCESS: 'Successful login',
  LOGOUT: 'Logout',
  DOCUMENT_UPLOAD: 'Document upload',
  DOCUMENT_DOWNLOAD: 'Document download',
  DOCUMENT_DELETE: 'Document deleted',
  INTEGRITY_CHECK: 'Integrity check',
};
export const eventLabel = (t) => EVENT_LABELS[t] || t;
