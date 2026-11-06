import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useDebounced, Loader, PageTitle, Badge, Empty, Modal, Field, ErrorBox, useForm, Tabs, Spinner } from '../components/UI.jsx';
import { ugx, num, date, dateTime, daysUntil, todayEAT } from '../format.js';

function ExpiryBadge({ d }) {
  if (!d) return <span className="muted">—</span>;
  const n = daysUntil(d);
  if (n < 0) return <Badge tone="red">Expired {date(d)}</Badge>;
  if (n <= 90) return <Badge tone="amber">{date(d)} · {n}d</Badge>;
  return <span>{date(d)}</span>;
}

function ProductPanel({ item, onClose, onChanged }) {
  const { can } = useAuth();
  const batches = useApi(`/inventory/${item.product_id}/batches`, [item.product_id]);
  const moves = useApi(`/inventory/movements?product_id=${item.product_id}`, [item.product_id]);
  const [adjust, setAdjust] = useState(null);
  const settings = useForm({ price: item.price, reorder_level: item.reorder_level });
  const adj = useForm({ change: '', reason: '', type: 'adjust' });

  return (
    <Modal title={`${item.name} ${item.strength || ''}`} onClose={onClose} wide>
      <div className="stack">
        <div className="grid cols-3">
          <div className="stat"><span className="label">Sellable stock</span><span className="value">{num(item.in_stock)}</span><span className="sub">{item.unit}s</span></div>
          <div className="stat"><span className="label">Selling price</span><span className="value">{ugx(item.price)}</span></div>
          <div className="stat"><span className="label">Stock value (cost)</span><span className="value">{ugx(item.stock_value)}</span></div>
        </div>

        {can('admin', 'owner') && (
          <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={settings.submit(async (v) => { await api.put(`/inventory/${item.product_id}/settings`, { price: Number(v.price), reorder_level: Number(v.reorder_level) }); onChanged(); })}>
            <Field label="Price (UGX)"><input type="number" min="0" value={settings.values.price} onChange={settings.set('price')} style={{ width: 140 }} /></Field>
            <Field label="Reorder at"><input type="number" min="0" value={settings.values.reorder_level} onChange={settings.set('reorder_level')} style={{ width: 110 }} /></Field>
            <button className="btn secondary" disabled={settings.busy}>Save</button>
            <ErrorBox error={settings.error} />
          </form>
        )}

        <div>
          <h3>Batches</h3>
          {batches.loading ? <Spinner /> : !batches.data?.length ? <Empty>No batches received.</Empty> : (
            <div className="table-wrap card flush">
              <table className="table">
                <thead><tr><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">Cost</th><th>Supplier</th><th>Received</th><th /></tr></thead>
                <tbody>
                  {batches.data.map((b) => (
                    <tr key={b.id} style={b.quantity === 0 ? { opacity: 0.5 } : undefined}>
                      <td className="mono">{b.batch_no}</td>
                      <td><ExpiryBadge d={b.expiry_date} /></td>
                      <td className="num">{num(b.quantity)}</td>
                      <td className="num">{num(b.cost_price)}</td>
                      <td>{b.supplier || '—'}</td>
                      <td className="nowrap">{date(b.received_at)}</td>
                      <td>{can('admin', 'owner', 'pharmacist') && b.quantity > 0 && (
                        <button className="btn sm secondary" onClick={() => { adj.setValues({ change: b.expiry_date < todayEAT() ? String(-b.quantity) : '', reason: b.expiry_date < todayEAT() ? 'Expired — removed from shelf' : '', type: b.expiry_date < todayEAT() ? 'expire' : 'adjust' }); setAdjust(b); }}>Adjust</button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {adjust && (
          <form className="card stack" onSubmit={adj.submit(async (v) => {
            await api.post('/inventory/adjust', { batch_id: adjust.id, change: Number(v.change), reason: v.reason, type: v.type });
            setAdjust(null); batches.reload(); moves.reload(); onChanged();
          })}>
            <strong>Adjust batch {adjust.batch_no} (now {adjust.quantity})</strong>
            <ErrorBox error={adj.error} />
            <div className="form-grid">
              <Field label="Change (+/−)"><input type="number" required value={adj.values.change} onChange={adj.set('change')} placeholder="-2" /></Field>
              <Field label="Type">
                <select value={adj.values.type} onChange={adj.set('type')}>
                  <option value="adjust">Stock count correction / damage</option>
                  <option value="expire">Expired write-off</option>
                </select>
              </Field>
              <Field label="Reason *" className="full"><input required value={adj.values.reason} onChange={adj.set('reason')} /></Field>
            </div>
            <div className="form-actions"><button type="button" className="btn secondary" onClick={() => setAdjust(null)}>Cancel</button><button className="btn" disabled={adj.busy}>Save adjustment</button></div>
          </form>
        )}

        <div>
          <h3>Recent movements</h3>
          {moves.data?.length ? (
            <div className="table-wrap card flush" style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table className="table">
                <thead><tr><th>When</th><th>Type</th><th className="num">Qty</th><th>Batch</th><th>Note</th><th>By</th></tr></thead>
                <tbody>
                  {moves.data.slice(0, 50).map((m) => (
                    <tr key={m.id}>
                      <td className="nowrap">{dateTime(m.created_at)}</td>
                      <td><Badge tone={m.quantity > 0 ? 'green' : m.type === 'sale' ? '' : 'amber'}>{m.type}</Badge></td>
                      <td className="num">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                      <td className="mono">{m.batch_no}</td>
                      <td className="small">{m.reason}</td>
                      <td className="small">{m.user_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No movements.</Empty>}
        </div>
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const { can, activePharmacy } = useAuth();
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') || 'all';
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const state = useApi(`/inventory?q=${encodeURIComponent(dq)}`, [dq, activePharmacy]);
  const alerts = useApi('/inventory/alerts', [activePharmacy]);
  const [open, setOpen] = useState(null);

  const filters = {
    all: (s) => s.in_stock > 0 || s.expired_qty > 0,
    low: (s) => s.in_stock > 0 && s.in_stock <= s.reorder_level,
    out: (s) => s.in_stock === 0 && (s.expired_qty > 0 || alerts.data?.out_of_stock.some((o) => o.product_id === s.product_id)),
    catalogue: () => true,
  };

  return (
    <div className="page">
      <PageTitle title="Inventory" subtitle="Sellable stock excludes expired batches.">
        {can('admin', 'owner', 'pharmacist') && <Link className="btn" to="/app/receive">+ Receive stock</Link>}
      </PageTitle>
      <Tabs
        value={filter}
        onChange={(k) => setParams(k === 'all' ? {} : { filter: k })}
        tabs={[
          ['all', 'In stock'],
          ['low', `Low stock${alerts.data ? ` (${alerts.data.low_stock.filter((s) => s.in_stock > 0).length})` : ''}`],
          ['out', `Out of stock${alerts.data ? ` (${alerts.data.out_of_stock.length})` : ''}`],
          ['expiring', `Expiring${alerts.data ? ` (${alerts.data.expiring.length + alerts.data.expired.length})` : ''}`],
          ['catalogue', 'Full catalogue'],
        ]}
      />
      {filter === 'expiring' ? (
        <Loader state={alerts}>{(a) => (
          <div className="card flush">
            {!a.expired.length && !a.expiring.length ? <Empty>No batches expire in the next 90 days. 🎉</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th>Action</th></tr></thead>
                  <tbody>
                    {[...a.expired, ...a.expiring].map((b) => (
                      <tr key={b.id}>
                        <td><strong>{b.name}</strong> <span className="muted small">{b.strength}</span></td>
                        <td className="mono">{b.batch_no}</td>
                        <td><ExpiryBadge d={b.expiry_date} /></td>
                        <td className="num">{num(b.quantity)}</td>
                        <td className="small muted">{daysUntil(b.expiry_date) < 0 ? 'Remove from shelf & write off' : 'Sell first or return to supplier'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}</Loader>
      ) : (
        <>
          <input placeholder="Search medicines…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Search inventory" />
          <Loader state={state}>{(rows) => {
            const list = rows.filter(filters[filter] || filters.all);
            return (
              <div className="card flush">
                {!list.length ? <Empty>Nothing to show.</Empty> : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Medicine</th><th>Category</th><th className="num">In stock</th><th className="num">Reorder at</th><th>Next expiry</th><th className="num">Price</th><th className="num">Value (cost)</th></tr></thead>
                      <tbody>
                        {list.map((s) => (
                          <tr key={s.product_id} className="clickable" onClick={() => setOpen(s)}>
                            <td><strong>{s.name}</strong> <span className="muted small">{s.strength}</span> {s.requires_prescription ? <Badge tone="blue">Rx</Badge> : null}</td>
                            <td className="small">{s.category}</td>
                            <td className="num">
                              {s.in_stock === 0 ? <Badge tone="red">0</Badge> : s.in_stock <= s.reorder_level ? <Badge tone="amber">{num(s.in_stock)}</Badge> : num(s.in_stock)}
                              {s.expired_qty > 0 && <div className="small" style={{ color: 'var(--danger)' }}>+{s.expired_qty} expired</div>}
                            </td>
                            <td className="num">{s.reorder_level}</td>
                            <td><ExpiryBadge d={s.next_expiry} /></td>
                            <td className="num">{ugx(s.price)}</td>
                            <td className="num">{num(s.stock_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          }}</Loader>
        </>
      )}
      {open && <ProductPanel item={open} onClose={() => setOpen(null)} onChanged={() => { state.reload(); alerts.reload(); }} />}
    </div>
  );
}

const blankLine = () => ({ key: Math.random(), product_id: '', batch_no: '', expiry_date: '', quantity: '', cost_price: '', price: '' });

export function ReceiveStock() {
  const nav = useNavigate();
  const products = useApi('/inventory');
  const [supplier, setSupplier] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key, field, value) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/inventory/receive', {
        supplier,
        items: lines.filter((l) => l.product_id).map((l) => ({
          product_id: Number(l.product_id), batch_no: l.batch_no, expiry_date: l.expiry_date, quantity: Number(l.quantity),
          cost_price: l.cost_price ? Number(l.cost_price) : 0, price: l.price === '' ? undefined : Number(l.price),
        })),
      });
      nav('/app/inventory');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageTitle title="Receive stock" subtitle="Record a delivery from your supplier. Each line is one batch." />
      <form className="card stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Joint Medical Store" list="suppliers" /></Field>
        <datalist id="suppliers">{['Joint Medical Store', 'National Medical Stores', 'Kampala Pharma Wholesalers', 'Abacus Distributors', 'Unity Medical Supplies'].map((s) => <option key={s} value={s} />)}</datalist>
        {lines.map((l, i) => {
          const p = products.data?.find((x) => String(x.product_id) === String(l.product_id));
          return (
            <div key={l.key} className="form-grid" style={{ paddingBottom: 14, borderBottom: '1px dashed var(--border)' }}>
              <Field label={`Medicine #${i + 1} *`} className="full">
                <select required={i === 0} value={l.product_id} onChange={(e) => set(l.key, 'product_id', e.target.value)}>
                  <option value="">Choose…</option>
                  {products.data?.map((x) => <option key={x.product_id} value={x.product_id}>{x.name} {x.strength} ({x.in_stock} in stock)</option>)}
                </select>
              </Field>
              <Field label="Batch no. *"><input required={!!l.product_id} value={l.batch_no} onChange={(e) => set(l.key, 'batch_no', e.target.value)} /></Field>
              <Field label="Expiry date *"><input required={!!l.product_id} type="date" min={todayEAT()} value={l.expiry_date} onChange={(e) => set(l.key, 'expiry_date', e.target.value)} /></Field>
              <Field label={`Quantity (${p?.unit || 'units'}) *`}><input required={!!l.product_id} type="number" min="1" value={l.quantity} onChange={(e) => set(l.key, 'quantity', e.target.value)} /></Field>
              <Field label="Unit cost (UGX)"><input type="number" min="0" value={l.cost_price} onChange={(e) => set(l.key, 'cost_price', e.target.value)} /></Field>
              <Field label={`Selling price${p ? ` (now ${num(p.price)})` : ''}`}><input type="number" min="0" value={l.price} onChange={(e) => set(l.key, 'price', e.target.value)} placeholder="keep current" /></Field>
              {lines.length > 1 && <div className="row" style={{ alignItems: 'flex-end' }}><button type="button" className="btn ghost sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove line</button></div>}
            </div>
          );
        })}
        <div className="row between">
          <button type="button" className="btn secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add another medicine</button>
          <button className="btn lg" disabled={busy}>{busy ? 'Saving…' : 'Save delivery'}</button>
        </div>
      </form>
    </div>
  );
}
