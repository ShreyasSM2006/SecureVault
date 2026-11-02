import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, KeyRound, Mail, ShieldCheck, User, UserPlus } from 'lucide-react';
import { authApi, errMsg } from '../services/api';
import { Alert, Button } from '../components/ui';

const rules = (pw) => [
  { ok: pw.length >= 8, text: 'At least 8 characters' },
  { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), text: 'Upper and lower case letters' },
  { ok: /\d/.test(pw), text: 'At least one digit' },
];

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!rules(form.password).every((r) => r.ok)) return setError('Password does not meet the requirements.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await authApi.register({ username: form.username.trim(), email: form.email.trim(), password: form.password });
      setDone(true);
    } catch (err) {
      setError(errMsg(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="auth-page">
        <div className="glass auth-card center">
          <div className="auth-logo success"><CheckCircle2 size={34} /></div>
          <h1>Account created</h1>
          <p className="muted">Your account is ready. Sign in with your password, then confirm the one-time code.</p>
          <Link className="btn btn-primary" to="/login">Go to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="glass auth-card">
        <div className="auth-logo"><ShieldCheck size={34} /></div>
        <h1>Create your vault</h1>
        <p className="muted center">Passwords are hashed with bcrypt. Nothing is stored in plain text.</p>
        <form onSubmit={submit} noValidate>
          <Alert type="error">{error}</Alert>
          <label className="field"><span>Username</span>
            <div className="input-wrap"><User size={17} /><input value={form.username} onChange={set('username')} autoComplete="username" required placeholder="3-30 letters, numbers, _" /></div>
          </label>
          <label className="field"><span>Email</span>
            <div className="input-wrap"><Mail size={17} /><input type="email" value={form.email} onChange={set('email')} autoComplete="email" required placeholder="you@example.com" /></div>
          </label>
          <label className="field"><span>Password</span>
            <div className="input-wrap"><KeyRound size={17} /><input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required /></div>
          </label>
          <ul className="rules">
            {rules(form.password).map((r) => <li key={r.text} className={r.ok ? 'ok' : ''}><CheckCircle2 size={14} /> {r.text}</li>)}
          </ul>
          <label className="field"><span>Confirm password</span>
            <div className="input-wrap"><KeyRound size={17} /><input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required /></div>
          </label>
          <Button type="submit" loading={loading} icon={UserPlus}>Create account</Button>
        </form>
        <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
