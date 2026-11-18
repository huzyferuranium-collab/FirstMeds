import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, Loader, PageTitle, Badge, Empty, Field, ErrorBox, useForm, Tabs, Stat, Spinner } from '../components/UI.jsx';
import { ugx, num, dateTime, time, PAYMENT_LABELS } from '../format.js';
import { pendingSales, retryFailed, removeQueued, useOffline } from '../offline.js';

function MyShift() {
  const { activePharmacy } = useAuth();
  const state = useApi('/cash/current', [activePharmacy]);
  const open = useForm({ opening_float: '50000' });
  const close = useForm({ counted_cash: '', notes: '' });
  const [closed, setClosed] = useState(null);
  return (
    state.error ? <ErrorBox error={state.error} /> : state.loading && state.data === null ? <Spinner /> : (() => {
      const s = state.data;
      if (!s) {
        return (
          <div className="card" style={{ maxWidth: 520 }}>
            {closed && <div className={`alert ${closed.variance === 0 ? 'success' : closed.variance > 0 ? 'info' : 'error'}`} style={{ marginBottom: 14 }}>
              Shift closed. Expected {ugx(closed.expected_cash)}, counted {ugx(closed.counted_cash)} — {closed.variance === 0 ? 'balanced ✓' : closed.variance > 0 ? `over by ${ugx(closed.variance)}` : `short by ${ugx(-closed.variance)}`}.
            </div>}
            <h3>Open your till</h3>
            <p className="small muted">Count the cash in the drawer before your first sale. Every sale you make is added to your shift.</p>
            <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={open.submit(async (v) => { await api.post('/cash/open', { opening_float: Number(v.opening_float) || 0 }); setClosed(null); state.reload(); })}>
              <Field label="Opening cash (float)"><input type="number" min="0" value={open.values.opening_float} onChange={open.set('opening_float')} style={{ width: 180 }} /></Field>
              <button className="btn" disabled={open.busy}>Open shift</button>
            </form>
            <ErrorBox error={open.error} />
          </div>
        );
      }
      const t = s.totals;
      const counted = Number(close.values.counted_cash);
      const diff = close.values.counted_cash === '' ? null : counted - t.expected_cash;
      return (
        <div className="stack">
          <div className="grid cols-4">
            <Stat label="Shift opened" value={time(s.opened_at)} sub={`Float ${ugx(s.opening_float)}`} />
            <Stat label="Sales this shift" value={num(t.sales)} />
            <Stat label="Cash expected in drawer" value={ugx(t.expected_cash)} sub={`Cash sales ${ugx(t.cash)}`} />
            <Stat label="Mobile money" value={ugx(t.mtn_momo + t.airtel_money)} sub={`MTN ${num(t.mtn_momo)} · Airtel ${num(t.airtel_money)}`} />
          </div>
          <form className="card stack" style={{ maxWidth: 560 }} onSubmit={close.submit(async (v) => {
            const r = await api.post('/cash/close', { counted_cash: Number(v.counted_cash), notes: v.notes });
            setClosed(r); close.setValues({ counted_cash: '', notes: '' }); state.reload();
          })}>
            <h3 style={{ margin: 0 }}>Close shift (cash-up)</h3>
            <p className="small muted" style={{ margin: 0 }}>Count all the notes and coins in the drawer and enter the total.</p>
            <ErrorBox error={close.error} />
            <Field label="Cash counted *"><input required type="number" min="0" value={close.values.counted_cash} onChange={close.set('counted_cash')} /></Field>
            {diff !== null && <div className={`alert ${diff === 0 ? 'success' : Math.abs(diff) <= 1000 ? 'warn' : 'error'}`}>{diff === 0 ? 'Balanced ✓' : diff > 0 ? `Over by ${ugx(diff)}` : `Short by ${ugx(-diff)}`}</div>}
            <Field label="Notes"><input value={close.values.notes} onChange={close.set('notes')} placeholder="Explain any difference" /></Field>
            <div className="form-actions"><button className="btn" disabled={close.busy}>Close shift</button></div>
          </form>
        </div>
      );
    })()
  );
}

function Shifts() {
  const { activePharmacy } = useAuth();
  const state = useApi('/cash/shifts', [activePharmacy]);
  return (
    <Loader state={state}>{(rows) => {
      const closed = rows.filter((r) => r.status === 'closed');
      const net = closed.reduce((a, r) => a + r.variance, 0);
      const short = closed.filter((r) => r.variance < -2000);
      return (
        <div className="stack">
          <div className="grid cols-3">
            <Stat label="Shifts closed" value={num(closed.length)} />
            <Stat label="Net difference" value={`${net >= 0 ? '+' : ''}${ugx(net)}`} tone={net < -5000 ? 'danger' : undefined} />
            <Stat label="Shifts short by more than UGX 2,000" value={num(short.length)} tone={short.length ? 'danger' : undefined} />
          </div>
          <div className="card flush"><div className="table-wrap"><table className="table">
            <thead><tr><th>Staff</th><th>Opened</th><th>Closed</th><th className="num">Sales</th><th className="num">Expected cash</th><th className="num">Counted</th><th className="num">Difference</th><th>Notes</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.user_name}</strong></td>
                <td className="small nowrap">{dateTime(r.opened_at)}</td>
                <td className="small nowrap">{r.status === 'open' ? <Badge tone="blue">open</Badge> : time(r.closed_at)}</td>
                <td className="num">{r.sales_count ?? r.totals?.sales}</td>
                <td className="num">{num(r.expected_cash ?? r.totals?.expected_cash)}</td>
                <td className="num">{r.counted_cash != null ? num(r.counted_cash) : '—'}</td>
                <td className="num">{r.variance == null ? '—' : r.variance === 0 ? <Badge tone="green">0</Badge> : <Badge tone={r.variance < -2000 ? 'red' : 'amber'}>{r.variance > 0 ? '+' : ''}{num(r.variance)}</Badge>}</td>
                <td className="small">{r.notes}</td>
              </tr>
            ))}</tbody>
          </table></div></div>
        </div>
      );
    }}</Loader>
  );
}

function MobileMoney() {
  const { activePharmacy } = useAuth();
  const state = useApi('/cash/momo?days=14', [activePharmacy]);
  const [provider, setProvider] = useState('mtn_momo');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const importIt = async () => {
    setErr(null);
    try { setResult(await api.post('/cash/momo/import', { provider, text })); setText(''); state.reload(); } catch (e) { setErr(e); }
  };
  // Demo helper: build a statement from the unverified sales, leaving one out so a gap is visible.
  const example = () => {
    const rows = (state.data?.sales || []).filter((s) => !s.payment_verified && s.payment_method === provider);
    setText(['Transaction ID,Amount,Date', ...rows.slice(0, Math.max(1, rows.length - 1)).map((s) => `${s.payment_ref},${s.total},${s.created_at}`)].join('\n'));
  };
  return (
    <Loader state={state}>{(d) => (
      <div className="stack">
        <div className="grid cols-3">
          <Stat label="Mobile money taken (14 days)" value={ugx(d.summary.total)} />
          <Stat label="Matched to statement" value={ugx(d.summary.verified)} />
          <Stat label="Not yet matched" value={ugx(d.summary.unverified)} sub={`${d.summary.unverified_count} payment(s)`} tone={d.summary.unverified ? 'warn' : undefined} />
        </div>
        <div className="grid cols-2" style={{ alignItems: 'start' }}>
          <div className="card stack">
            <h3 style={{ margin: 0 }}>Check against your statement</h3>
            <p className="small muted" style={{ margin: 0 }}>Download the transaction list from the MTN MoMo or Airtel Money merchant portal (or copy it from the statement) and paste it here. Each line: transaction ID, amount.</p>
            <ErrorBox error={err} />
            <div className="row">
              <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ width: 'auto' }}><option value="mtn_momo">MTN MoMo</option><option value="airtel_money">Airtel Money</option></select>
              <button type="button" className="btn ghost sm" onClick={example}>Fill with demo statement</button>
            </div>
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'MP241105.1203.C12345, 8000\nMP241105.1310.C12377, 12,500'} style={{ fontFamily: 'monospace', fontSize: 13 }} />
            <div className="form-actions"><button className="btn" disabled={!text.trim()} onClick={importIt}>Match payments</button></div>
            {result && <div className={`alert ${result.mismatched ? 'warn' : 'success'}`}>{result.imported} lines read · {result.matched} matched{result.mismatched ? ` · ${result.mismatched} amount mismatch(es)` : ''}{result.problems.map((p) => <div key={p} className="small">{p}</div>)}</div>}
          </div>
          <div className="card flush">
            <div style={{ padding: '14px 16px' }}><h3 style={{ margin: 0 }}>Payments not on any statement yet</h3></div>
            {!d.sales.filter((s) => !s.payment_verified).length ? <Empty>Everything matched. ✓</Empty> : (
              <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}><table className="table">
                <thead><tr><th>Receipt</th><th>Time</th><th>Method</th><th>Txn ID</th><th className="num">Amount</th><th>Cashier</th></tr></thead>
                <tbody>{d.sales.filter((s) => !s.payment_verified).map((s) => (
                  <tr key={s.id}><td className="mono small">{s.receipt_no}</td><td className="small nowrap">{dateTime(s.created_at)}</td><td className="small">{PAYMENT_LABELS[s.payment_method]}</td>
                    <td className="mono small">{s.payment_ref}</td><td className="num">{num(s.total)}</td><td className="small">{s.cashier}</td></tr>
                ))}</tbody>
              </table></div>
            )}
            {d.unmatched_lines.length > 0 && <div className="alert info small" style={{ margin: 12 }}>{d.unmatched_lines.length} statement line(s) have no matching sale — money received without a receipt, or a wrong ID typed at the counter.</div>}
          </div>
        </div>
      </div>
    )}</Loader>
  );
}

function OfflineQueue() {
  const { queue, online } = useOffline();
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <div className="card-head"><h3>Sales saved on this device</h3><Badge tone={online ? 'green' : 'amber'}>{online ? 'Online' : 'Offline'}</Badge></div>
      {!queue.length ? <Empty>No offline sales waiting. When the internet drops, sales are kept here and sent automatically.</Empty> : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Saved</th><th className="num">Items</th><th>Status</th><th /></tr></thead>
            <tbody>{queue.map((q) => (
              <tr key={q.client_id}><td className="small">{dateTime(q.offline_created_at)}</td><td className="num">{q.items.length}</td>
                <td>{q.status === 'failed' ? <><Badge tone="red">refused</Badge> <span className="small">{q.error}</span></> : <Badge tone="blue">waiting</Badge>}</td>
                <td>{q.status === 'failed' && <button className="btn sm ghost" onClick={() => removeQueued(q.client_id)}>Discard</button>}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="form-actions"><button className="btn" disabled={busy || !online} onClick={async () => { setBusy(true); await retryFailed(); setBusy(false); }}>Sync now ({pendingSales().length})</button></div>
        </>
      )}
    </div>
  );
}

export default function Cash() {
  const { can } = useAuth();
  const [tab, setTab] = useState('shift');
  const tabs = [['shift', 'My shift'], ...(can('admin', 'owner', 'pharmacist') ? [['history', 'All shifts'], ['momo', 'Mobile money check']] : []), ['offline', 'Offline sales']];
  return (
    <div className="page">
      <PageTitle title="Cash & payments" subtitle="Open and close the till, catch shortages early, and make sure every mobile money payment really arrived." />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'shift' && <MyShift />}
      {tab === 'history' && <Shifts />}
      {tab === 'momo' && <MobileMoney />}
      {tab === 'offline' && <OfflineQueue />}
    </div>
  );
}
