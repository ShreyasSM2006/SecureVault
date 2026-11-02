import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, LogIn, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../services/api';
import { Alert, Button } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username.trim(), form.password);
      navigate('/verify-otp');
    } catch (err) {
      setError(errMsg(err, 'Login failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="glass auth-card">
        <div className="auth-logo"><ShieldCheck size={34} /></div>
        <h1>Welcome to SecureVault</h1>
        <p className="muted center">Step 1 of 2 — sign in with your password</p>
        <form onSubmit={submit} noValidate>
          <Alert type="success">{location.state?.notice}</Alert>
          <Alert type="error">{error}</Alert>
          <label className="field">
            <span>Username</span>
            <div className="input-wrap"><User size={17} />
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="username" autoFocus required placeholder="your_username" />
            </div>
          </label>
          <label className="field">
            <span>Password</span>
            <div className="input-wrap"><KeyRound size={17} />
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password" required placeholder="••••••••" />
            </div>
          </label>
          <div className="forgot-link"><Link to="/forgot-password">Forgot password?</Link></div>
          <Button type="submit" loading={loading} icon={LogIn}>Continue</Button>
        </form>
        <p className="auth-switch">New here? <Link to="/register">Create an account</Link></p>
      </div>
    </div>
  );
}
