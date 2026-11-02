import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const EMPTY = { loading: true, authenticated: false, pending2FA: false, user: null, otp: null };

export function AuthProvider({ children }) {
  const [state, setState] = useState(EMPTY);

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setState((s) => ({
        loading: false,
        authenticated: me.authenticated,
        pending2FA: me.pending2FA,
        user: me.user || null,
        // pending-OTP details come from the server; the OTP itself is never sent to the browser
        otp: me.pending2FA ? { ...(s.otp || {}), expiresAt: me.expiresAt, attemptsLeft: me.attemptsLeft, emailMasked: me.emailMasked, resendAvailableAt: me.resendAvailableAt } : null,
      }));
    } catch {
      setState({ ...EMPTY, loading: false });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onExpired = () => setState({ ...EMPTY, loading: false });
    window.addEventListener('sv:unauthenticated', onExpired);
    return () => window.removeEventListener('sv:unauthenticated', onExpired);
  }, []);

  const startOtp = (data) =>
    setState({ loading: false, authenticated: false, pending2FA: true, user: null,
      otp: { expiresAt: data.expiresAt, attemptsLeft: data.attemptsLeft, emailMasked: data.emailMasked, resendAvailableAt: data.resendAvailableAt } });

  const actions = useMemo(() => ({
    refresh,
    login: async (username, password) => startOtp(await authApi.login({ username, password })),
    resendOtp: async () => startOtp(await authApi.resendOtp()),
    setResendAt: (resendAvailableAt) => setState((s) => (s.otp ? { ...s, otp: { ...s.otp, resendAvailableAt } } : s)),
    verifyOtp: async (otp) => {
      const data = await authApi.verifyOtp(otp);
      setState({ loading: false, authenticated: true, pending2FA: false, user: data.user, otp: null });
    },
    updateAttempts: (attemptsLeft) => setState((s) => (s.otp ? { ...s, otp: { ...s.otp, attemptsLeft } } : s)),
    cancelOtp: () => setState({ ...EMPTY, loading: false }),
    logout: async () => {
      try { await authApi.logout(); } finally { setState({ ...EMPTY, loading: false }); }
    },
  }), [refresh]);

  return <AuthContext.Provider value={{ ...state, ...actions }}>{children}</AuthContext.Provider>;
}
