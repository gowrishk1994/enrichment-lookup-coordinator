import { useState } from 'react';
import { Search } from 'lucide-react';

export default function LookupForm({ onSubmit, loading }) {
  const [indicator, setIndicator] = useState('');
  const [indicatorType, setIndicatorType] = useState('ip');
  const [analystId, setAnalystId] = useState('analyst-001');

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({ indicator: indicator.trim(), indicatorType, analystId });
  }

  return <form className="lookup-form panel" onSubmit={handleSubmit}>
    <div className="panel-heading">
      <div><span className="eyebrow">NEW REQUEST</span><h2>Enrich an indicator</h2></div>
      <span className="heading-icon"><Search size={19} /></span>
    </div>
    <label htmlFor="indicator">Indicator</label>
    <input id="indicator" value={indicator} onChange={(event) => setIndicator(event.target.value)}
      placeholder="e.g. 185.199.108.153" maxLength={255} required />
    <div className="form-row">
      <div className="field-group">
        <label htmlFor="indicatorType">Indicator type</label>
        <select id="indicatorType" value={indicatorType} onChange={(event) => setIndicatorType(event.target.value)}>
          <option value="ip">IP address</option><option value="domain">Domain</option><option value="hash">File hash</option>
        </select>
      </div>
      <div className="field-group">
        <label htmlFor="analystId">Analyst ID</label>
        <input id="analystId" value={analystId} onChange={(event) => setAnalystId(event.target.value)} maxLength={120} required />
      </div>
    </div>
    <button className="primary-button submit-button" type="submit" disabled={loading || !indicator.trim()}>
      <Search size={17} /> {loading ? 'Requesting…' : 'Request enrichment'}
    </button>
    <p className="form-hint">Each active indicator uses one shared provider slot. Unavailable slots are queued automatically.</p>
  </form>;
}
