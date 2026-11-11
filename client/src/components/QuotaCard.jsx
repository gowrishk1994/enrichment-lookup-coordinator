import { Activity, Clock3, Gauge, ShieldCheck } from 'lucide-react';

export default function QuotaCard({ quota }) {
  const metrics = [
    { label: 'Daily limit', value: quota.daily_limit ?? '—', icon: Gauge },
    { label: 'Available slots', value: quota.available ?? '—', icon: ShieldCheck, accent: true },
    { label: 'Consumed today', value: quota.consumed ?? '—', icon: Activity },
    { label: 'Waiting requests', value: quota.waiting ?? '—', icon: Clock3 }
  ];

  return <section className="metric-grid" aria-label="Provider quota">
    {metrics.map(({ label, value, icon: Icon, accent }) => (
      <article className={`metric-card ${accent ? 'metric-card-accent' : ''}`} key={label}>
        <div className="metric-top"><span>{label}</span><Icon size={18} /></div>
        <strong>{value}</strong>
      </article>
    ))}
  </section>;
}
