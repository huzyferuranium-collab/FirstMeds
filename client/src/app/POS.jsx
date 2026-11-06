import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useDebounced, Spinner, ErrorBox, Modal, Field, Badge, Empty } from '../components/UI.jsx';
import { ugx, num, phone as fmtPhone, PAYMENT_LABELS } from '../format.js';
import { PatientForm } from './Patients.jsx';

function PatientPicker({ patient, setPatient }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q);
  const results = useApi(dq.length >= 2 ? `/patients?q=${encodeURIComponent(dq)}` : null, [dq]);

  if (patient) {
    return (
      <div className="row between" style={{ background: 'var(--brand-50)', padding: '10px 12px', borderRadius: 10 }}>
        <div>
          <strong>{patient.name}</strong>
          <div className="small muted">{fmtPhone(patient.phone)}{patient.programs ? ` · ${patient.programs}` : ''}</div>
        </div>
        <button className="btn sm ghost" onClick={() => setPatient(null)}>Change</button>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input placeholder="Patient name or phone (optional)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find patient" />
        <button className="btn secondary sm" onClick={() => setCreating(true)} title="Register new patient">+ New</button>
      </div>
      {dq.length >= 2 && results.data && (
        <div className="card flush" style={{ position: 'absolute', left: 0, right: 0, top: 46, zIndex: 10, maxHeight: 260, overflowY: 'auto' }}>
          {results.data.length === 0 ? <div className="empty small">No match. <button className="btn sm ghost" onClick={() => setCreating(true)}>Register “{q}”</button></div> :
            results.data.slice(0, 8).map((p) => (
              <button key={p.id} className="btn ghost block" style={{ justifyContent: 'space-between', borderRadius: 0, color: 'var(--text)' }} onClick={() => { setPatient(p); setQ(''); }}>
                <span>{p.name}</span><span className="small muted">{fmtPhone(p.phone)} {p.programs && <Badge tone="green">{p.programs}</Badge>}</span>
              </button>
            ))}
        </div>
      )}
      {creating && (
        <Modal title="Register patient" onClose={() => setCreating(false)}>
          <PatientForm initial={{ name: /\d/.test(q) ? '' : q, phone: /\d/.test(q) ? q : '' }} onSaved={(p) => { setPatient({ ...p, programs: '' }); setCreating(false); setQ(''); }} />
        </Modal>
      )}
    </div>
  );
}

const METHODS = ['cash', 'mtn_momo', 'airtel_money', 'card'];

export default function POS() {
  const { can, activePharmacy } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 150);
  const stock = useApi(`/inventory?stocked=1&q=${encodeURIComponent(dq)}`, [dq, activePharmacy]);
  const programs = useApi('/programs?active=1');
  const [cart, setCart] = useState([]);
  const [patient, setPatient] = useState(null);
  const [programId, setProgramId] = useState('');
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('cash');
  const [ref, setRef] = useState('');
  const [tendered, setTendered] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const stockMap = useMemo(() => new Map((stock.data || []).map((s) => [s.product_id, s])), [stock.data]);

  // Programs this patient can use: enrollment-free ones, or those they are enrolled in.
  const enrolledCodes = (patient?.programs || '').split(',').filter(Boolean);
  const usablePrograms = (programs.data || []).filter((p) => !p.requires_enrollment || enrolledCodes.includes(p.code));
  const eligibleIds = useMemo(() => {
    const p = programs.data?.find((x) => String(x.id) === String(programId));
    return new Set(p?.products.map((x) => x.id) || []);
  }, [programs.data, programId]);

  // Suggest a programme automatically when the cart contains eligible items (until the user picks one).
  const [programTouched, setProgramTouched] = useState(false);
  useEffect(() => {
    if (programTouched || programId || !cart.length) return;
    const match = usablePrograms.find((p) => cart.some((c) => p.products.some((x) => x.id === c.product_id)));
    if (match) setProgramId(String(match.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, patient, programs.data]);

  const body = {
    items: cart.map((c) => ({ product_id: c.product_id, quantity: c.quantity, days_supply: c.days_supply || 0 })),
    patient_id: patient?.id,
    program_id: programId || undefined,
    discount: discount ? Number(discount) : undefined,
  };

  useEffect(() => {
    // Drop the old quote immediately; only the response for the current basket may set a new one.
    setQuote(null);
    setQuoteErr(null);
    if (!cart.length) return;
    let current = true;
    const t = setTimeout(() => {
      api.post('/sales/quote', body)
        .then((r) => { if (current) setQuote(r); })
        .catch((e) => { if (current) setQuoteErr(e); });
    }, 120);
    return () => { current = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(body)]);

  const add = (s) => setCart((c) => {
    const i = c.findIndex((x) => x.product_id === s.product_id);
    if (i >= 0) return c.map((x, j) => (j === i ? { ...x, quantity: Math.min(x.quantity + 1, s.in_stock) } : x));
    return [...c, { product_id: s.product_id, name: s.name, strength: s.strength, price: s.price, quantity: 1, days_supply: 0, rx: s.requires_prescription }];
  });
  const update = (id, patch) => setCart((c) => c.map((x) => (x.product_id === id ? { ...x, ...patch } : x)).filter((x) => x.quantity > 0));

  const total = quote?.total ?? cart.reduce((a, c) => a + c.price * c.quantity, 0);
  const isMomo = method === 'mtn_momo' || method === 'airtel_money';
  const change = method === 'cash' && tendered ? Number(tendered) - total : null;

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const sale = await api.post('/sales', {
        ...body,
        payment_method: total === 0 ? 'program' : method,
        payment_ref: isMomo ? ref : undefined,
        amount_tendered: method === 'cash' && tendered ? Number(tendered) : undefined,
      });
      nav(`/app/sales/${sale.id}?new=1`);
    } catch (e) {
      setError(e);
      stock.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="pos">
        <div className="stack">
          <div className="row between">
            <h1 style={{ margin: 0, fontSize: 24 }}>New sale</h1>
            <span className="small muted">Showing medicines in stock · first-expiry stock is sold first</span>
          </div>
          <input autoFocus placeholder="Search medicine by name, generic or category…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" style={{ padding: 14, fontSize: 16 }} />
          {stock.loading && !stock.data ? <Spinner /> : stock.data?.length === 0 ? <Empty>No medicines in stock match “{q}”.</Empty> : (
            <div className="product-grid">
              {stock.data?.map((s) => {
                const inCart = cart.find((c) => c.product_id === s.product_id)?.quantity || 0;
                return (
                  <button key={s.product_id} className="product-tile" onClick={() => add(s)} disabled={inCart >= s.in_stock}>
                    <span className="n">{s.name}</span>
                    <span className="s">{s.strength} {s.form}</span>
                    <span className="s">
                      {s.in_stock <= s.reorder_level ? <Badge tone="amber">{num(s.in_stock)} left</Badge> : `${num(s.in_stock)} in stock`}
                      {s.requires_prescription ? <> · <Badge tone="blue">Rx</Badge></> : null}
                    </span>
                    <span className="p">{ugx(s.price)}{inCart ? <Badge tone="green">×{inCart}</Badge> : null}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card cart">
          <div className="card-head"><h3>Basket</h3>{cart.length > 0 && <button className="btn sm ghost" onClick={() => { setCart([]); setProgramId(''); setProgramTouched(false); setDiscount(''); }}>Clear</button>}</div>
          <PatientPicker patient={patient} setPatient={(p) => { setPatient(p); setProgramId(''); setProgramTouched(false); }} />

          {cart.length === 0 ? <Empty>Tap a medicine to add it.</Empty> : cart.map((c) => {
            const line = quote?.lines.find((l) => l.product_id === c.product_id);
            const max = stockMap.get(c.product_id)?.in_stock ?? c.quantity;
            return (
              <div className="cart-line" key={c.product_id}>
                <div>
                  <div className="name">{c.name} {c.rx ? <Badge tone="blue">Rx</Badge> : null}</div>
                  <div className="small muted">{[c.strength, `${ugx(c.price)} each`].filter(Boolean).join(' · ')}</div>
                  {patient && (
                    <label className="small muted row" style={{ gap: 6, marginTop: 4 }}>
                      Refill in
                      <input type="number" min="0" max="365" value={c.days_supply || ''} placeholder="0" onChange={(e) => update(c.product_id, { days_supply: Number(e.target.value) || 0 })} style={{ width: 64, padding: '3px 6px' }} aria-label="Days supply" />
                      days
                    </label>
                  )}
                </div>
                <div className="right">
                  <div className="qty">
                    <button onClick={() => update(c.product_id, { quantity: c.quantity - 1 })} aria-label="Less">−</button>
                    <input value={c.quantity} inputMode="numeric" onChange={(e) => update(c.product_id, { quantity: Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), max) })} aria-label="Quantity" />
                    <button onClick={() => update(c.product_id, { quantity: Math.min(c.quantity + 1, max) })} aria-label="More">+</button>
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 6 }}>{ugx(c.price * c.quantity)}</div>
                  {line?.subsidy > 0 && <div className="small" style={{ color: 'var(--brand)' }}>−{ugx(line.subsidy)}</div>}
                  {programId && eligibleIds.has(c.product_id) && !line?.subsidy && <div className="small muted">eligible</div>}
                </div>
              </div>
            );
          })}

          {cart.length > 0 && (
            <>
              <div className="stack" style={{ gap: 10, marginTop: 14 }}>
                <Field label="Programme">
                  <select value={programId} onChange={(e) => { setProgramTouched(true); setProgramId(e.target.value); }}>
                    <option value="">None</option>
                    {usablePrograms.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.discount_percent}% off)</option>)}
                  </select>
                </Field>
                {!patient && programs.data?.some((p) => p.requires_enrollment) && <span className="small muted">Select an enrolled patient to use Heart & Sugar Care or Mama First.</span>}
                {can('admin', 'owner', 'pharmacist') && (
                  <Field label="Discount (UGX)"><input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
                )}
              </div>
              <ErrorBox error={quoteErr} />
              <div className="totals">
                <div><span>Subtotal</span><span className="mono">{ugx(quote?.subtotal ?? total)}</span></div>
                {quote?.subsidy_total > 0 && <div style={{ color: 'var(--brand)' }}><span>{quote.program?.name}</span><span className="mono">−{ugx(quote.subsidy_total)}</span></div>}
                {quote?.discount_total > 0 && <div><span>Discount</span><span className="mono">−{ugx(quote.discount_total)}</span></div>}
                <div className="grand"><span>To pay</span><span className="mono">{ugx(total)}</span></div>
              </div>
              {total > 0 && (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="pay-methods">
                    {METHODS.map((m) => <button key={m} className={method === m ? 'active' : ''} onClick={() => setMethod(m)}>{PAYMENT_LABELS[m]}</button>)}
                  </div>
                  {method === 'cash' && (
                    <Field label="Cash received">
                      <input type="number" min="0" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(total)} />
                    </Field>
                  )}
                  {change != null && <div className={`alert ${change < 0 ? 'error' : 'success'}`}>{change < 0 ? `Short by ${ugx(-change)}` : `Change: ${ugx(change)}`}</div>}
                  {isMomo && (
                    <Field label={`${PAYMENT_LABELS[method]} transaction ID *`}>
                      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. MP240917.1234.A56789" />
                    </Field>
                  )}
                </div>
              )}
              <ErrorBox error={error} />
              <button className="btn lg block" style={{ marginTop: 14 }} disabled={busy || !quote || !!quoteErr || (isMomo && total > 0 && !ref) || (change != null && change < 0)} onClick={checkout}>
                {busy ? 'Saving…' : !quote && !quoteErr ? 'Checking prices…' : total === 0 ? 'Complete (fully subsidised)' : `Charge ${ugx(total)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
