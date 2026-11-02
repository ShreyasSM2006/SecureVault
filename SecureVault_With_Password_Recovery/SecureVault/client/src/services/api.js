import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 60000 });

// Turn any axios error into a readable message.
export function errMsg(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.request && !err.response) return 'Cannot reach the server. Is the backend running on port 5000?';
  return fallback;
}

// Blob responses (downloads) carry JSON errors as a Blob - decode it.
export async function blobErrMsg(err, fallback) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).error || fallback; } catch { return fallback; }
  }
  return errMsg(err, fallback);
}

// If the session ends while the user is inside the app, tell the auth context.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && err.response.data?.code === 'UNAUTHENTICATED') {
      window.dispatchEvent(new Event('sv:unauthenticated'));
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  me: () => api.get('/auth/me').then((r) => r.data),
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  login: (body) => api.post('/auth/login', body).then((r) => r.data),
  verifyOtp: (otp) => api.post('/auth/verify-otp', { otp }).then((r) => r.data),
  resendOtp: () => api.post('/auth/resend-otp').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  requestPasswordReset: (email) => api.post('/password-reset/request', { email }).then((r) => r.data),
  resendPasswordReset: () => api.post('/password-reset/resend').then((r) => r.data),
  verifyPasswordReset: (otp) => api.post('/password-reset/verify', { otp }).then((r) => r.data),
  confirmPasswordReset: (password, confirmPassword) => api.post('/password-reset/confirm', { password, confirmPassword }).then((r) => r.data),
};

export const dataApi = {
  health: () => api.get('/health').then((r) => r.data),
  dashboard: () => api.get('/dashboard').then((r) => r.data),
  logs: (params) => api.get('/logs', { params }).then((r) => r.data),
  documents: () => api.get('/documents').then((r) => r.data.documents),
  upload: (file, description, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    form.append('description', description || '');
    return api.post('/documents', form, {
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    }).then((r) => r.data);
  },
  verify: (id) => api.post(`/documents/${id}/verify`).then((r) => r.data),
  remove: (id) => api.delete(`/documents/${id}`).then((r) => r.data),
  download: (id) => api.get(`/documents/${id}/download`, { responseType: 'blob' }),
};

export default api;
