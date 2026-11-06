import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, Loader, PageTitle, Stat } from '../components/UI.jsx';
import { DailyBars, BarList, Donut, PALETTE } from '../components/Charts.jsx';
import { ugx, num, compact, PAYMENT_LABELS } from '../format.js';

export function RangePicker({ days, setDays }) {
  return (
    <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Date range">
      <option value={7}>Last 7 days</option>
      <option value={30}>Last 30 days</option>
      <option value={90}>Last 90 days</option>
    </select>
  );
}

export function Charts({ m }) {
  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Daily sales</h3><span className="small muted">Revenue incl. programme subsidies (UGX)</span></div>
        <DailyBars
          data={m.series.map((d) => ({ ...d, paid: (d.revenue || 0) - (d.subsidy || 0) }))}
          keys={['paid', 'subsidy']}
          labels={['Paid by patients', 'Programme subsidy']}
        />
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="card-head"><h3>Top medicines</h3><span className="small muted">by revenue</span></div>
          <BarList items={m.top_products.map((p) => ({ label: p.name, value: p.revenue }))} />
        </div>
        <div className="card">
          <div className="card-head"><h3>How patients pay</h3></div>
          <Donut items={m.payments.map((p, i) => ({ label: PAYMENT_LABELS[p.payment_method] || p.payment_method, value: p.sales, color: PALETTE[i % PALETTE.length] }))} format={num} />
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user, activePharmacy } = useAuth();
  const [days, setDays] = useState(30);
  const state = useApi(`/reports/dashboard?days=${days}`, [activePharmacy]);
  const hour = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Kampala', hour: 'numeric', hour12: false });
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <PageTitle title={`${greet}, ${user.name.split(' ')[0]}`} subtitle={activePharmacy ? 'Here is how your facility is doing.' : 'Network-wide overview of all FirstMeds facilities.'}>
        <RangePicker days={days} setDays={setDays} />
        {activePharmacy && <Link to="/app/pos" className="btn">+ New sale</Link>}
      </PageTitle>
      <Loader state={state}>{(m) => (
        <div className="stack">
          <div className="grid cols-4">
            <Stat label="Today's sales" value={ugx(m.today.revenue)} sub={`${num(m.today.sales)} receipts · ${ugx(m.today.subsidy)} subsidy`} />
            <Stat label={`Revenue (${days}d)`} value={ugx(m.totals.revenue)} sub={`Gross margin ${ugx(m.totals.gross_margin)}`} />
            <Stat label="Patient visits" value={num(m.totals.sales)} sub={`Avg basket ${ugx(m.totals.avg_basket)}`} />
            <Stat label="Programme subsidies" value={ugx(m.totals.subsidy)} sub={`${num(m.totals.patients)} registered patients served`} />
          </div>
          {m.stock && (
            <div className="grid cols-4">
              <Link to="/app/inventory?filter=low" className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="label">Low stock</span><span className="value" style={{ color: m.stock.low_stock ? 'var(--warn)' : undefined }}>{m.stock.low_stock}</span><span className="sub">products at or below reorder level</span>
              </Link>
              <Link to="/app/inventory?filter=out" className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="label">Out of stock</span><span className="value" style={{ color: m.stock.out_of_stock ? 'var(--danger)' : undefined }}>{m.stock.out_of_stock}</span><span className="sub">products you usually carry</span>
              </Link>
              <Link to="/app/inventory?filter=expiring" className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="label">Expiring in 90 days</span><span className="value">{m.stock.expiring_90d}</span><span className="sub">batches — sell or return them first</span>
              </Link>
              <Link to="/app/reminders" className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="label">Refills due</span><span className="value" style={{ color: 'var(--brand)' }}>{m.refills_due}</span><span className="sub">patients to remind · stock value {compact(m.stock.value)}</span>
              </Link>
            </div>
          )}
          <Charts m={m} />
        </div>
      )}</Loader>
    </div>
  );
}
