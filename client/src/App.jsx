import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw, Shield, Zap } from 'lucide-react';
import { api } from './api/client';
import QuotaCard from './components/QuotaCard';
import LookupForm from './components/LookupForm';
import LookupStatus from './components/LookupStatus';

export default function App() {
  const [quota, setQuota] = useState({});
  const [lookup, setLookup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const activeId = useRef(null);

  const refreshQuota = useCallback(async () => {
    try { setQuota(await api.getQuota()); } catch (err) { setError(err.message); }
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!activeId.current) return;
    try {
      const latest = await api.getStatus(activeId.current);
      setLookup(latest);
      if (latest.status === 'completed' || latest.status === 'expired') activeId.current = null;
    } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    refreshQuota();
    const timer = window.setInterval(() => { refreshQuota(); refreshStatus(); }, 2000);
    return () => window.clearInterval(timer);
  }, [refreshQuota, refreshStatus]);

  async function handleSubmit(data) {
    setLoading(true); setError('');
    try {
      const result = await api.createLookup(data, crypto.randomUUID());
      setLookup(result); activeId.current = result.id;
      await refreshQuota();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleRun(id) {
    setRunning(true); setError('');
    try {
      const result = await api.runLookup(id);
      setLookup(result); activeId.current = null;
      await refreshQuota();
    } catch (err) { setError(err.message); await refreshStatus(); }
    finally { setRunning(false); }
  }

  return <main className="app-shell">
    <section className="hero">
      <div><div className="eyebrow hero-eyebrow"><Zap size={13} /> THREAT INTELLIGENCE</div>
        <h1>Enrichment <span>Coordinator</span></h1>
        <p>One shared provider quota. Fair access for every analyst.</p>
      </div>
      <button className="icon-button" onClick={() => { refreshQuota(); refreshStatus(); }} aria-label="Refresh dashboard"><RefreshCw size={17} /></button>
    </section>
    <QuotaCard quota={quota} />
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    <div className="content-grid">
      <LookupForm onSubmit={handleSubmit} loading={loading} />
      {lookup ? <LookupStatus lookup={lookup} onRun={handleRun} running={running} /> : <section className="panel empty-state">
        <div className="empty-icon"><Activity size={23} /></div><h2>No active lookup</h2>
        <p>Submit an indicator to reserve a provider slot and see its live status here.</p>
      </section>}
    </div>
    <footer>Enrichment Lookup Coordinator <span>•</span> Shared quota protected by transactional reservations</footer>
  </main>;
}
