import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { authApi, errMsg } from '../services/api';
import { Alert, Button } from '../components/ui';
import '../styles/PasswordRecovery.css';

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || sessionStorage.getItem('sv-reset-email') || '';
  const [otp, setOtp] = useState('');
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendWait, setResendWait] = useState(30);

  useEffect(() => {
    if (!email) navigate('/forgot-password', { replace: true });
  }, [email, navigate]);

  useEffect(() => {
    if (resendWait <= 0) return undefined;
    const timer = setTimeout(() => setResendWait((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendWait]);

  const verify = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await authApi.verifyPasswordReset(otp); setVerified(true); setMessage('Email code verified. Choose a new password.'); }
    catch (err) { setError(errMsg(err, 'Could not verify the code.')); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    setError(''); setLoading(true);
    try { await authApi.resendPasswordReset(); setOtp(''); setResendWait(30); setMessage('A new recovery code has been sent. The previous code is invalid.'); }
    catch (err) { setError(errMsg(err, 'Could not resend the code.')); }
    finally { setLoading(false); }
  };

  const reset = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await authApi.confirmPasswordReset(password, confirmPassword);
      sessionStorage.removeItem('sv-reset-email');
      navigate('/login', { replace: true, state: { notice: result.message } });
    } catch (err) { setError(errMsg(err, 'Could not reset your password.')); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="glass auth-card">
        <div className="auth-logo"><ShieldCheck size={34} /></div>
        <h1>{verified ? 'Set new password' : 'Verify recovery code'}</h1>
        <p className="muted center">Recovery for {email}</p>
        <Alert type="error">{error}</Alert>
        <Alert type="success">{message}</Alert>
        {!verified ? (
          <form onSubmit={verify} noValidate>
            <label className="field"><span>Six-digit recovery code</span>
              <div className="input-wrap"><KeyRound size={17} />
                <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required placeholder="000000" maxLength={6} />
              </div>
            </label>
            <Button type="submit" loading={loading} disabled={otp.length !== 6}>Verify code</Button>
            <div className="reset-resend"><button type="button" className="link-btn" onClick={resend} disabled={loading || resendWait > 0}>Resend code {resendWait > 0 ? `(${resendWait}s)` : ''}</button></div>
          </form>
        ) : (
          <form onSubmit={reset} noValidate>
            <label className="field"><span>New password</span><div className="input-wrap"><KeyRound size={17} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} placeholder="At least 8 characters" /></div></label>
            <label className="field"><span>Confirm new password</span><div className="input-wrap"><KeyRound size={17} /><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required maxLength={128} placeholder="Re-enter new password" /></div></label>
            <p className="muted small">Use at least 8 characters, including uppercase, lowercase and a number.</p>
            <Button type="submit" loading={loading} disabled={!password || !confirmPassword}>Reset password</Button>
          </form>
        )}
        <p className="auth-switch"><Link to="/login"><ArrowLeft size={14} /> Back to login</Link></p>
      </div>
    </div>
  );
}
