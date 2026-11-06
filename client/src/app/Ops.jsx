import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, Loader, PageTitle, Badge, Empty, Modal, Field, ErrorBox, useForm, Tabs, Stat } from '../components/UI.jsx';
import { ugx, num, date, dateTime, daysUntil, monthLabel, todayEAT, phone, ROLE_LABELS, TYPE_LABELS } from '../format.js';
import { RangePicker, Charts } from './Dashboard.jsx';

/* ---------------- Refill reminders ---------------- */
export function Reminders() {
  const { activePharmacy } = useAuth();
  const [tab, setTab] = useState('due');
  const due = useApi('/reminders', [activePharmacy]);
  const log = useApi(tab === 'log' ? '/reminders/log' : null, [tab]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const act = async (r, channel) => {
    setBusy(r.sale_item_id);
    setMsg(null);
    try {
      const out = await api.post('/reminders', { sale_item_id: r.sale_item_id, channel });
      setMsg({ tone: out.status === 'failed' ? 'error' : 'success', text: `${r.patient_name}: ${channel === 'sms' ? `SMS ${out.status}` : 'marked as contacted'}` });
      due.reload();
    } catch (e) { setMsg({ tone: 'error', text: e.message }); } finally { setBusy(null); }
  };

  return (
    <div className="page">
      <PageTitle title="Refill reminders" subtitle="Patients whose medicine runs out soon, based on the days of supply entered at sale." />
      <Tabs value={tab} onChange={setTab} tabs={[['due', `Due now${due.data ? ` (${due.data.length})` : ''}`], ['log', 'History']]} />
      {msg && <div className={`alert ${msg.tone}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
      {tab === 'due' ? (
        <Loader state={due}>{(rows) => (
          <div className="card flush">
            {!rows.length ? <Empty>No refills due. Enter “Refill in X days” at checkout to track chronic patients.</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Patient</th><th>Medicine</th><th>Last bought</th><th>Runs out</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const d = daysUntil(r.due_date);
                      return (
                        <tr key={r.sale_item_id}>
                          <td><Link to={`/app/patients/${r.patient_id}`}><strong>{r.patient_name}</strong></Link><div className="small muted">{phone(r.phone)}</div></td>
                          <td>{r.product_name} <span className="small muted">{r.strength}</span></td>
                          <td className="nowrap">{date(r.created_at)}</td>
                          <td>{d < 0 ? <Badge tone="red">{-d} days overdue</Badge> : d === 0 ? <Badge tone="amber">Today</Badge> : <Badge tone="blue">in {d} days</Badge>}</td>
                          <td className="right nowrap">
                            {r.phone && r.sms_consent ? <button className="btn sm" disabled={busy === r.sale_item_id} onClick={() => act(r, 'sms')}>Send SMS</button> : null}{' '}
                            <button className="btn sm secondary" disabled={busy === r.sale_item_id} onClick={() => act(r, 'call')}>Called</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}</Loader>
      ) : (
        <Loader state={log}>{(rows) => (
          <div className="card flush">
            {!rows.length ? <Empty>No reminders sent yet.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>When</th><th>Patient</th><th>Medicine</th><th>Channel</th><th>Status</th><th>By</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.id}><td className="nowrap">{dateTime(r.created_at)}</td><td>{r.patient_name}</td><td>{r.product_name}</td><td>{r.channel}</td>
                    <td><Badge tone={r.status === 'failed' ? 'red' : 'green'}>{r.status}</Badge></td><td>{r.user_name}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}</Loader>
      )}
    </div>
  );
}

/* ---------------- Programmes ---------------- */
function ProgramEditor({ program, onClose, onSaved }) {
  const products = useApi('/products');
  const f = useForm({
    code: '', name: '', description: '', sponsor: '', discount_percent: 50, max_subsidy_per_visit: 0, requires_enrollment: false, active: true, start_date: '', end_date: '',
    ...program, requires_enrollment: program ? !!program.requires_enrollment : false, active: program ? !!program.active : true,
    product_ids: program?.products?.map((p) => p.id) || [],
  });
  const toggle = (id) => f.setValues((v) => ({ ...v, product_ids: v.product_ids.includes(id) ? v.product_ids.filter((x) => x !== id) : [...v.product_ids, id] }));
  return (
    <Modal title={program ? `Edit ${program.name}` : 'New programme'} onClose={onClose} wide>
      <form className="stack" onSubmit={f.submit(async (v) => {
        const body = { ...v, discount_percent: Number(v.discount_percent), max_subsidy_per_visit: Number(v.max_subsidy_per_visit) || 0 };
        await (program ? api.put(`/programs/${program.id}`, body) : api.post('/programs', body));
        onSaved();
      })}>
        <ErrorBox error={f.error} />
        <div className="form-grid">
          <Field label="Code *"><input required value={f.values.code} onChange={f.set('code')} maxLength={20} /></Field>
          <Field label="Name *"><input required value={f.values.name} onChange={f.set('name')} /></Field>
          <Field label="Sponsor"><input value={f.values.sponsor || ''} onChange={f.set('sponsor')} /></Field>
          <Field label="Discount % *"><input required type="number" min="0" max="100" value={f.values.discount_percent} onChange={f.set('discount_percent')} /></Field>
          <Field label="Max subsidy per visit (0 = none)"><input type="number" min="0" value={f.values.max_subsidy_per_visit} onChange={f.set('max_subsidy_per_visit')} /></Field>
          <Field label="Starts"><input type="date" value={f.values.start_date || ''} onChange={f.set('start_date')} /></Field>
          <Field label="Ends"><input type="date" value={f.values.end_date || ''} onChange={f.set('end_date')} /></Field>
          <Field label="Description" className="full"><textarea value={f.values.description || ''} onChange={f.set('description')} /></Field>
          <label className="field inline"><input type="checkbox" checked={f.values.requires_enrollment} onChange={f.set('requires_enrollment')} /> Patients must be enrolled</label>
          <label className="field inline"><input type="checkbox" checked={f.values.active} onChange={f.set('active')} /> Active</label>
        </div>
        <div>
          <strong className="small">Eligible medicines ({f.values.product_ids.length})</strong>
          <div className="grid cols-3" style={{ marginTop: 8, maxHeight: 240, overflowY: 'auto', gap: 6 }}>
            {products.data?.map((p) => (
              <label key={p.id} className="field inline small" style={{ color: 'var(--text)', fontWeight: 500 }}>
                <input type="checkbox" checked={f.values.product_ids.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name} <span className="muted">{p.strength}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={f.busy}>Save programme</button></div>
      </form>
    </Modal>
  );
}

export function Programmes() {
  const { isAdmin, activePharmacy } = useAuth();
  const state = useApi('/programs', [activePharmacy]);
  const [edit, setEdit] = useState(null);
  return (
    <div className="page">
      <PageTitle title="Patient programmes" subtitle={activePharmacy ? 'Subsidies available at your counter and how your patients use them.' : 'All programmes across the network.'}>
        {isAdmin && <button className="btn" onClick={() => setEdit({})}>+ New programme</button>}
      </PageTitle>
      <Loader state={state}>{(rows) => (
        <div className="grid cols-2">
          {rows.map((p) => (
            <div className="card" key={p.id} style={!p.active ? { opacity: 0.6 } : undefined}>
              <div className="card-head">
                <div><Badge tone="green">{p.code}</Badge> <h3 style={{ display: 'inline', marginLeft: 6 }}>{p.name}</h3></div>
                {isAdmin && <button className="btn sm secondary" onClick={() => setEdit(p)}>Edit</button>}
              </div>
              <p className="small muted">{p.description}</p>
              <div className="row small" style={{ marginBottom: 12 }}>
                <Badge tone="amber">{p.discount_percent}% off</Badge>
                {p.max_subsidy_per_visit > 0 && <Badge>max {ugx(p.max_subsidy_per_visit)}/visit</Badge>}
                <Badge tone={p.requires_enrollment ? 'blue' : ''}>{p.requires_enrollment ? 'Enrolment required' : 'Open to all patients'}</Badge>
                {!p.active && <Badge tone="red">Inactive</Badge>}
              </div>
              <div className="grid cols-3" style={{ gap: 8 }}>
                <div className="stat"><span className="label">Enrolled</span><span className="value" style={{ fontSize: 20 }}>{num(p.enrolled)}</span></div>
                <div className="stat"><span className="label">Visits</span><span className="value" style={{ fontSize: 20 }}>{num(p.visits)}</span></div>
                <div className="stat"><span className="label">Subsidy</span><span className="value" style={{ fontSize: 20 }}>{ugx(p.subsidy_total)}</span></div>
              </div>
              <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>Eligible: {p.products.map((x) => x.name).join(', ') || '—'}</p>
              {p.sponsor && <p className="small muted" style={{ margin: 0 }}>Sponsor: {p.sponsor}</p>}
            </div>
          ))}
        </div>
      )}</Loader>
      {edit && <ProgramEditor program={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); state.reload(); }} />}
    </div>
  );
}

/* ---------------- Claims ---------------- */
const CLAIM_TONE = { submitted: 'blue', approved: 'amber', paid: 'green', rejected: 'red' };

export function Claims() {
  const { isAdmin, activePharmacy, can } = useAuth();
  const [period, setPeriod] = useState(todayEAT().slice(0, 7));
  const [status, setStatus] = useState(isAdmin && !activePharmacy ? 'submitted' : '');
  const list = useApi(`/claims${status ? `?status=${status}` : ''}`, [activePharmacy, status]);
  const preview = useApi(activePharmacy ? `/claims/preview?period=${period}` : null, [period, activePharmacy]);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setErr(null);
    try { await api.post('/claims', { period }); preview.reload(); list.reload(); } catch (e) { setErr(e); }
  };
  const decide = async (c, s) => {
    setErr(null);
    try { await api.put(`/claims/${c.id}/status`, { status: s }); list.reload(); } catch (e) { setErr(e); }
  };
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(`${todayEAT().slice(0, 7)}-15T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });

  return (
    <div className="page">
      <PageTitle title="Subsidy claims" subtitle={activePharmacy ? 'Get reimbursed for programme discounts you gave patients.' : 'Review and pay pharmacy claims.'} />
      <ErrorBox error={err} />
      {activePharmacy && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>Claimable subsidies</h3>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto' }}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
          </div>
          <Loader state={preview}>{(p) => {
            const open = p.programs.filter((x) => !x.claim_status && x.amount > 0);
            return !p.programs.length ? <Empty>No subsidised sales in {monthLabel(period)}.</Empty> : (
              <>
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Programme</th><th>Sponsor</th><th className="num">Sales</th><th className="num">Amount</th><th>Status</th></tr></thead>
                  <tbody>{p.programs.map((x) => (
                    <tr key={x.program_id}><td>{x.program_name}</td><td className="small muted">{x.sponsor}</td><td className="num">{x.sales_count}</td><td className="num">{ugx(x.amount)}</td>
                      <td>{x.claim_status ? <Badge tone={CLAIM_TONE[x.claim_status]}>{x.claim_status}</Badge> : <Badge>not claimed</Badge>}</td></tr>
                  ))}</tbody>
                </table></div>
                {can('admin', 'owner') && open.length > 0 && (
                  <div className="form-actions">
                    {period === todayEAT().slice(0, 7) && <span className="small muted">Tip: claims are usually submitted after the month ends.</span>}
                    <button className="btn" onClick={submit}>Submit claim for {ugx(open.reduce((a, x) => a + x.amount, 0))}</button>
                  </div>
                )}
              </>
            );
          }}</Loader>
        </div>
      )}
      <div className="card flush">
        <div className="row between" style={{ padding: '14px 16px' }}>
          <h3 style={{ margin: 0 }}>Claims</h3>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="">All statuses</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option>
          </select>
        </div>
        <Loader state={list}>{(rows) => !rows.length ? <Empty>No claims.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Period</th>{!activePharmacy && <th>Facility</th>}<th>Programme</th><th className="num">Sales</th><th className="num">Amount</th><th>Status</th><th>Submitted</th>{isAdmin && <th />}</tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}>
                <td className="nowrap">{monthLabel(c.period)}</td>
                {!activePharmacy && <td>{c.pharmacy_name} <span className="small muted">{c.district}</span></td>}
                <td>{c.program_name}</td>
                <td className="num">{c.sales_count}</td>
                <td className="num"><strong>{ugx(c.amount)}</strong></td>
                <td><Badge tone={CLAIM_TONE[c.status]}>{c.status}</Badge></td>
                <td className="nowrap small">{date(c.submitted_at)}</td>
                {isAdmin && <td className="nowrap right">
                  {c.status === 'submitted' && <><button className="btn sm" onClick={() => decide(c, 'approved')}>Approve</button> <button className="btn sm secondary" onClick={() => decide(c, 'rejected')}>Reject</button></>}
                  {c.status === 'approved' && <button className="btn sm" onClick={() => decide(c, 'paid')}>Mark paid</button>}
                </td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}</Loader>
      </div>
    </div>
  );
}

/* ---------------- Reports ---------------- */
export function Reports() {
  const { activePharmacy } = useAuth();
  const [days, setDays] = useState(30);
  const state = useApi(`/reports/dashboard?days=${days}`, [activePharmacy]);
  return (
    <div className="page">
      <PageTitle title="Reports" subtitle="Sales performance, margins and product mix.">
        <RangePicker days={days} setDays={setDays} />
        <button className="btn secondary" onClick={() => download(`/reports/sales.csv?days=${days}`, `firstmeds-sales-${days}d.csv`)}>Export CSV</button>
      </PageTitle>
      <Loader state={state}>{(m) => (
        <div className="stack">
          <div className="grid cols-4">
            <Stat label="Revenue" value={ugx(m.totals.revenue)} sub={`${ugx(m.totals.collected)} from patients`} />
            <Stat label="Gross margin" value={ugx(m.totals.gross_margin)} sub={m.totals.revenue ? `${Math.round((m.totals.gross_margin / m.totals.revenue) * 100)}% of revenue` : ''} />
            <Stat label="Receipts" value={num(m.totals.sales)} sub={`Avg ${ugx(m.totals.avg_basket)}`} />
            <Stat label="Discounts given" value={ugx(m.totals.discount)} sub={`Subsidies ${ugx(m.totals.subsidy)}`} />
          </div>
          <Charts m={m} />
          <div className="grid cols-2">
            <div className="card flush">
              <div style={{ padding: '14px 16px' }}><h3 style={{ margin: 0 }}>By category</h3></div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Category</th><th className="num">Units</th><th className="num">Revenue</th></tr></thead>
                <tbody>{m.categories.map((c) => <tr key={c.category}><td>{c.category}</td><td className="num">{num(c.units)}</td><td className="num">{ugx(c.revenue)}</td></tr>)}</tbody>
              </table></div>
            </div>
            <div className="card">
              <h3>Busiest hours (EAT)</h3>
              <div className="bars">
                {m.hours.map((h) => {
                  const max = Math.max(...m.hours.map((x) => x.sales));
                  return (
                    <div className="bar-row" key={h.hour} style={{ gridTemplateColumns: '60px 1fr 50px' }}>
                      <span>{String(h.hour).padStart(2, '0')}:00</span>
                      <div className="track"><div className="fill" style={{ width: `${(h.sales / max) * 100}%` }} /></div>
                      <span className="right mono">{h.sales}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}</Loader>
    </div>
  );
}

/* ---------------- Team ---------------- */
function TempPassword({ value, email, onClose }) {
  return (
    <Modal title="Share these sign-in details" onClose={onClose}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Give these to the staff member in person. They will be asked to change the password after signing in.</p>
        <div className="card mono">Email: {email}<br />Password: <strong>{value}</strong></div>
        <div className="form-actions"><button className="btn" onClick={onClose}>Done</button></div>
      </div>
    </Modal>
  );
}

export function Team() {
  const { user, activePharmacy, isAdmin } = useAuth();
  const state = useApi('/admin/users', [activePharmacy]);
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState(null);
  const f = useForm({ name: '', email: '', phone: '', role: 'cashier' });
  const update = async (u, patch) => {
    const r = await api.put(`/admin/users/${u.id}`, { name: u.name, phone: u.phone, role: u.role, active: u.active, ...patch });
    if (r.temporary_password) setSecret({ value: r.temporary_password, email: u.email });
    state.reload();
  };
  return (
    <div className="page">
      <PageTitle title="Team" subtitle="People who can sign in to this facility."><button className="btn" onClick={() => setAdding(true)}>+ Add staff</button></PageTitle>
      <Loader state={state}>{(rows) => (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((u) => {
            const editable = u.id !== user.id && (isAdmin || !['owner', 'admin'].includes(u.role));
            return (
              <tr key={u.id} style={!u.active ? { opacity: 0.55 } : undefined}>
                <td><strong>{u.name}</strong></td><td className="small">{u.email}</td><td className="nowrap">{phone(u.phone)}</td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td>{u.active ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>}</td>
                <td className="nowrap right">{editable && <>
                  <button className="btn sm secondary" onClick={() => update(u, { reset_password: true })}>Reset password</button>{' '}
                  <button className="btn sm ghost" onClick={() => update(u, { active: !u.active })}>{u.active ? 'Disable' : 'Enable'}</button>
                </>}</td>
              </tr>
            );
          })}</tbody>
        </table></div></div>
      )}</Loader>
      {adding && (
        <Modal title="Add staff member" onClose={() => setAdding(false)}>
          <form className="stack" onSubmit={f.submit(async (v) => {
            const r = await api.post('/admin/users', { ...v, pharmacy_id: activePharmacy });
            setAdding(false); setSecret({ value: r.temporary_password, email: r.user.email }); f.setValues({ name: '', email: '', phone: '', role: 'cashier' }); state.reload();
          })}>
            <ErrorBox error={f.error} />
            <div className="form-grid">
              <Field label="Full name *" className="full"><input required value={f.values.name} onChange={f.set('name')} /></Field>
              <Field label="Email *"><input required type="email" value={f.values.email} onChange={f.set('email')} /></Field>
              <Field label="Phone"><input type="tel" value={f.values.phone} onChange={f.set('phone')} /></Field>
              <Field label="Role">
                <select value={f.values.role} onChange={f.set('role')}>
                  <option value="cashier">Cashier — sales and patients</option>
                  <option value="pharmacist">Pharmacist — plus stock, voids, discounts</option>
                  {isAdmin && <option value="owner">Owner — everything for this facility</option>}
                </select>
              </Field>
            </div>
            <div className="form-actions"><button className="btn" disabled={f.busy}>Create account</button></div>
          </form>
        </Modal>
      )}
      {secret && <TempPassword {...secret} onClose={() => setSecret(null)} />}
    </div>
  );
}

/* ---------------- Settings ---------------- */
export function FacilityForm({ pharmacy, onSaved, adminMode }) {
  const districts = useApi('/public/districts');
  const f = useForm({ name: '', type: 'pharmacy', district: '', town: '', address: '', phone: '', email: '', nda_license: '', tin: '', owner_name: '', status: 'active', ...pharmacy });
  return (
    <form className="stack" onSubmit={f.submit(async (v) => onSaved(pharmacy?.id ? await api.put(`/admin/pharmacies/${pharmacy.id}`, v, { scoped: false }) : await api.post('/admin/pharmacies', v, { scoped: false })))}>
      <ErrorBox error={f.error} />
      <div className="form-grid">
        <Field label="Facility name *" className="full"><input required value={f.values.name} onChange={f.set('name')} /></Field>
        <Field label="Type"><select value={f.values.type} onChange={f.set('type')}>{Object.entries(TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="District *"><select required value={f.values.district} onChange={f.set('district')}><option value="">—</option>{districts.data?.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Town"><input value={f.values.town || ''} onChange={f.set('town')} /></Field>
        <Field label="Address"><input value={f.values.address || ''} onChange={f.set('address')} /></Field>
        <Field label="Phone"><input value={f.values.phone || ''} onChange={f.set('phone')} /></Field>
        <Field label="Email"><input type="email" value={f.values.email || ''} onChange={f.set('email')} /></Field>
        <Field label="NDA licence"><input value={f.values.nda_license || ''} onChange={f.set('nda_license')} /></Field>
        <Field label="URA TIN"><input value={f.values.tin || ''} onChange={f.set('tin')} /></Field>
        <Field label="Owner name"><input value={f.values.owner_name || ''} onChange={f.set('owner_name')} /></Field>
        {adminMode && pharmacy?.id && <Field label="Status"><select value={f.values.status} onChange={f.set('status')}><option value="active">Active</option><option value="suspended">Suspended</option></select></Field>}
      </div>
      <div className="form-actions"><button className="btn" disabled={f.busy}>{f.busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  );
}

export function Settings() {
  const { user, setUser, activePharmacy, can } = useAuth();
  const ph = useApi(activePharmacy && can('admin', 'owner') ? `/admin/pharmacies/${activePharmacy}` : null, [activePharmacy]);
  const [saved, setSaved] = useState(null);
  const pw = useForm({ current_password: '', new_password: '', confirm: '' });
  return (
    <div className="page">
      <PageTitle title="Settings" />
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Change password</h3>
          <form className="stack" onSubmit={pw.submit(async (v) => {
            if (v.new_password !== v.confirm) throw new Error('New passwords do not match');
            await api.post('/auth/change-password', v);
            setUser({ ...user, must_change_password: false });
            pw.setValues({ current_password: '', new_password: '', confirm: '' });
            setSaved('Password changed.');
          })}>
            <ErrorBox error={pw.error} />
            {saved && <div className="alert success">{saved}</div>}
            <Field label="Current password"><input type="password" required autoComplete="current-password" value={pw.values.current_password} onChange={pw.set('current_password')} /></Field>
            <Field label="New password (8+ characters)"><input type="password" required minLength={8} autoComplete="new-password" value={pw.values.new_password} onChange={pw.set('new_password')} /></Field>
            <Field label="Confirm new password"><input type="password" required autoComplete="new-password" value={pw.values.confirm} onChange={pw.set('confirm')} /></Field>
            <div className="form-actions"><button className="btn" disabled={pw.busy}>Update password</button></div>
          </form>
        </div>
        {ph.data && (
          <div className="card">
            <h3>Facility profile</h3>
            <p className="small muted">Shown on receipts.</p>
            <FacilityForm pharmacy={ph.data} onSaved={() => setSaved('Facility saved.')} />
          </div>
        )}
      </div>
    </div>
  );
}
