import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Download, FileLock2, RefreshCw, Search, ShieldCheck, ShieldX, Trash2, Upload, HelpCircle } from 'lucide-react';
import { blobErrMsg, dataApi, errMsg } from '../services/api';
import { Alert, Badge, Button, EmptyState, FullPageLoader, PageHeader, Spinner } from '../components/ui';
import { formatBytes, formatDate } from '../utils/format';

function IntegrityBadge({ integrity }) {
  if (integrity.lastResult === true) return <Badge tone="success" icon={ShieldCheck}>Verified</Badge>;
  if (integrity.lastResult === false) return <Badge tone="danger" icon={ShieldX}>Integrity failed</Badge>;
  return <Badge tone="neutral" icon={HelpCircle}>Not checked</Badge>;
}

export default function MyDocuments() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // {type, text}
  const [busy, setBusy] = useState({});      // { [id]: 'download'|'verify'|'delete' }
  const [confirm, setConfirm] = useState(null);
  const [query, setQuery] = useState('');
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setReloading(true);
    try { setDocs(await dataApi.documents()); setError(''); }
    catch (e) { setError(errMsg(e, 'Could not load documents.')); }
    finally { setReloading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setB = (id, v) => setBusy((b) => { const n = { ...b }; if (v) n[id] = v; else delete n[id]; return n; });
  const patchIntegrity = (id, ok) =>
    setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, integrity: { lastVerifiedAt: new Date().toISOString(), lastResult: ok } } : d)));

  const download = async (doc) => {
    setNotice(null); setB(doc.id, 'download');
    try {
      const res = await dataApi.download(doc.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = doc.originalName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      patchIntegrity(doc.id, true);
      setNotice({ type: 'success', text: `“${doc.originalName}” was decrypted, integrity-checked and downloaded.` });
    } catch (e) {
      if (e?.response?.status === 409) patchIntegrity(doc.id, false);
      setNotice({ type: 'error', text: await blobErrMsg(e, 'Download failed.') });
    } finally { setB(doc.id, null); }
  };

  const verify = async (doc) => {
    setNotice(null); setB(doc.id, 'verify');
    try {
      const r = await dataApi.verify(doc.id);
      patchIntegrity(doc.id, r.intact);
      setNotice(r.intact
        ? { type: 'success', text: `“${doc.originalName}”: SHA-256 matches (${r.actualSha256.slice(0, 16)}…). File is intact.` }
        : { type: 'error', text: `“${doc.originalName}” FAILED verification: ${r.reason}` });
    } catch (e) { setNotice({ type: 'error', text: errMsg(e, 'Verification failed.') }); }
    finally { setB(doc.id, null); }
  };

  const remove = async (doc) => {
    setNotice(null); setB(doc.id, 'delete'); setConfirm(null);
    try {
      await dataApi.remove(doc.id);
      setDocs((ds) => ds.filter((d) => d.id !== doc.id));
      setNotice({ type: 'success', text: `“${doc.originalName}” was permanently deleted.` });
    } catch (e) { setNotice({ type: 'error', text: errMsg(e, 'Delete failed.') }); }
    finally { setB(doc.id, null); }
  };

  const copyHash = async (h) => {
    try { await navigator.clipboard.writeText(h); setNotice({ type: 'success', text: 'SHA-256 copied to clipboard.' }); }
    catch { setNotice({ type: 'info', text: h }); }
  };

  const shown = useMemo(() => (docs || []).filter((d) => d.originalName.toLowerCase().includes(query.toLowerCase())), [docs, query]);

  if (!docs && !error) return <FullPageLoader label="Loading documents…" />;

  return (
    <>
      <PageHeader title="My Documents" subtitle="Only you can see, verify and decrypt these files.">
        <Button variant="ghost" icon={RefreshCw} loading={reloading} onClick={load}>Refresh</Button>
        <Link className="btn btn-primary" to="/upload"><Upload size={16} /> Upload</Link>
      </PageHeader>
      <Alert type="error">{error}</Alert>
      {notice && <Alert type={notice.type}>{notice.text}</Alert>}

      {docs && docs.length === 0 ? (
        <div className="glass panel"><EmptyState icon={FileLock2} title="No documents yet">Upload your first confidential document — it will be encrypted before it is stored.</EmptyState></div>
      ) : docs && (
        <div className="glass panel">
          <div className="input-wrap search"><Search size={17} /><input placeholder="Filter by file name…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Document</th><th>Size</th><th>Uploaded</th><th>SHA-256</th><th>Integrity</th><th className="right">Actions</th></tr></thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.originalName}</strong>{d.description && <small className="muted block">{d.description}</small>}<small className="muted block">{d.encryption.cipher} · key wrapped with {d.encryption.keyWrap}</small></td>
                    <td>{formatBytes(d.size)}</td>
                    <td>{formatDate(d.uploadedAt)}</td>
                    <td><button className="hash-btn" title="Copy full SHA-256" onClick={() => copyHash(d.sha256)}><code>{d.sha256.slice(0, 12)}…</code><Copy size={12} /></button></td>
                    <td><IntegrityBadge integrity={d.integrity} />{d.integrity.lastVerifiedAt && <small className="muted block">{formatDate(d.integrity.lastVerifiedAt)}</small>}</td>
                    <td className="right actions">
                      <Button variant="ghost" icon={Download} loading={busy[d.id] === 'download'} disabled={!!busy[d.id]} onClick={() => download(d)}>Download</Button>
                      <Button variant="ghost" icon={ShieldCheck} loading={busy[d.id] === 'verify'} disabled={!!busy[d.id]} onClick={() => verify(d)}>Verify</Button>
                      {confirm === d.id ? (
                        <>
                          <Button variant="danger" onClick={() => remove(d)} loading={busy[d.id] === 'delete'}>Confirm</Button>
                          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                        </>
                      ) : (
                        <Button variant="ghost-danger" icon={Trash2} disabled={!!busy[d.id]} onClick={() => setConfirm(d.id)}>Delete</Button>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={6} className="muted center">No documents match “{query}”.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {Object.keys(busy).length > 0 && <p className="muted small center"><Spinner size={14} /> Working…</p>}
    </>
  );
}
