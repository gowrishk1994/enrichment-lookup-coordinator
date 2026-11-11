import { CheckCircle2, Clock3, Hourglass, Play, ShieldAlert } from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';

const STATUS = {
  leased: { label: 'Slot reserved', icon: ShieldAlert, tone: 'blue' },
  queued: { label: 'Waiting in queue', icon: Hourglass, tone: 'amber' },
  expired: { label: 'Lease expired', icon: Clock3, tone: 'red' },
  completed: { label: 'Lookup completed', icon: CheckCircle2, tone: 'green' }
};

export default function LookupStatus({ lookup, onRun, running }) {
  const countdown = useCountdown(lookup.leaseExpiresAt);
  if (!lookup) return null;
  const status = STATUS[lookup.status] || STATUS.queued;
  const StatusIcon = status.icon;

  return <section className="panel status-panel">
    <div className="panel-heading">
      <div><span className="eyebrow">LATEST REQUEST</span><h2>Lookup status</h2></div>
      <span className={`status-pill ${status.tone}`}><StatusIcon size={14} /> {status.label}</span>
    </div>
    <div className="indicator-value"><span className="muted-label">INDICATOR</span><strong>{lookup.indicator}</strong><span className="type-tag">{lookup.indicatorType}</span></div>

    {lookup.status === 'leased' && <div className="lease-box">
      <div><span className="muted-label">LEASE TIME REMAINING</span><strong className="countdown">{countdown.formatted}</strong></div>
      <button className="primary-button run-button" onClick={() => onRun(lookup.id)} disabled={running || countdown.remaining <= 0}>
        <Play size={16} fill="currentColor" /> {running ? 'Running…' : 'Run lookup'}
      </button>
    </div>}
    {lookup.status === 'queued' && <div className="notice notice-amber"><Hourglass size={18} />
      <div><strong>Request queued</strong><p>Your request is position <b>#{lookup.queuePosition ?? '—'}</b>. It will be leased in arrival order when a slot is returned.</p></div>
    </div>}
    {lookup.status === 'expired' && <div className="notice notice-red"><Clock3 size={18} />
      <div><strong>Lease expired</strong><p>The reserved slot was returned to the shared quota and offered to the next queued request.</p></div>
    </div>}
    {lookup.status === 'completed' && <div className="result-box">
      <span className="muted-label">PROVIDER REPUTATION</span>
      <strong className={`verdict ${lookup.reputation}`}>{lookup.reputation}</strong>
      <p>The provider mock returned this reputation verdict.</p>
    </div>}
    <div className="request-id">Request ID <code>{lookup.id}</code></div>
  </section>;
}
