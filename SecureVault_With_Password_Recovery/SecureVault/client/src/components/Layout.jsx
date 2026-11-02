import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileLock2, LayoutDashboard, LogOut, Menu, Network, ScrollText, ShieldCheck, Upload, X, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload Document', icon: Upload },
  { to: '/documents', label: 'My Documents', icon: FileLock2 },
  { to: '/logs', label: 'Security Logs', icon: ScrollText },
  { to: '/network-security-lab', label: 'Network Security Lab', icon: Network },
  { to: '/password-security-lab', label: 'Password Security Lab', icon: KeyRound },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onLogout = async () => {
    setBusy(true);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <div className="brand"><ShieldCheck size={22} /> SecureVault</div>
        <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><ShieldCheck size={26} /> <span>SecureVault</span></div>
        <nav>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <div><strong>{user?.username}</strong><small className="muted">2FA verified</small></div>
          </div>
          <button className="nav-link logout" onClick={onLogout} disabled={busy}>
            {busy ? <Spinner size={18} /> : <LogOut size={18} />} Logout
          </button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <main className="content"><Outlet /></main>
    </div>
  );
}
