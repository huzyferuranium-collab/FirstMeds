import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useDebounced, Loader, PageTitle, Badge, Empty, Modal, Field, ErrorBox, Tabs, Stat } from '../components/UI.jsx';
import { ugx, num, date, todayEAT, daysUntil } from '../format.js';

const PO_TONE = { draft: '', sent: 'blue', received: 'green', cancelled: 'red' };

function Suggestions({ onCreated }) {
  const { activePharmacy } = useAuth();
  const state = useApi('/purchasing/suggestions', [activePharmacy]);
  const suppliers = useApi('/purchasing/suppliers');
  const [qty, setQty] = useState({});
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const create = async (rows) => {
    setBusy(true);
    setErr(null);
    try {
      // One purchase order per supplier.
      const bySupplier = new Map();
      for (const r of rows) {
        const sid = Number(pick[r.product_id] || r.best_supplier_id);
        if (!sid) continue;
        if (!bySupplier.has(sid)) bySupplier.set(sid, []);
        bySupplier.get(sid).push({ product_id: r.product_id, quantity: Number(qty[r.product_id] ?? r.suggested_qty) });
      }
      const created = [];
      for (const [supplier_id, items] of bySupplier) created.push(await api.post('/purchasing/orders', { supplier_id, items: items.filter((i) => i.quantity > 0) }));
      onCreated(created);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Loader state={state}>{(rows) => !rows.length ? <Empty>Nothing needs ordering right now. 🎉</Empty> : (
      <div className="card flush">
        <div className="row between" style={{ padding: '14px 16px' }}>
          <div><strong>{rows.length} medicines to reorder</strong><div className="small muted">Based on the last 30 days of sales, supplier lead time and 2 weeks of cover. Cheapest supplier pre-selected.</div></div>
          <button className="btn" disabled={busy} onClick={() => create(rows)}>Create purchase orders</button>
        </div>
        <ErrorBox error={err} />
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Medicine</th><th className="num">In stock</th><th className="num">Sells / day</th><th>Runs out</th><th className="num">Order qty</th><th>Supplier (best price)</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.product_id}>
              <td><strong>{r.name}</strong> <span className="small muted">{r.strength}</span>{r.urgent && <> <Badge tone="red">urgent</Badge></>}{r.on_order > 0 && <div className="small muted">{r.on_order} already on order</div>}</td>
              <td className="num">{num(r.in_stock)}</td>
              <td className="num">{r.per_day}</td>
              <td>{r.days_left === null ? '—' : r.days_left <= 0 ? <Badge tone="red">today</Badge> : `${r.days_left} days`}</td>
              <td className="num"><input type="number" min="0" style={{ width: 90, padding: '4px 8px' }} value={qty[r.product_id] ?? r.suggested_qty} onChange={(e) => setQty({ ...qty, [r.product_id]: e.target.value })} aria-label="Order quantity" /></td>
              <td>
                <select style={{ padding: '4px 8px' }} value={pick[r.product_id] || r.best_supplier_id || ''} onChange={(e) => setPick({ ...pick, [r.product_id]: e.target.value })} aria-label="Supplier">
                  {!r.best_supplier_id && <option value="">No price on file</option>}
                  {suppliers.data?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === r.best_supplier_id ? ` — ${ugx(r.best_price)} (best)` : ''}</option>)}
                </select>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    )}</Loader>
  );
}

function OrderDetail({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const state = useApi(`/purchasing/orders/${id}`, [id]);
  const [lines, setLines] = useState({});
  const [pay, setPay] = useState('');
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const act = async (fn) => {
    setErr(null);
    try { const r = await fn(); state.setData(r); onChanged(); if (r.quarantined?.length) setMsg(`Quarantined on arrival (flagged batches): ${r.quarantined.join(', ')}`); } catch (e) { setErr(e); }
  };
  return (
    <Modal title="Purchase order" onClose={onClose} wide>
      <Loader state={state}>{(po) => (
        <div className="stack">
          <div className="row between">
            <div><h3 style={{ margin: 0 }}>{po.po_no} <Badge tone={PO_TONE[po.status]}>{po.status}</Badge></h3>
              <div className="small muted">{po.supplier_name} · {po.supplier_phone || ''} · created {date(po.created_at)} by {po.created_by_name}</div></div>
            <div className="right"><div className="small muted">Total</div><strong style={{ fontSize: 20 }}>{ugx(po.total)}</strong></div>
          </div>
          <ErrorBox error={err} />
          {msg && <div className="alert warn">{msg}</div>}
          <div className="table-wrap card flush"><table className="table">
            <thead><tr><th>Medicine</th><th className="num">Ordered</th><th className="num">Unit cost</th>
              {['draft', 'sent'].includes(po.status) ? <><th>Received qty</th><th>Batch no.</th><th>Expiry</th></> : <th className="num">Received</th>}</tr></thead>
            <tbody>{po.items.map((i) => {
              const l = lines[i.id] || {};
              const set = (k) => (e) => setLines({ ...lines, [i.id]: { quantity: i.quantity, ...l, [k]: e.target.value } });
              return (
                <tr key={i.id}>
                  <td><strong>{i.name}</strong> <span className="small muted">{i.strength}</span></td>
                  <td className="num">{num(i.quantity)}</td><td className="num">{num(i.unit_cost)}</td>
                  {['draft', 'sent'].includes(po.status) ? <>
                    <td><input type="number" min="0" style={{ width: 80, padding: '4px 6px' }} value={l.quantity ?? i.quantity} onChange={set('quantity')} /></td>
                    <td><input style={{ width: 120, padding: '4px 6px' }} value={l.batch_no || ''} onChange={set('batch_no')} /></td>
                    <td><input type="date" min={todayEAT()} style={{ padding: '4px 6px' }} value={l.expiry_date || ''} onChange={set('expiry_date')} /></td>
                  </> : <td className="num">{num(i.received_qty)}</td>}
                </tr>
              );
            })}</tbody>
          </table></div>
          {po.status === 'draft' && <div className="form-actions"><button className="btn secondary" onClick={() => act(() => api.post(`/purchasing/orders/${po.id}/cancel`))}>Cancel order</button>
            <a className="btn secondary" href={`https://wa.me/${(po.supplier_phone || '').replace('+', '')}?text=${encodeURIComponent(`Order ${po.po_no} from ${po.pharmacy_name}:\n${po.items.map((i) => `- ${i.name} ${i.strength || ''} x ${i.quantity}`).join('\n')}`)}`} target="_blank" rel="noreferrer">Send by WhatsApp</a>
            <button className="btn" onClick={() => act(() => api.post(`/purchasing/orders/${po.id}/send`))}>Mark as sent</button></div>}
          {['draft', 'sent'].includes(po.status) && (
            <div className="form-actions">
              <span className="small muted">Enter batch numbers and expiry dates from the delivery note. Expired or flagged batches are refused or quarantined.</span>
              <button className="btn" onClick={() => act(() => api.post(`/purchasing/orders/${po.id}/receive`, {
                lines: po.items.map((i) => ({ po_item_id: i.id, quantity: Number((lines[i.id] || {}).quantity ?? i.quantity), ...(lines[i.id] || {}) })),
              }))}>Receive delivery</button>
            </div>
          )}
          {po.status === 'received' && (
            <div className="card">
              <div className="row between"><strong>Payment</strong><span>Paid {ugx(po.paid)} of {ugx(po.total)} · due {date(po.due_date)}</span></div>
              {po.payments.map((p) => <div key={p.id} className="small muted">{date(p.created_at)} · {ugx(p.amount)} by {p.method} {p.reference}</div>)}
              {po.balance > 0 && can('admin', 'owner') && (
                <div className="row" style={{ marginTop: 10 }}>
                  <input type="number" min="1" max={po.balance} placeholder={String(po.balance)} value={pay} onChange={(e) => setPay(e.target.value)} style={{ width: 160 }} />
                  <button className="btn" onClick={() => act(() => api.post(`/purchasing/orders/${po.id}/payments`, { amount: Number(pay || po.balance), method: 'mtn_momo' })).then(() => setPay(''))}>Record payment</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}</Loader>
    </Modal>
  );
}

function Orders({ openId, setOpenId }) {
  const { activePharmacy } = useAuth();
  const state = useApi('/purchasing/orders', [activePharmacy]);
  return (
    <>
      <Loader state={state}>{(rows) => !rows.length ? <Empty>No purchase orders yet.</Empty> : (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Order</th><th>Supplier</th><th>Created</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th><th>Due</th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id} className="clickable" onClick={() => setOpenId(p.id)}>
              <td className="mono">{p.po_no}</td><td>{p.supplier_name}</td><td className="small nowrap">{date(p.created_at)}</td>
              <td><Badge tone={PO_TONE[p.status]}>{p.status}</Badge></td><td className="num">{ugx(p.total)}</td>
              <td className="num">{p.balance ? <strong>{ugx(p.balance)}</strong> : '—'}</td>
              <td className="small nowrap">{p.balance ? (daysUntil(p.due_date) < 0 ? <Badge tone="red">overdue {date(p.due_date)}</Badge> : date(p.due_date)) : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}</Loader>
      {openId && <OrderDetail id={openId} onClose={() => setOpenId(null)} onChanged={state.reload} />}
    </>
  );
}

function Compare() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const state = useApi(`/purchasing/compare?q=${encodeURIComponent(dq)}`, [dq]);
  return (
    <>
      <input placeholder="Search medicine…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <Loader state={state}>{(rows) => (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Medicine</th><th>Cheapest</th><th>Other suppliers</th><th className="num">Save</th></tr></thead>
          <tbody>{rows.map((p) => {
            const [best, ...rest] = p.offers.filter((o) => o.in_stock);
            return (
              <tr key={p.product_id}>
                <td><strong>{p.name}</strong> <span className="small muted">{p.strength}</span></td>
                <td>{best ? <><strong>{ugx(best.price)}</strong><div className="small muted">{best.supplier} · {best.lead_time_days}d delivery{best.payment_terms_days ? ` · ${best.payment_terms_days}d credit` : ''}</div></> : '—'}</td>
                <td className="small">{rest.map((o) => `${o.supplier}: ${num(o.price)}`).join(' · ') || '—'}{p.offers.some((o) => !o.in_stock) && <div className="muted">Out of stock at: {p.offers.filter((o) => !o.in_stock).map((o) => o.supplier).join(', ')}</div>}</td>
                <td className="num">{p.saving_pct ? <Badge tone="green">up to {p.saving_pct}%</Badge> : '—'}</td>
              </tr>
            );
          })}</tbody>
        </table></div></div>
      )}</Loader>
    </>
  );
}

function Payables() {
  const { activePharmacy } = useAuth();
  const state = useApi('/purchasing/payables', [activePharmacy]);
  const spend = useApi('/purchasing/spend', [activePharmacy]);
  return (
    <Loader state={state}>{(p) => (
      <div className="stack">
        <div className="grid cols-3">
          <Stat label="Owed to suppliers" value={ugx(p.outstanding)} />
          <Stat label="Overdue" value={ugx(p.overdue)} tone={p.overdue ? 'danger' : undefined} />
          <Stat label="Due in the next 7 days" value={ugx(p.due_7d)} />
        </div>
        <div className="grid cols-2" style={{ alignItems: 'start' }}>
          <div className="card flush">
            <div style={{ padding: '14px 16px' }}><h3 style={{ margin: 0 }}>Unpaid deliveries</h3></div>
            {!p.orders.length ? <Empty>All suppliers are paid. 🎉</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Order</th><th>Supplier</th><th className="num">Balance</th><th>Due</th></tr></thead>
                <tbody>{p.orders.map((o) => <tr key={o.id}><td className="mono">{o.po_no}</td><td>{o.supplier_name}</td><td className="num">{ugx(o.balance)}</td>
                  <td>{daysUntil(o.due_date) < 0 ? <Badge tone="red">{-daysUntil(o.due_date)}d overdue</Badge> : date(o.due_date)}</td></tr>)}</tbody>
              </table></div>
            )}
          </div>
          <div className="card">
            <h3>Spend by supplier (90 days)</h3>
            {!spend.data?.length ? <Empty>No deliveries yet.</Empty> : spend.data.map((s) => (
              <div key={s.supplier} className="row between small" style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}><span>{s.supplier} <span className="muted">({s.orders} orders)</span></span><strong>{ugx(s.total)}</strong></div>
            ))}
            <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>A clean payment record with FirstMeds can support supplier credit and stock financing.</p>
          </div>
        </div>
      </div>
    )}</Loader>
  );
}

export default function Purchasing() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'reorder';
  const [openId, setOpenId] = useState(null);
  const [created, setCreated] = useState(null);
  const tabs = useMemo(() => [['reorder', 'Reorder'], ['orders', 'Purchase orders'], ['compare', 'Compare prices'], ['payables', 'Supplier balances']], []);
  return (
    <div className="page">
      <PageTitle title="Purchasing" subtitle="Order the right quantities, from the cheapest reliable supplier, and keep track of what you owe." />
      <Tabs value={tab} onChange={(k) => setParams(k === 'reorder' ? {} : { tab: k })} tabs={tabs} />
      {created && <div className="alert success" style={{ marginBottom: 12 }}>Created {created.length} draft order(s): {created.map((c) => c.po_no).join(', ')}. Open one to send it to the supplier.</div>}
      {tab === 'reorder' && <Suggestions onCreated={(c) => { setCreated(c); setParams({ tab: 'orders' }); }} />}
      {tab === 'orders' && <Orders openId={openId} setOpenId={setOpenId} />}
      {tab === 'compare' && <Compare />}
      {tab === 'payables' && <Payables />}
    </div>
  );
}
