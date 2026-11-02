import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { authApi, errMsg } from '../services/api';
import { Alert, Button } from '../components/ui';
import '../styles/PasswordRecovery.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault(); setError(''); setMessage(''); setLoading(true);
    try {
      const result = await authApi.requestPasswordReset(email.trim());
      sessionStorage.setItem('sv-reset-email', email.trim());
      setMessage(result.message || 'If an account exists for that email, a reset code has been sent.');
      // Continue to the OTP screen after the generic response. Unknown emails cannot verify.
      navigate('/reset-password', { state: { email: email.trim() } });
    } catch (err) {
      setError(errMsg(err, 'Could not process your request. Try again.'));
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="glass auth-card">
        <div className="auth-logo"><ShieldCheck size={34} /></div>
        <h1>Forgot password?</h1>
        <p className="muted center">Enter the email address linked to your SecureVault account. We'll send a recovery code if an account exists.</p>
        <form onSubmit={submit} noValidate>
          <Alert type="error">{error}</Alert>
          <Alert type="success">{message}</Alert>
          <label className="field">
            <span>Registered email address</span>
            <div className="input-wrap"><Mail size={17} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required maxLength={120} placeholder="you@example.com" />
            </div>
          </label>
          <Button type="submit" loading={loading}>Send recovery code</Button>
        </form>
        <p className="auth-switch"><Link to="/login"><ArrowLeft size={14} /> Back to login</Link></p>
      </div>
    </div>
  );
}
