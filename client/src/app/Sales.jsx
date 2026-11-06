import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useDebounced, Loader, PageTitle, Badge, Empty, Modal, Field, ErrorBox, useForm } from '../components/UI.jsx';
import { ugx, num, dateTime, date, todayEAT, PAYMENT_LABELS, phone } from '../format.js';

export default function Sales() {
  const nav = useNavigate();
  const { activePharmacy } = useAuth();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(todayEAT());
  const [to, setTo] = useState(todayEAT());
  const dq = useDebounced(q);
  const state = useApi(`/sales?limit=500&from=${from}&to=${to}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`, [activePharmacy]);
  return (
    <div className="page">
      <PageTitle title="Sales" subtitle="Receipts issued at this facility.">
        <Link to="/app/pos" className="btn">+ New sale</Link>
      </PageTitle>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <Field label="Search"><input placeholder="Receipt, patient or MoMo ID" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </div>
      <Loader state={state}>{(rows) => {
        const live = rows.filter((r) => !r.voided);
        return (
          <div className="card flush">
            <div className="row between" style={{ padding: '14px 16px' }}>
              <strong>{num(live.length)} sales · {ugx(live.reduce((a, r) => a + r.subtotal - r.discount_total, 0))}</strong>
              <span className="small muted">of which {ugx(live.reduce((a, r) => a + r.subsidy_total, 0))} programme subsidy</span>
            </div>
            {!rows.length ? <Empty>No sales in this period.</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Receipt</th><th>Time</th><th>Patient</th><th className="num">Items</th><th>Payment</th><th>Programme</th><th className="num">Paid</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="clickable" onClick={() => nav(`/app/sales/${r.id}`)} style={r.voided ? { opacity: 0.5 } : undefined}>
                        <td className="mono nowrap">{r.receipt_no} {r.voided ? <Badge tone="red">Voided</Badge> : null}</td>
                        <td className="nowrap">{dateTime(r.created_at)}</td>
                        <td>{r.patient_name || <span className="muted">Walk-in</span>}</td>
                        <td className="num">{r.units}</td>
                        <td>{PAYMENT_LABELS[r.payment_method]}</td>
                        <td>{r.program_name ? <Badge tone="green">{r.program_name}</Badge> : '—'}</td>
                        <td className="num"><strong>{ugx(r.total)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      }}</Loader>
    </div>
  );
}

export function Receipt({ sale }) {
  return (
    <div className="receipt">
      <h2>{sale.pharmacy_name}</h2>
      <div className="c">{[sale.pharmacy_address, sale.pharmacy_town, sale.pharmacy_district].filter(Boolean).join(', ')}</div>
      <div className="c">{sale.pharmacy_phone && `Tel ${phone(sale.pharmacy_phone)}`}</div>
      <div className="c small">{sale.pharmacy_nda_license && `NDA ${sale.pharmacy_nda_license}`} {sale.pharmacy_tin && `· TIN ${sale.pharmacy_tin}`}</div>
      <hr />
      <div className="l"><span>Receipt</span><span>{sale.receipt_no}</span></div>
      <div className="l"><span>Date</span><span>{dateTime(sale.created_at)}</span></div>
      <div className="l"><span>Served by</span><span>{sale.cashier_name}</span></div>
      {sale.patient_name && <div className="l"><span>Patient</span><span>{sale.patient_name}</span></div>}
      <hr />
      {sale.items.map((i) => (
        <div key={i.id} style={{ marginBottom: 6 }}>
          <div>{i.name} {i.strength}</div>
          <div className="l"><span>  {i.quantity} × {num(i.unit_price)}</span><span>{num(i.line_total)}</span></div>
          <div className="small" style={{ color: '#555' }}>  Batch {i.batch_no} · Exp {date(i.expiry_date)}</div>
          {i.subsidy > 0 && <div className="l"><span>  Subsidy</span><span>-{num(i.subsidy)}</span></div>}
        </div>
      ))}
      <hr />
      <div className="l"><span>Subtotal</span><span>{num(sale.subtotal)}</span></div>
      {sale.subsidy_total > 0 && <div className="l"><span>{sale.program_name}</span><span>-{num(sale.subsidy_total)}</span></div>}
      {sale.discount_total > 0 && <div className="l"><span>Discount</span><span>-{num(sale.discount_total)}</span></div>}
      <div className="l" style={{ fontWeight: 700, fontSize: 16 }}><span>TOTAL UGX</span><span>{num(sale.total)}</span></div>
      <div className="l"><span>Paid by</span><span>{PAYMENT_LABELS[sale.payment_method]}</span></div>
      {sale.payment_ref && <div className="l"><span>Txn ID</span><span>{sale.payment_ref}</span></div>}
      {sale.amount_tendered != null && <><div className="l"><span>Cash</span><span>{num(sale.amount_tendered)}</span></div><div className="l"><span>Change</span><span>{num(sale.change_due)}</span></div></>}
      <hr />
      {sale.voided && <div className="c" style={{ fontWeight: 700 }}>*** VOIDED: {sale.void_reason} ***</div>}
      <div className="c">Thank you. Get well soon!</div>
      <div className="c small">Powered by FirstMeds · firstmeds.ug</div>
    </div>
  );
}

export function SaleDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { can } = useAuth();
  const state = useApi(`/sales/${id}`, [id]);
  const [voiding, setVoiding] = useState(false);
  const f = useForm({ reason: '' });

  return (
    <div className="page">
      <Loader state={state}>{(sale) => {
        const text = `${sale.pharmacy_name} receipt ${sale.receipt_no}: ${sale.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}. Total UGX ${num(sale.total)}. Thank you!`;
        return (
          <>
            <div className="no-print">
              {params.get('new') && <div className="alert success" style={{ marginBottom: 16 }}>Sale saved. Change due: <strong>{ugx(sale.change_due || 0)}</strong></div>}
              <PageTitle title={`Receipt ${sale.receipt_no}`} subtitle={dateTime(sale.created_at)}>
                <Link to="/app/pos" className="btn">+ Next sale</Link>
                <button className="btn secondary" onClick={() => window.print()}>Print</button>
                {sale.patient_phone && <a className="btn secondary" href={`https://wa.me/${sale.patient_phone.replace('+', '')}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                {!sale.voided && can('admin', 'owner', 'pharmacist') && <button className="btn secondary" onClick={() => setVoiding(true)}>Void</button>}
              </PageTitle>
            </div>
            <Receipt sale={sale} />
            {voiding && (
              <Modal title="Void this sale?" onClose={() => setVoiding(false)}>
                <form className="stack" onSubmit={f.submit(async (v) => { const s = await api.post(`/sales/${sale.id}/void`, v); state.setData(s); setVoiding(false); })}>
                  <p className="muted" style={{ margin: 0 }}>The stock will be returned to the original batches. This cannot be undone.</p>
                  <ErrorBox error={f.error} />
                  <Field label="Reason *"><input required value={f.values.reason} onChange={f.set('reason')} placeholder="e.g. Wrong item entered" /></Field>
                  <div className="form-actions"><button type="button" className="btn secondary" onClick={() => setVoiding(false)}>Cancel</button><button className="btn danger" disabled={f.busy}>Void sale</button></div>
                </form>
              </Modal>
            )}
          </>
        );
      }}</Loader>
    </div>
  );
}
