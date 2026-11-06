import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useDebounced, Loader, PageTitle, Badge, Empty, Modal, Field, ErrorBox, useForm } from '../components/UI.jsx';
import { ugx, date, dateTime, age, phone } from '../format.js';

export function PatientForm({ initial = {}, onSaved, id }) {
  const districts = useApi('/public/districts');
  const f = useForm({ name: '', phone: '', sex: '', dob: '', district: '', village: '', nin: '', sms_consent: true, ...initial, phone: initial.phone ? phone(initial.phone).replace('—', '') : '' });
  return (
    <form className="stack" onSubmit={f.submit(async (v) => onSaved(id ? await api.put(`/patients/${id}`, v) : await api.post('/patients', v)))}>
      <ErrorBox error={f.error} />
      <div className="form-grid">
        <Field label="Full name *" className="full"><input required autoFocus value={f.values.name} onChange={f.set('name')} /></Field>
        <Field label="Phone"><input type="tel" placeholder="0772 123456" value={f.values.phone} onChange={f.set('phone')} /></Field>
        <Field label="Sex">
          <select value={f.values.sex || ''} onChange={f.set('sex')}><option value="">—</option><option value="F">Female</option><option value="M">Male</option></select>
        </Field>
        <Field label="Date of birth"><input type="date" value={f.values.dob || ''} onChange={f.set('dob')} /></Field>
        <Field label="District">
          <select value={f.values.district || ''} onChange={f.set('district')}><option value="">—</option>{districts.data?.map((d) => <option key={d}>{d}</option>)}</select>
        </Field>
        <Field label="Village / cell"><input value={f.values.village || ''} onChange={f.set('village')} /></Field>
        <Field label="NIN (optional)"><input value={f.values.nin || ''} onChange={f.set('nin')} maxLength={14} /></Field>
        <label className="field inline full"><input type="checkbox" checked={!!f.values.sms_consent} onChange={f.set('sms_consent')} /> Patient agrees to receive SMS reminders</label>
      </div>
      <div className="form-actions"><button className="btn" disabled={f.busy}>{f.busy ? 'Saving…' : 'Save patient'}</button></div>
    </form>
  );
}

export default function Patients() {
  const nav = useNavigate();
  const { activePharmacy } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const state = useApi(`/patients?q=${encodeURIComponent(dq)}`, [dq, activePharmacy]);
  const [adding, setAdding] = useState(false);
  return (
    <div className="page">
      <PageTitle title="Patients" subtitle="Patients registered at this facility.">
        <button className="btn" onClick={() => setAdding(true)}>+ Register patient</button>
      </PageTitle>
      <input placeholder="Search by name, phone or NIN…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Search patients" />
      <Loader state={state}>{(rows) => (
        <div className="card flush">
          {!rows.length ? <Empty>No patients found.</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Phone</th><th>Sex / age</th><th>Programmes</th><th className="num">Visits</th><th>Last visit</th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => nav(`/app/patients/${p.id}`)}>
                      <td><strong>{p.name}</strong></td>
                      <td className="nowrap">{phone(p.phone)}</td>
                      <td>{p.sex || '—'}{p.dob ? ` · ${age(p.dob)}y` : ''}</td>
                      <td>{p.programs ? p.programs.split(',').map((c) => <Badge key={c} tone="green">{c}</Badge>) : '—'}</td>
                      <td className="num">{p.visits}</td>
                      <td className="nowrap">{date(p.last_visit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}</Loader>
      {adding && <Modal title="Register patient" onClose={() => setAdding(false)}><PatientForm onSaved={(p) => nav(`/app/patients/${p.id}`)} /></Modal>}
    </div>
  );
}

export function PatientDetail() {
  const { id } = useParams();
  const state = useApi(`/patients/${id}`, [id]);
  const programs = useApi('/programs?active=1');
  const [editing, setEditing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [err, setErr] = useState(null);
  const [programId, setProgramId] = useState('');

  const enroll = async () => {
    setErr(null);
    try { await api.post(`/patients/${id}/enroll`, { program_id: Number(programId) }); setEnrolling(false); state.reload(); } catch (e) { setErr(e); }
  };
  const unenroll = async (pid) => { await api.post(`/patients/${id}/unenroll`, { program_id: pid }); state.reload(); };

  return (
    <div className="page">
      <Loader state={state}>{(p) => {
        const active = p.enrollments.filter((e) => e.status === 'active');
        const available = (programs.data || []).filter((pr) => pr.requires_enrollment && !active.some((e) => e.program_id === pr.id));
        return (
          <>
            <PageTitle title={p.name} subtitle={`Registered ${date(p.created_at)}`}>
              <Link className="btn" to="/app/pos">+ New sale</Link>
              <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>
            </PageTitle>
            <div className="grid cols-3" style={{ marginBottom: 16 }}>
              <div className="card">
                <h3>Details</h3>
                <div className="stack small" style={{ gap: 6 }}>
                  <div><span className="muted">Phone:</span> {phone(p.phone)} {p.phone && !p.sms_consent && <Badge tone="amber">No SMS</Badge>}</div>
                  <div><span className="muted">Sex / age:</span> {p.sex || '—'} {p.dob && `· ${age(p.dob)} years (${date(p.dob)})`}</div>
                  <div><span className="muted">Location:</span> {[p.village, p.district].filter(Boolean).join(', ') || '—'}</div>
                  <div><span className="muted">NIN:</span> {p.nin || '—'}</div>
                </div>
              </div>
              <div className="card" style={{ gridColumn: 'span 2' }}>
                <div className="card-head"><h3>Programmes</h3>{available.length > 0 && <button className="btn sm" onClick={() => setEnrolling(true)}>+ Enrol</button>}</div>
                {!p.enrollments.length ? <p className="muted small">Not enrolled in any programme. Open programmes (malaria, child health, family planning) apply without enrolment.</p> : (
                  <div className="stack" style={{ gap: 8 }}>
                    {p.enrollments.map((e) => (
                      <div key={e.id} className="row between">
                        <span><Badge tone={e.status === 'active' ? 'green' : ''}>{e.code}</Badge> <strong>{e.program_name}</strong> <span className="small muted">since {date(e.enrolled_at)}</span></span>
                        {e.status === 'active' ? <button className="btn sm ghost" onClick={() => unenroll(e.program_id)}>End</button> : <span className="small muted">ended</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="card flush">
              <div style={{ padding: '14px 16px' }}><h3 style={{ margin: 0 }}>Visit history</h3></div>
              {!p.sales.length ? <Empty>No purchases yet.</Empty> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Date</th><th>Receipt</th><th>Items</th><th>Programme</th><th className="num">Subsidy</th><th className="num">Paid</th></tr></thead>
                    <tbody>
                      {p.sales.map((s) => (
                        <tr key={s.id} style={s.voided ? { opacity: 0.5 } : undefined}>
                          <td className="nowrap">{dateTime(s.created_at)}</td>
                          <td><Link to={`/app/sales/${s.id}`} className="mono">{s.receipt_no}</Link></td>
                          <td className="small">{s.items}</td>
                          <td>{s.program_name || '—'}</td>
                          <td className="num">{s.subsidy_total ? ugx(s.subsidy_total) : '—'}</td>
                          <td className="num">{ugx(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {editing && <Modal title="Edit patient" onClose={() => setEditing(false)}><PatientForm id={p.id} initial={p} onSaved={() => { setEditing(false); state.reload(); }} /></Modal>}
            {enrolling && (
              <Modal title="Enrol in programme" onClose={() => setEnrolling(false)}>
                <div className="stack">
                  <ErrorBox error={err} />
                  <Field label="Programme">
                    <select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                      <option value="">Choose…</option>
                      {available.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} — {pr.discount_percent}% off</option>)}
                    </select>
                  </Field>
                  {programId && <p className="small muted">{available.find((x) => String(x.id) === programId)?.description}</p>}
                  <div className="form-actions"><button className="btn" disabled={!programId} onClick={enroll}>Enrol patient</button></div>
                </div>
              </Modal>
            )}
          </>
        );
      }}</Loader>
    </div>
  );
}
