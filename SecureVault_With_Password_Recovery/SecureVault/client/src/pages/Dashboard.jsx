import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Clock, FileLock2, HardDrive, RefreshCw, ShieldAlert, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { dataApi, errMsg } from '../services/api';
import { Alert, Badge, EmptyState, FullPageLoader, PageHeader, Button } from '../components/ui';
import { eventLabel, formatBytes, formatDate, timeAgo } from '../utils/format';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError('');
    try { setD(await dataApi.dashboard()); } catch (e) { setError(errMsg(e, 'Could not load dashboard.')); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading && !d) return <FullPageLoader label="Loading dashboard…" />;
  if (!d) return <><PageHeader title="Dashboard" /><Alert type="error">{error}</Alert><Button onClick={load}>Retry</Button></>;

  const tone = { Secure: 'success', Warning: 'warning', 'At Risk': 'danger' }[d.securityStatus.status];
  const StatusIcon = d.securityStatus.status === 'Secure' ? ShieldCheck : ShieldAlert;

  return (
    <>
      <PageHeader title={`Welcome back, ${d.user.username}`} subtitle="Your encrypted vault at a glance.">
        <Button variant="ghost" icon={RefreshCw} loading={loading} onClick={load}>Refresh</Button>
        <Link className="btn btn-primary" to="/upload"><Upload size={16} /> Upload</Link>
      </PageHeader>
      <Alert type="error">{error}</Alert>

      <div className="stat-grid">
        <div className="glass stat">
          <div className="stat-icon blue"><FileLock2 size={22} /></div>
          <div><small>Total documents</small><strong>{d.totalDocuments}</strong><span className="muted">{formatBytes(d.totalSizeBytes)} · {d.verifiedDocuments} verified</span></div>
        </div>
        <div className="glass stat">
          <div className={`stat-icon ${tone}`}><StatusIcon size={22} /></div>
          <div><small>Security status</small><strong><Badge tone={tone}>{d.securityStatus.status}</Badge></strong><span className="muted">{d.securityStatus.detail}</span></div>
        </div>
        <div className="glass stat">
          <div className="stat-icon blue"><Clock size={22} /></div>
          <div><small>Last login</small><strong className="sm">{d.lastLogin ? formatDate(d.lastLogin) : 'First login'}</strong><span className="muted">{d.lastLogin ? timeAgo(d.lastLogin) : 'Welcome aboard'}</span></div>
        </div>
        <div className="glass stat">
          <div className="stat-icon success"><CheckCircle2 size={22} /></div>
          <div><small>Authentication</small><strong className="sm">{d.authentication.status}</strong><span className="muted">{d.authentication.method}</span></div>
        </div>
      </div>

      <div className="two-col">
        <section className="glass panel">
          <h2><Activity size={18} /> Recent activity</h2>
          {d.recentActivity.length === 0 ? <EmptyState icon={Activity} title="No activity yet">Events appear here as you use the vault.</EmptyState> : (
            <ul className="activity">
              {d.recentActivity.map((l) => (
                <li key={l.id}>
                  {l.success ? <CheckCircle2 size={18} className="ok" /> : <XCircle size={18} className="bad" />}
                  <div><strong>{eventLabel(l.type)}</strong><small className="muted">{l.detail}</small></div>
                  <time className="muted" title={formatDate(l.timestamp)}>{timeAgo(l.timestamp)}</time>
                </li>
              ))}
            </ul>
          )}
          <Link to="/logs" className="more">View all security logs →</Link>
        </section>

        <section className="glass panel">
          <h2><HardDrive size={18} /> Session &amp; protection</h2>
          <dl className="kv">
            <dt>Signed in</dt><dd>{formatDate(d.authentication.sessionStartedAt)}</dd>
            <dt>Idle timeout</dt><dd>{d.authentication.sessionIdleTimeoutMinutes} minutes</dd>
            <dt>Failed events (24 h)</dt><dd>{d.failedEventsLast24h}</dd>
            <dt>Integrity failures</dt><dd>{d.integrityFailures}</dd>
            <dt>Encryption</dt><dd>AES-256-GCM</dd>
            <dt>Key protection</dt><dd>RSA-2048 OAEP</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
