import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, Loader, PageTitle, Badge, Empty, Modal, Field, ErrorBox, useForm, Tabs } from '../components/UI.jsx';
import { date, dateTime, num, todayEAT } from '../format.js';
import { BarcodeScanner } from './POS.jsx';

const ISSUE_LABELS = {
  suspected_fake: 'Suspected fake', poor_quality: 'Poor quality', packaging: 'Damaged / odd packaging',
  adverse_reaction: 'Adverse reaction', unregistered: 'Not NDA registered',
};
const STATUS_TONE = { open: 'red', investigating: 'amber', reported_to_nda: 'amber', confirmed: 'red', cleared: 'green' };
const STATUS_LABEL = { open: 'Open', investigating: 'Investigating', reported_to_nda: 'Reported to NDA', confirmed: 'Confirmed fake', cleared: 'Cleared' };

const VERDICT = {
  ok: ['green', '✓ Registered — no alerts', 'This product is in the FirstMeds catalogue with an NDA registration number and no quality alerts.'],
  unverified: ['amber', '! Not verified', 'No NDA registration number on file. Do not buy or sell until HQ confirms it is registered.'],
  suspended: ['red', '✕ Suspended', 'This product has been suspended after a quality alert. Do not sell it.'],
  batch_alert: ['red', '✕ Batch under investigation', 'This batch has been reported as suspect. Quarantine it — do not sell.'],
  confirmed_fake: ['red', '✕ Confirmed fake', 'This batch has been confirmed falsified. Quarantine it and contact NDA.'],
};

function Verify() {
  const [code, setCode] = useState('');
  const [batch, setBatch] = useState('');
  const [scan, setScan] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const check = async (c = code) => {
    setErr(null);
    try { setRes(await api.get(`/quality/verify?code=${encodeURIComponent(c)}&batch=${encodeURIComponent(batch)}`)); } catch (e) { setErr(e); }
  };
  return (
    <div className="card stack">
      <div>
        <h3 style={{ marginBottom: 4 }}>Verify a medicine</h3>
        <p className="small muted" style={{ margin: 0 }}>Check deliveries and suspicious packs before they reach the shelf.</p>
      </div>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <Field label="Barcode or name"><input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type" /></Field>
        <Field label="Batch number (on the pack)"><input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. AL2409-117X" /></Field>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <button type="button" className="btn secondary" onClick={() => setScan(true)}>📷 Scan</button>
          <button className="btn">Check</button>
        </div>
      </form>
      <ErrorBox error={err} />
      {res && (!res.found ? (
        <div className="alert error"><strong>Not in the FirstMeds catalogue.</strong> It may be unregistered. Do not sell it — report it below.</div>
      ) : res.results.map((r) => {
        const [tone, title, text] = VERDICT[r.verdict];
        return (
          <div key={r.id} className={`alert ${tone === 'green' ? 'success' : tone === 'amber' ? 'warn' : 'error'}`}>
            <div className="row between"><strong>{r.name} {r.strength}</strong><span>{title}</span></div>
            <div className="small" style={{ marginTop: 4 }}>{text}</div>
            <div className="small" style={{ marginTop: 4 }}>NDA reg: {r.nda_reg_no || '—'} · Barcode: {r.barcode || '—'}</div>
            {r.alerts.length > 0 && <div className="small" style={{ marginTop: 4 }}>Alerts: {r.alerts.map((a) => `batch ${a.batch_no} (${STATUS_LABEL[a.status]}, ${a.district})`).join('; ')}</div>}
          </div>
        );
      }))}
      {scan && <BarcodeScanner onCode={(c) => { setScan(false); setCode(c); check(c); }} onClose={() => setScan(false)} />}
    </div>
  );
}

function ReportForm({ onDone }) {
  const products = useApi('/products');
  const f = useForm({ product_id: '', batch_no: '', supplier: '', issue_type: 'suspected_fake', description: '' });
  const batches = useApi(f.values.product_id ? `/inventory/${f.values.product_id}/batches` : null, [f.values.product_id]);
  return (
    <form className="stack" onSubmit={f.submit(async (v) => onDone(await api.post('/quality', { ...v, product_id: Number(v.product_id) })))}>
      <ErrorBox error={f.error} />
      <div className="form-grid">
        <Field label="Medicine *" className="full">
          <select required value={f.values.product_id} onChange={f.set('product_id')}>
            <option value="">Choose…</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name} {p.strength}</option>)}
          </select>
        </Field>
        <Field label="Batch number *">
          <input required list="my-batches" value={f.values.batch_no} onChange={f.set('batch_no')} />
          <datalist id="my-batches">{batches.data?.map((b) => <option key={b.id} value={b.batch_no}>{b.supplier}</option>)}</datalist>
        </Field>
        <Field label="Supplier"><input value={f.values.supplier} onChange={f.set('supplier')} /></Field>
        <Field label="Problem *" className="full">
          <select value={f.values.issue_type} onChange={f.set('issue_type')}>{Object.entries(ISSUE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="What did you notice? *" className="full"><textarea required value={f.values.description} onChange={f.set('description')} placeholder="Packaging, colour, smell, price, patient complaints…" /></Field>
      </div>
      <div className="alert warn small">
        {['suspected_fake', 'unregistered'].includes(f.values.issue_type)
          ? 'This batch will be quarantined immediately at every FirstMeds facility that holds it, and HQ will contact NDA.'
          : 'This batch will be quarantined at your facility while HQ investigates.'}
      </div>
      <div className="form-actions"><button className="btn danger" disabled={f.busy}>Report & quarantine</button></div>
    </form>
  );
}

export default function Quality() {
  const { isAdmin, activePharmacy } = useAuth();
  const list = useApi('/quality', [activePharmacy]);
  const alerts = useApi(activePharmacy ? '/inventory/alerts' : null, [activePharmacy]);
  const [reporting, setReporting] = useState(false);
  const [done, setDone] = useState(null);
  const update = async (q, status) => { await api.put(`/quality/${q.id}`, { status }); list.reload(); };
  return (
    <div className="page">
      <PageTitle title="Medicine safety" subtitle="Verify medicines, report suspected fakes, and see quality alerts across the network.">
        {activePharmacy && <button className="btn danger" onClick={() => setReporting(true)}>⚠ Report a problem</button>}
      </PageTitle>
      {done && <div className="alert success" style={{ marginBottom: 16 }}>Report sent. {done.quarantined_batches} batch(es) quarantined{done.network_wide ? ' across the network' : ''}.</div>}
      <div className="grid cols-2" style={{ alignItems: 'start', marginBottom: 16 }}>
        <Verify />
        <div className="card">
          <h3>Quarantined at this facility</h3>
          {!activePharmacy ? <p className="muted small">Choose a facility to see its quarantine shelf.</p> : !alerts.data?.quarantined?.length ? <Empty>Nothing in quarantine.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Medicine</th><th>Batch</th><th className="num">Qty</th><th>Supplier</th></tr></thead>
              <tbody>{alerts.data.quarantined.map((b) => <tr key={b.id}><td>{b.name}</td><td className="mono">{b.batch_no}</td><td className="num">{num(b.quantity)}</td><td className="small">{b.supplier}</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>Quarantined stock cannot be sold. Keep it apart, labelled “Do not sell”, until HQ clears it or NDA collects it.</p>
        </div>
      </div>
      <Loader state={list}>{(rows) => (
        <div className="card flush">
          <div style={{ padding: '14px 16px' }}><h3 style={{ margin: 0 }}>Quality alerts</h3></div>
          {!rows.length ? <Empty>No quality alerts.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Reported</th><th>Medicine / batch</th><th>Problem</th><th>Where</th><th className="num">Quarantined</th><th>Status</th>{isAdmin && <th />}</tr></thead>
              <tbody>{rows.map((q) => (
                <tr key={q.id}>
                  <td className="nowrap small">{date(q.created_at)}</td>
                  <td><strong>{q.product_name}</strong> <span className="mono small">{q.batch_no}</span><div className="small muted">{q.description}</div>{q.hq_note && <div className="small" style={{ color: 'var(--info)' }}>HQ: {q.hq_note}</div>}</td>
                  <td><Badge tone={q.issue_type === 'suspected_fake' ? 'red' : 'amber'}>{ISSUE_LABELS[q.issue_type]}</Badge></td>
                  <td className="small">{q.pharmacy_name}<div className="muted">{q.district} · {q.supplier}</div></td>
                  <td className="num">{num(q.quarantined_units)} units<div className="small muted">{q.quarantined_batches} site(s)</div></td>
                  <td><Badge tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge></td>
                  {isAdmin && <td className="nowrap">
                    <select value="" onChange={(e) => e.target.value && update(q, e.target.value)} style={{ width: 'auto', padding: '6px 8px' }} aria-label="Change status">
                      <option value="">Update…</option>
                      {['investigating', 'reported_to_nda', 'confirmed', 'cleared'].filter((s) => s !== q.status).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>}
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}</Loader>
      {reporting && <Modal title="Report a medicine problem" onClose={() => setReporting(false)} wide><ReportForm onDone={(r) => { setReporting(false); setDone(r); list.reload(); alerts.reload(); }} /></Modal>}
    </div>
  );
}

/* ---------------- Prescription register & dispensing ---------------- */
const MT_LABEL = { tested_here: 'Tested here (RDT)', tested_elsewhere: 'Tested elsewhere', not_tested: 'Not tested', unknown: 'Not recorded' };

export function Prescriptions() {
  const { activePharmacy } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'register';
  const [from, setFrom] = useState(() => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCDate(d.getUTCDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(todayEAT());
  const reg = useApi(tab === 'register' ? `/quality/prescriptions?from=${from}&to=${to}` : null, [tab, from, to, activePharmacy]);
  const disp = useApi(tab === 'dispensing' ? '/quality/dispensing' : null, [tab, activePharmacy]);
  return (
    <div className="page">
      <PageTitle title="Prescriptions & dispensing" subtitle="Your prescription register for NDA inspections, and how well malaria is tested before treatment.">
        <button className="btn secondary no-print" onClick={() => window.print()}>Print</button>
      </PageTitle>
      <Tabs value={tab} onChange={(k) => setParams(k === 'register' ? {} : { tab: k })} tabs={[['register', 'Prescription register'], ['dispensing', 'Test before treat']]} />
      {tab === 'register' ? (
        <>
          <div className="row no-print" style={{ marginBottom: 12 }}>
            <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <Loader state={reg}>{(rows) => (
            <div className="card flush">
              <div style={{ padding: '14px 16px' }} className="row between"><strong>{rows.length} prescriptions dispensed</strong><span className="small muted">Prescription-only medicines cannot be sold without an entry here.</span></div>
              {!rows.length ? <Empty>No prescriptions in this period.</Empty> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Dispensed</th><th>Patient</th><th>Medicines</th><th>Prescriber</th><th>Rx date</th><th>Receipt</th><th>By</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.id} style={r.voided ? { opacity: 0.5 } : undefined}>
                      <td className="nowrap small">{dateTime(r.created_at)}</td>
                      <td>{r.patient || r.patient_name || <span className="muted">Walk-in</span>}</td>
                      <td className="small">{r.items}</td>
                      <td className="small"><strong>{r.prescriber_name}</strong><div className="muted">{[r.prescriber_reg_no, r.prescriber_facility].filter(Boolean).join(' · ')}</div></td>
                      <td className="nowrap small">{date(r.rx_date)}</td>
                      <td className="mono small">{r.receipt_no}</td>
                      <td className="small">{r.dispensed_by}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
          )}</Loader>
        </>
      ) : (
        <Loader state={disp}>{(rows) => {
          const total = rows.reduce((a, r) => a + r.sales, 0);
          const tested = rows.filter((r) => r.malaria_test.startsWith('tested')).reduce((a, r) => a + r.sales, 0);
          const pct = total ? Math.round((tested / total) * 100) : 0;
          return (
            <div className="grid cols-2" style={{ alignItems: 'start' }}>
              <div className="card">
                <h3>Antimalarials sold in the last 30 days</h3>
                <div style={{ fontSize: 44, fontWeight: 800, color: pct >= 80 ? 'var(--brand)' : 'var(--warn)' }}>{pct}%</div>
                <p className="muted">of malaria treatments were backed by a test ({tested} of {total}).</p>
                <div className="bars">
                  {rows.map((r) => (
                    <div className="bar-row" key={r.malaria_test} style={{ gridTemplateColumns: '150px 1fr 50px' }}>
                      <span>{MT_LABEL[r.malaria_test] || r.malaria_test}</span>
                      <div className="track"><div className="fill" style={{ width: `${(r.sales / Math.max(1, total)) * 100}%`, background: r.malaria_test.startsWith('tested') ? 'var(--brand)' : 'var(--danger)' }} /></div>
                      <span className="right mono">{r.sales}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <h3>Why it matters</h3>
                <p className="small muted">Many fevers are not malaria. Treating without testing wastes money, hides other illnesses like pneumonia or typhoid, and helps malaria become resistant to medicines.</p>
                <ul className="checks small" style={{ marginBottom: 0 }}>
                  <li>The app asks about testing every time an antimalarial is sold.</li>
                  <li>Malaria Test &amp; Treat makes rapid tests half price.</li>
                  <li>Dispensing advice appears at the counter for antimalarials and antibiotics.</li>
                </ul>
              </div>
            </div>
          );
        }}</Loader>
      )}
    </div>
  );
}
