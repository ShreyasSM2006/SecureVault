import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudUpload, File as FileIcon, Lock, X } from 'lucide-react';
import { dataApi, errMsg } from '../services/api';
import { Alert, Button, PageHeader } from '../components/ui';
import { formatBytes } from '../utils/format';

const ALLOWED = 'pdf, doc, docx, xls, xlsx, ppt, pptx, txt, md, csv, png, jpg, jpeg, gif';

export default function UploadDocument() {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const [maxMb, setMaxMb] = useState(10);
  const input = useRef(null);

  useEffect(() => { dataApi.health().then((h) => h.maxFileSizeMb && setMaxMb(h.maxFileSizeMb)).catch(() => {}); }, []);

  const pick = (f) => {
    setResult(null); setError('');
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) { setFile(null); return setError(`File is too large. Maximum size is ${maxMb} MB.`); }
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Choose a file first.');
    setLoading(true); setError(''); setResult(null); setProgress(0);
    try {
      const data = await dataApi.upload(file, description, setProgress);
      setResult(data.document);
      setFile(null); setDescription('');
      if (input.current) input.current.value = '';
    } catch (err) {
      setError(errMsg(err, 'Upload failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Upload Document" subtitle="Files are encrypted on the server with AES-256-GCM before being stored." />
      <div className="glass panel narrow">
        <form onSubmit={submit}>
          <Alert type="error">{error}</Alert>
          {result && (
            <Alert type="success">
              <strong>“{result.originalName}” encrypted and stored.</strong><br />
              SHA-256: <code className="hash">{result.sha256}</code><br />
              <Link to="/documents">Go to My Documents →</Link>
            </Alert>
          )}
          <div className={`dropzone ${drag ? 'drag' : ''}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}>
            <CloudUpload size={40} />
            <p><strong>Drag &amp; drop</strong> a file here, or click to browse</p>
            <small className="muted">Allowed: {ALLOWED} · max {maxMb} MB</small>
            <input ref={input} type="file" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>

          {file && (
            <div className="file-pill">
              <FileIcon size={18} /><div><strong>{file.name}</strong><small className="muted">{formatBytes(file.size)}</small></div>
              <button type="button" className="icon-btn" onClick={() => { setFile(null); if (input.current) input.current.value = ''; }} aria-label="Remove file"><X size={16} /></button>
            </div>
          )}

          <label className="field"><span>Description (optional)</span>
            <div className="input-wrap"><input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Signed contract, Q3" /></div>
          </label>

          {loading && <div className="progress" aria-label="Upload progress"><div style={{ width: `${progress}%` }} /><span>{progress < 100 ? `Uploading ${progress}%` : 'Encrypting…'}</span></div>}
          <Button type="submit" loading={loading} disabled={!file} icon={Lock}>Encrypt &amp; upload</Button>
        </form>
      </div>
    </>
  );
}
