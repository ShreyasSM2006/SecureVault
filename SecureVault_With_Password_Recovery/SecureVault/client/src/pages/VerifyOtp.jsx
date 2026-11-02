import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, RefreshCw, ShieldCheck, Timer } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../services/api';
import { Alert, Button, FullPageLoader } from '../components/ui';

const FATAL = ['OTP_EXPIRED', 'OTP_LOCKED', 'NO_PENDING', 'OTP_RESEND_LIMIT'];

export default function VerifyOtp() {
  const { loading: authLoading, authenticated, pending2FA, otp, verifyOtp, resendOtp, updateAttempts, setResendAt, cancelOtp } = useAuth();
  const navigate = useNavigate();
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [fatal, setFatal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const refs = useRef([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const cooldownLeft = otp?.resendAvailableAt ? Math.max(0, Math.ceil((otp.resendAvailableAt - now) / 1000)) : 0;
  const secondsLeft = otp?.expiresAt ? Math.max(0, Math.ceil((otp.expiresAt - now) / 1000)) : 0;
  const expired = pending2FA && secondsLeft === 0;
  const code = digits.join('');

  if (authLoading) return <FullPageLoader />;
  if (authenticated) return <Navigate to="/dashboard" replace />;
  if (!pending2FA && !fatal) return <Navigate to="/login" replace />;

  const setDigit = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[i] = d; setDigits(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };
  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const onPaste = (e) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!t) return;
    e.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, i) => t[i] || ''));
    refs.current[Math.min(t.length, 5)]?.focus();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (code.length !== 6) return setError('Enter all 6 digits.');
    setBusy(true);
    try {
      await verifyOtp(code);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Verification failed.'));
      const c = err?.response?.data?.code;
      if (FATAL.includes(c)) { setFatal(true); cancelOtp(); }
      else {
        if (typeof err?.response?.data?.attemptsLeft === 'number') updateAttempts(err.response.data.attemptsLeft);
        setDigits(Array(6).fill(''));
        refs.current[0]?.focus();
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(''); setInfo(''); setResending(true);
    try {
      await resendOtp();
      setDigits(Array(6).fill(''));
      setInfo('A new verification code has been sent to your email address.');
      refs.current[0]?.focus();
    } catch (err) {
      setError(errMsg(err, 'Could not resend code.'));
      const d = err?.response?.data;
      if (d?.resendAvailableAt) setResendAt(d.resendAvailableAt);
      else if (d?.code === 'EMAIL_FAILED') setResendAt(Date.now() + 30000);
      if (FATAL.includes(d?.code)) { setFatal(true); cancelOtp(); }
    } finally {
      setResending(false);
    }
  };

  if (fatal) {
    return (
      <div className="auth-page">
        <div className="glass auth-card center">
          <div className="auth-logo danger"><AlertTriangle size={34} /></div>
          <h1>Verification ended</h1>
          <Alert type="error">{error}</Alert>
          <Button icon={ArrowLeft} onClick={() => navigate('/login', { replace: true })}>Back to login</Button>
        </div>
      </div>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(1, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="auth-page">
      <div className="glass auth-card">
        <div className="auth-logo"><ShieldCheck size={34} /></div>
        <h1>Verify one-time code</h1>
        <p className="muted center">Step 2 of 2 — enter the 6-digit code</p>

        <Alert type="info">
          A verification code has been sent to your registered email address.
          {otp?.emailMasked && <> (<strong>{otp.emailMasked}</strong>)</>}
        </Alert>

        <div className={`timer ${secondsLeft <= 20 ? 'low' : ''}`}><Timer size={16} /> {expired ? 'Code expired' : `Expires in ${mm}:${ss}`}</div>

        <form onSubmit={submit}>
          <Alert type="error">{error}</Alert>
          <Alert type="success">{info}</Alert>
          <div className="otp-row" onPaste={onPaste}>
            {digits.map((d, i) => (
              <input key={i} ref={(el) => (refs.current[i] = el)} value={d} inputMode="numeric" maxLength={1}
                autoFocus={i === 0} aria-label={`Digit ${i + 1}`} autoComplete="one-time-code"
                onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} />
            ))}
          </div>
          <p className="muted center small">Attempts remaining: <strong>{otp?.attemptsLeft ?? 3}</strong></p>
          <Button type="submit" loading={busy} disabled={expired || code.length !== 6} icon={ShieldCheck}>Verify &amp; sign in</Button>
        </form>
        <div className="otp-actions">
          <button className="link-btn" onClick={resend} disabled={resending || cooldownLeft > 0}>
            <RefreshCw size={14} /> {cooldownLeft > 0 ? `Resend code in ${cooldownLeft}s` : resending ? 'Sending…' : 'Resend code'}
          </button>
          <button className="link-btn" onClick={() => { cancelOtp(); navigate('/login'); }}><ArrowLeft size={14} /> Cancel</button>
        </div>
      </div>
    </div>
  );
}
