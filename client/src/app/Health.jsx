import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, Loader, PageTitle } from '../components/UI.jsx';
import { dateTime } from '../format.js';

const TONE = {
  good: { label: 'Good', color: 'var(--brand)', bg: 'var(--brand-50)', border: 'var(--brand-100)', icon: '✓' },
  watch: { label: 'Watch', color: 'var(--warn)', bg: 'var(--warn-50)', border: '#f6dfb4', icon: '!' },
  act: { label: 'Act now', color: 'var(--danger)', bg: 'var(--danger-50)', border: '#f5c9c9', icon: '✕' },
};

function ScoreRing({ score }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? 'var(--brand)' : score >= 60 ? 'var(--accent)' : 'var(--danger)';
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`Health score ${score} out of 100`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--bg)" strokeWidth="14" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 70 70)" />
      <text x="70" y="68" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--ink)" fontFamily="var(--font)">{score}</text>
      <text x="70" y="90" textAnchor="middle" fontSize="12" fill="var(--muted)" fontFamily="var(--font)">out of 100</text>
    </svg>
  );
}

export default function HealthCheck() {
  const { user, activePharmacy } = useAuth();
  const state = useApi('/reports/health', [activePharmacy]);
  return (
    <div className="page">
      <PageTitle title="Pharmacy health check" subtitle="Eleven areas where Ugandan pharmacies lose money or patients, and how this facility is doing on each.">
        <button className="btn secondary no-print" onClick={() => window.print()}>Print</button>
      </PageTitle>
      <Loader state={state}>{(h) => {
        const counts = h.checks.reduce((a, c) => ({ ...a, [c.status]: (a[c.status] || 0) + 1 }), {});
        return (
          <div className="stack">
            <div className="card row" style={{ gap: 28, alignItems: 'center' }}>
              <ScoreRing score={h.score} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 style={{ marginBottom: 6 }}>{h.score >= 80 ? 'Healthy pharmacy' : h.score >= 60 ? 'Doing well — a few things to fix' : 'Needs attention'}</h2>
                <p className="muted" style={{ marginBottom: 10 }}>
                  {user.pharmacy_name || 'This facility'} · checked {dateTime(h.generated_at)}
                </p>
                <div className="row">
                  {['good', 'watch', 'act'].map((k) => (
                    <span key={k} className="badge" style={{ background: TONE[k].bg, color: TONE[k].color, borderColor: TONE[k].border }}>{counts[k] || 0} {TONE[k].label.toLowerCase()}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid cols-2">
              {h.checks.map((c) => {
                const t = TONE[c.status];
                return (
                  <Link key={c.key} to={c.link} className="card" style={{ color: 'inherit', textDecoration: 'none', borderLeft: `5px solid ${t.color}` }}>
                    <div className="row between" style={{ marginBottom: 6 }}>
                      <h3 style={{ margin: 0 }}>{c.title}</h3>
                      <span className="badge" style={{ background: t.bg, color: t.color, borderColor: t.border }}>{t.icon} {t.label}</span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '4px 0' }}>{c.value}</div>
                    <p className="small muted" style={{ margin: 0 }}>{c.detail}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      }}</Loader>
    </div>
  );
}
