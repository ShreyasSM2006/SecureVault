import { useMemo, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { bruteForceSimulation, dictionarySimulation, evaluatePassword } from '../utils/passwordSecurity';

export default function PasswordSecurityLab() {
  const [password, setPassword] = useState('');
  const [dictionary, setDictionary] = useState(null);
  const [bruteForce, setBruteForce] = useState(null);
  const [charset, setCharset] = useState('digits');
  const evaluation = useMemo(() => evaluatePassword(password), [password]);

  return (
    <div className="page">
      <div className="page-heading"><div><h1><KeyRound size={22} /> Password Security Lab</h1><p>Offline demonstrations using synthetic passwords only.</p></div></div>
      <section className="glass panel narrow">
        <label className="field"><span>Synthetic test password</span>
          <div className="input-wrap"><KeyRound size={17} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Try password123 or a strong synthetic password" /></div>
        </label>
        <div className={`strength strength-${evaluation.strength.toLowerCase()}`}><strong>{evaluation.strength}</strong><span>{evaluation.reason}</span></div>
        <div className="lab-actions">
          <button className="btn btn-ghost" onClick={() => setDictionary(dictionarySimulation(password))}>Run dictionary simulation</button>
          <label className="charset">Character set
            <select value={charset} onChange={(e) => setCharset(e.target.value)}>
              <option value="digits">Digits (0-9)</option>
              <option value="lower">Lowercase</option>
              <option value="mixed">Mixed letters + digits</option>
            </select>
          </label>
          <button className="btn btn-primary" onClick={() => setBruteForce(bruteForceSimulation(password, charset))}>Run brute-force simulation</button>
        </div>
      </section>
      <div className="lab-grid">
        <section className="glass panel">
          <h2>Dictionary result</h2>
          {dictionary ? <><p><strong>Match:</strong> {dictionary.found ? 'Found in the local sample wordlist' : 'Not found'}</p><p>Guesses attempted: {dictionary.attempts}</p><p>Elapsed: {dictionary.elapsedMs} ms</p></> : <p className="muted">Run the simulation to compare this password with common sample words.</p>}
        </section>
        <section className="glass panel">
          <h2>Brute-force result</h2>
          {bruteForce ? <><p><strong>Result:</strong> {bruteForce.found ? 'Found within limits' : 'Not found within limits'}</p><p>Attempts: {bruteForce.attempts}</p><p>Elapsed: {bruteForce.elapsedMs} ms</p>{bruteForce.reachedLimit && <p className="muted">The simulation stopped at its attempt/time/length limit.</p>}</> : <p className="muted">The simulation searches at most 3 characters and 5,000 guesses.</p>}
        </section>
      </div>
      <section className="glass panel">
        <h2>Synthetic weak vs strong comparison</h2>
        <div className="comparison">
          <div><strong>Weak: password</strong><br />Dictionary match: usually found quickly<br />Brute-force: poor length and character variety</div>
          <div><strong>Strong: SecureVault!2026</strong><br />Dictionary match: not found<br />Brute-force: larger search space requires more guesses</div>
        </div>
        <p className="muted">Longer passwords with mixed character types enlarge the search space. SecureVault also hashes real account passwords with bcrypt using a deliberately costly work factor, making repeated offline guessing more expensive. This does not make a strong password impossible to crack.</p>
      </section>
    </div>
  );
}
