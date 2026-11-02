import { useState } from 'react';
import axios from 'axios';
import { Network, Send, ShieldCheck } from 'lucide-react';

export default function NetworkSecurityLab() {
  const [message, setMessage] = useState('Hello SecureVault');
  const [httpResult, setHttpResult] = useState(null);
  const [httpsResult, setHttpsResult] = useState(null);
  const [error, setError] = useState('');

  const send = async (protocol) => {
    setError('');
    try {
      const url = protocol === 'HTTP' ? '/network-lab-http/http' : '/api/network/https';
      const response = await axios.post(url, { message }, { withCredentials: true, timeout: 10000 });
      protocol === 'HTTP' ? setHttpResult(response.data) : setHttpsResult(response.data);
    } catch (err) {
      setError(`${protocol} request failed: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="page">
      <div className="page-heading"><div><h1><Network size={22} /> Network Security Lab</h1><p>Compare plain HTTP with TLS-protected HTTPS using synthetic lab messages only.</p></div></div>
      <section className="glass panel narrow">
        <label className="field"><span>Sample message (never use credentials, OTPs, or documents)</span>
          <div className="input-wrap"><Send size={17} /><input value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} /></div>
        </label>
        <div className="lab-actions"><button className="btn btn-ghost" onClick={() => send('HTTP')}>Send via HTTP</button><button className="btn btn-primary" onClick={() => send('HTTPS')}><ShieldCheck size={16} /> Send via HTTPS</button></div>
        {error && <div className="alert alert-error">{error}</div>}
      </section>
      <div className="lab-grid">
        {[['HTTP', httpResult], ['HTTPS', httpsResult]].map(([protocol, result]) => (
          <section className="glass panel" key={protocol}>
            <h2>{protocol === 'HTTPS' ? <ShieldCheck size={18} /> : <Network size={18} />} {protocol} response</h2>
            {result ? <>
              <p><strong>Protocol:</strong> {result.protocol}</p>
              <p><strong>Response:</strong> {result.echo || result.response}</p>
              {protocol === 'HTTP' ? <p className="muted">TLS: No — data is carried without transport encryption.</p> :
                <><p><strong>TLS version:</strong> {result.tls?.version || 'Available on the TLS socket'}</p><p><strong>Cipher:</strong> {result.tls?.cipher || 'Cipher not reported'}</p><p className="muted">Certificate: server self-signed certificate for localhost. Inspect it in the browser or with openssl.</p></>}
            </> : <p className="muted">Send a sample message to view the result.</p>}
          </section>
        ))}
      </div>
      <section className="glass panel">
        <h2>HTTP vs HTTPS comparison</h2>
        <p>HTTP transports the application message as plain text. HTTPS establishes a TLS handshake first, then encrypts application data using the negotiated cipher suite. Browser developer tools still show decrypted data before it is sent and after it is received; Wireshark shows HTTP content clearly and HTTPS application data protected by TLS.</p>
        <p className="muted">The included certificate is self-signed for local development, so the browser will show a privacy warning until it is trusted locally. It is not publicly trusted.</p>
      </section>
    </div>
  );
}
