import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ScrollText, XCircle } from 'lucide-react';
import { dataApi, errMsg } from '../services/api';
import { Alert, Badge, Button, EmptyState, FullPageLoader, PageHeader } from '../components/ui';
import { eventLabel, formatDate } from '../utils/format';

export default function SecurityLogs() {
  const [data, setData] = useState(null);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await dataApi.logs({ type: type || undefined, success: status || undefined, limit: 200 }));
      setError('');
    } catch (e) { setError(errMsg(e, 'Could not load logs.')); }
    finally { setLoading(false); }
  }, [type, status]);
  useEffect(() => { load(); }, [load]);

  if (!data && !error) return <FullPageLoader label="Loading security logs…" />;

  return (
    <>
      <PageHeader title="Security Logs" subtitle="An audit trail of authentication and document events on your account.">
        <Button variant="ghost" icon={RefreshCw} loading={loading} onClick={load}>Refresh</Button>
      </PageHeader>
      <Alert type="error">{error}</Alert>
      <div className="glass panel">
        <div className="filters">
          <label>Event
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All events</option>
              {(data?.types || []).map((t) => <option key={t} value={t}>{eventLabel(t)}</option>)}
            </select>
          </label>
          <label>Result
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option><option value="true">Success</option><option value="false">Failure</option>
            </select>
          </label>
          <span className="muted small">{data?.total ?? 0} event(s)</span>
        </div>
        {data && data.logs.length === 0 ? <EmptyState icon={ScrollText} title="No events">Nothing matches the current filters.</EmptyState> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Result</th><th>Event</th><th>Details</th><th>IP</th><th>Time</th></tr></thead>
              <tbody>
                {data?.logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.success ? <Badge tone="success" icon={CheckCircle2}>Success</Badge> : <Badge tone="danger" icon={XCircle}>Failed</Badge>}</td>
                    <td><strong>{eventLabel(l.type)}</strong></td>
                    <td className="muted">{l.detail}</td>
                    <td><code>{l.ip || '—'}</code></td>
                    <td>{formatDate(l.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
