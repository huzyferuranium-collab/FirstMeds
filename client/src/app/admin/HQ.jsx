import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useApi, Loader, PageTitle, Badge, Empty, Modal, Field, ErrorBox, useForm, Tabs, Stat } from '../../components/UI.jsx';
import { BarList } from '../../components/Charts.jsx';
import { ugx, num, date, dateTime, compact, phone, TYPE_LABELS } from '../../format.js';
import { RangePicker, Charts } from '../Dashboard.jsx';
import { FacilityForm } from '../Ops.jsx';

/* ---------------- Network overview ---------------- */
export function Network() {
  const [days, setDays] = useState(30);
  const state = useApi(`/reports/network?days=${days}`);
  const { setPharmacyId } = useAuth();
  const open = (id) => { setPharmacyId(id); window.location.assign('/app'); };
  return (
    <div className="page">
      <PageTitle title="Network overview" subtitle="All FirstMeds facilities in Uganda."><RangePicker days={days} setDays={setDays} /></PageTitle>
      <Loader state={state}>{(m) => (
        <div className="stack">
          <div className="grid cols-4">
            <Stat label="Network revenue" value={ugx(m.totals.revenue)} sub={`${num(m.totals.sales)} patient visits`} />
            <Stat label="Subsidies delivered" value={ugx(m.totals.subsidy)} sub="paid by programme partners" />
            <Stat label="Active facilities" value={num(m.facilities.filter((f) => f.status === 'active').length)} sub={`${m.districts.length} districts`} />
            <Stat label="Registered patients served" value={num(m.totals.patients)} />
          </div>
          <Charts m={m} />
          <div className="grid cols-2">
            <div className="card">
              <div className="card-head"><h3>Revenue by district</h3></div>
              <BarList items={m.districts.map((d) => ({ label: d.district, value: d.revenue }))} />
            </div>
            <div className="card">
              <div className="card-head"><h3>Programme reach</h3></div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Programme</th><th className="num">Enrolled</th><th className="num">Visits</th><th className="num">Subsidy</th></tr></thead>
                <tbody>{m.programs.map((p) => <tr key={p.id}><td>{p.name}</td><td className="num">{num(p.enrolled)}</td><td className="num">{num(p.visits)}</td><td className="num">{compact(p.subsidy)}</td></tr>)}</tbody>
              </table></div>
            </div>
          </div>
          <div className="grid cols-2">
            <div className="card flush">
              <div style={{ padding: '14px 16px' }}><h3 style={{ margin: 0 }}>Facility league table</h3></div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Facility</th><th>District</th><th className="num">Visits</th><th className="num">Revenue</th><th>Last sale</th></tr></thead>
                <tbody>{m.facilities.map((f) => (
                  <tr key={f.id} className="clickable" onClick={() => open(f.id)} title="Open this facility">
                    <td><strong>{f.name}</strong> {f.status !== 'active' && <Badge tone="red">{f.status}</Badge>}</td><td>{f.district}</td>
                    <td className="num">{num(f.sales)}</td><td className="num">{compact(f.revenue)}</td><td className="small nowrap">{dateTime(f.last_sale)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Essential-medicine stock-outs</h3><span className="small muted">facilities with zero sellable stock</span></div>
              {!m.stockouts.length ? <Empty>No stock-outs of essential medicines. 🎉</Empty> :
                <BarList items={m.stockouts.map((s) => ({ label: `${s.name} ${s.strength || ''}`, value: s.facilities_out }))} format={num} color="var(--danger)" />}
            </div>
          </div>
        </div>
      )}</Loader>
    </div>
  );
}

/* ---------------- Facilities ---------------- */
export function Pharmacies() {
  const state = useApi('/admin/pharmacies');
  const [edit, setEdit] = useState(null);
  const { setPharmacyId } = useAuth();
  return (
    <div className="page">
      <PageTitle title="Facilities" subtitle="Pharmacies, drug shops and clinics on the network."><button className="btn" onClick={() => setEdit({})}>+ Add facility</button></PageTitle>
      <Loader state={state}>{(rows) => (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Type</th><th>District</th><th>Phone</th><th>NDA licence</th><th className="num">Staff</th><th>Last sale</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong><div className="small muted">{p.town}</div></td>
              <td>{TYPE_LABELS[p.type]}</td><td>{p.district}</td><td className="nowrap">{phone(p.phone)}</td><td className="small mono">{p.nda_license || '—'}</td>
              <td className="num">{p.staff}</td><td className="small nowrap">{date(p.last_sale)}</td>
              <td><Badge tone={p.status === 'active' ? 'green' : 'red'}>{p.status}</Badge></td>
              <td className="nowrap right">
                <button className="btn sm secondary" onClick={() => setEdit(p)}>Edit</button>{' '}
                <button className="btn sm ghost" onClick={() => { setPharmacyId(p.id); window.location.assign('/app'); }}>Open</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}</Loader>
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'Add facility'} onClose={() => setEdit(null)} wide>
          <FacilityForm pharmacy={edit.id ? edit : null} adminMode onSaved={() => { setEdit(null); state.reload(); }} />
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Applications ---------------- */
export function Applications() {
  const state = useApi('/admin/applications');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [emailFor, setEmailFor] = useState(null);
  const [email, setEmail] = useState('');
  const approve = async (a, extra = {}) => {
    setErr(null);
    try { setResult(await api.post(`/admin/applications/${a.id}/approve`, extra)); setEmailFor(null); state.reload(); } catch (e) { setErr(e); }
  };
  const reject = async (a) => { await api.post(`/admin/applications/${a.id}/reject`); state.reload(); };
  return (
    <div className="page">
      <PageTitle title="Applications" subtitle="Facilities that applied to join through the website." />
      <ErrorBox error={err} />
      <Loader state={state}>{(rows) => !rows.length ? <Empty>No applications yet.</Empty> : (
        <div className="stack">{rows.map((a) => (
          <div className="card" key={a.id} style={a.status !== 'new' ? { opacity: 0.65 } : undefined}>
            <div className="row between">
              <div>
                <h3 style={{ marginBottom: 4 }}>{a.facility_name} <Badge tone={a.status === 'new' ? 'blue' : a.status === 'approved' ? 'green' : 'red'}>{a.status}</Badge></h3>
                <div className="small muted">{TYPE_LABELS[a.type]} · {[a.town, a.district].filter(Boolean).join(', ')} · applied {date(a.created_at)}</div>
              </div>
              {a.status === 'new' && <div className="row">
                <button className="btn" onClick={() => (a.email ? approve(a) : setEmailFor(a))}>Approve &amp; create account</button>
                <button className="btn secondary" onClick={() => reject(a)}>Reject</button>
              </div>}
            </div>
            <div className="row small" style={{ marginTop: 10 }}>
              <span><strong>{a.owner_name}</strong></span>·<span>{phone(a.phone)}</span>{a.email && <>·<span>{a.email}</span></>}{a.nda_license && <>·<span>NDA {a.nda_license}</span></>}
            </div>
            {a.message && <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>“{a.message}”</p>}
          </div>
        ))}</div>
      )}</Loader>
      {emailFor && (
        <Modal title="Login email for the owner" onClose={() => setEmailFor(null)}>
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>This application has no email. Enter one to use as the owner's login.</p>
            <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <div className="form-actions"><button className="btn" disabled={!email} onClick={() => approve(emailFor, { email })}>Approve</button></div>
          </div>
        </Modal>
      )}
      {result && (
        <Modal title="Facility created" onClose={() => setResult(null)}>
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Share these details with the owner. They must change the password on first sign-in.</p>
            <div className="card mono">Email: {result.login_email}<br />Password: <strong>{result.temporary_password}</strong></div>
            <div className="form-actions"><button className="btn" onClick={() => setResult(null)}>Done</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Catalogue ---------------- */
function ProductForm({ product, onSaved }) {
  const cats = useApi('/products/categories');
  const f = useForm({ name: '', generic_name: '', strength: '', form: '', category: '', unit: 'unit', nda_reg_no: '', default_price: 0, is_essential: false, requires_prescription: false, active: true,
    ...product, is_essential: !!product?.is_essential, requires_prescription: !!product?.requires_prescription, active: product ? !!product.active : true });
  return (
    <form className="stack" onSubmit={f.submit(async (v) => { const body = { ...v, default_price: Number(v.default_price) }; await (product?.id ? api.put(`/products/${product.id}`, body) : api.post('/products', body)); onSaved(); })}>
      <ErrorBox error={f.error} />
      <div className="form-grid">
        <Field label="Name *" className="full"><input required value={f.values.name} onChange={f.set('name')} /></Field>
        <Field label="Generic name"><input value={f.values.generic_name || ''} onChange={f.set('generic_name')} /></Field>
        <Field label="Strength / pack"><input value={f.values.strength || ''} onChange={f.set('strength')} /></Field>
        <Field label="Form"><input value={f.values.form || ''} onChange={f.set('form')} placeholder="tablet, syrup…" /></Field>
        <Field label="Category"><input list="cats" value={f.values.category || ''} onChange={f.set('category')} /></Field>
        <datalist id="cats">{cats.data?.map((c) => <option key={c} value={c} />)}</datalist>
        <Field label="Sold per"><input value={f.values.unit} onChange={f.set('unit')} placeholder="strip, bottle…" /></Field>
        <Field label="NDA registration no."><input value={f.values.nda_reg_no || ''} onChange={f.set('nda_reg_no')} /></Field>
        <Field label="Recommended price (UGX) *"><input required type="number" min="0" value={f.values.default_price} onChange={f.set('default_price')} /></Field>
        <label className="field inline"><input type="checkbox" checked={f.values.is_essential} onChange={f.set('is_essential')} /> Essential medicine</label>
        <label className="field inline"><input type="checkbox" checked={f.values.requires_prescription} onChange={f.set('requires_prescription')} /> Prescription only</label>
        {product?.id && <label className="field inline"><input type="checkbox" checked={f.values.active} onChange={f.set('active')} /> Active</label>}
      </div>
      <div className="form-actions"><button className="btn" disabled={f.busy}>Save</button></div>
    </form>
  );
}

export function Catalogue() {
  const state = useApi('/products?all=1');
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  return (
    <div className="page">
      <PageTitle title="Product catalogue" subtitle="Network-wide list of medicines and supplies. Facilities set their own prices."><button className="btn" onClick={() => setEdit({})}>+ Add product</button></PageTitle>
      <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <Loader state={state}>{(rows) => (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Generic</th><th>Category</th><th>NDA reg.</th><th className="num">Rec. price</th><th>Flags</th></tr></thead>
          <tbody>{rows.filter((p) => `${p.name} ${p.generic_name} ${p.category}`.toLowerCase().includes(q.toLowerCase())).map((p) => (
            <tr key={p.id} className="clickable" onClick={() => setEdit(p)} style={!p.active ? { opacity: 0.5 } : undefined}>
              <td><strong>{p.name}</strong> <span className="small muted">{p.strength}</span></td><td className="small">{p.generic_name}</td><td>{p.category}</td>
              <td className="small mono">{p.nda_reg_no}</td><td className="num">{ugx(p.default_price)}</td>
              <td>{p.is_essential ? <Badge tone="green">EML</Badge> : null} {p.requires_prescription ? <Badge tone="blue">Rx</Badge> : null} {!p.active && <Badge>inactive</Badge>}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}</Loader>
      {edit && <Modal title={edit.id ? `Edit ${edit.name}` : 'Add product'} onClose={() => setEdit(null)} wide><ProductForm product={edit.id ? edit : null} onSaved={() => { setEdit(null); state.reload(); }} /></Modal>}
    </div>
  );
}

/* ---------------- Website content ---------------- */
function PostForm({ post, onSaved, onDelete }) {
  const f = useForm({ title: '', excerpt: '', body: '', category: 'Update', published: true, ...post, published: post ? !!post.published : true });
  return (
    <form className="stack" onSubmit={f.submit(async (v) => { await (post?.id ? api.put(`/admin/news/${post.id}`, v) : api.post('/admin/news', v)); onSaved(); })}>
      <ErrorBox error={f.error} />
      <Field label="Title *"><input required value={f.values.title} onChange={f.set('title')} /></Field>
      <div className="form-grid">
        <Field label="Category"><input value={f.values.category} onChange={f.set('category')} /></Field>
        <label className="field inline"><input type="checkbox" checked={f.values.published} onChange={f.set('published')} /> Published</label>
      </div>
      <Field label="Summary"><input value={f.values.excerpt || ''} onChange={f.set('excerpt')} /></Field>
      <Field label="Article * (blank line between paragraphs)"><textarea required rows={10} value={f.values.body} onChange={f.set('body')} /></Field>
      <div className="form-actions">{post?.id && <button type="button" className="btn danger" onClick={onDelete}>Delete</button>}<span className="spacer" /><button className="btn" disabled={f.busy}>Save</button></div>
    </form>
  );
}

function JobForm({ job, onSaved, onDelete }) {
  const f = useForm({ title: '', department: '', location: 'Kampala', employment_type: 'Full-time', description: '', apply_email: 'careers@firstmeds.ug', published: true, ...job, published: job ? !!job.published : true });
  return (
    <form className="stack" onSubmit={f.submit(async (v) => { await (job?.id ? api.put(`/admin/jobs/${job.id}`, v) : api.post('/admin/jobs', v)); onSaved(); })}>
      <ErrorBox error={f.error} />
      <div className="form-grid">
        <Field label="Title *" className="full"><input required value={f.values.title} onChange={f.set('title')} /></Field>
        <Field label="Department"><input value={f.values.department || ''} onChange={f.set('department')} /></Field>
        <Field label="Location"><input value={f.values.location} onChange={f.set('location')} /></Field>
        <Field label="Type"><input value={f.values.employment_type} onChange={f.set('employment_type')} /></Field>
        <Field label="Apply email"><input type="email" value={f.values.apply_email || ''} onChange={f.set('apply_email')} /></Field>
        <Field label="Description *" className="full"><textarea required rows={8} value={f.values.description} onChange={f.set('description')} /></Field>
        <label className="field inline"><input type="checkbox" checked={f.values.published} onChange={f.set('published')} /> Published</label>
      </div>
      <div className="form-actions">{job?.id && <button type="button" className="btn danger" onClick={onDelete}>Delete</button>}<span className="spacer" /><button className="btn" disabled={f.busy}>Save</button></div>
    </form>
  );
}

export function Website() {
  const [tab, setTab] = useState('news');
  const news = useApi(tab === 'news' ? '/admin/news' : null, [tab]);
  const jobs = useApi(tab === 'jobs' ? '/admin/jobs' : null, [tab]);
  const msgs = useApi(tab === 'messages' ? '/admin/messages' : null, [tab]);
  const [edit, setEdit] = useState(null);
  const close = () => { setEdit(null); news.reload(); jobs.reload(); };
  return (
    <div className="page">
      <PageTitle title="Website content" subtitle="Manage the public firstmeds.ug site.">
        {tab !== 'messages' && <button className="btn" onClick={() => setEdit({})}>+ New {tab === 'news' ? 'article' : 'job'}</button>}
      </PageTitle>
      <Tabs value={tab} onChange={setTab} tabs={[['news', 'News'], ['jobs', 'Careers'], ['messages', 'Contact messages']]} />
      {tab === 'news' && <Loader state={news}>{(rows) => (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Title</th><th>Category</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>{rows.map((p) => <tr key={p.id} className="clickable" onClick={() => setEdit(p)}><td><strong>{p.title}</strong></td><td>{p.category}</td><td>{date(p.published_at)}</td><td>{p.published ? <Badge tone="green">Live</Badge> : <Badge>Draft</Badge>}</td></tr>)}</tbody>
        </table></div></div>
      )}</Loader>}
      {tab === 'jobs' && <Loader state={jobs}>{(rows) => (
        <div className="card flush"><div className="table-wrap"><table className="table">
          <thead><tr><th>Title</th><th>Department</th><th>Location</th><th>Status</th></tr></thead>
          <tbody>{rows.map((j) => <tr key={j.id} className="clickable" onClick={() => setEdit(j)}><td><strong>{j.title}</strong></td><td>{j.department}</td><td>{j.location}</td><td>{j.published ? <Badge tone="green">Live</Badge> : <Badge>Hidden</Badge>}</td></tr>)}</tbody>
        </table></div></div>
      )}</Loader>}
      {tab === 'messages' && <Loader state={msgs}>{(rows) => !rows.length ? <Empty>No messages.</Empty> : (
        <div className="stack">{rows.map((m) => (
          <div className="card" key={m.id} style={m.handled ? { opacity: 0.6 } : undefined}>
            <div className="row between">
              <div><strong>{m.name}</strong> <span className="small muted">{[m.email, m.phone].filter(Boolean).join(' · ')} · {dateTime(m.created_at)}</span></div>
              {!m.handled && <button className="btn sm secondary" onClick={async () => { await api.post(`/admin/messages/${m.id}/handled`); msgs.reload(); }}>Mark handled</button>}
            </div>
            {m.subject && <div className="small" style={{ marginTop: 6 }}><strong>{m.subject}</strong></div>}
            <p style={{ marginTop: 6, marginBottom: 0 }}>{m.message}</p>
          </div>
        ))}</div>
      )}</Loader>}
      {edit && tab === 'news' && <Modal wide title={edit.id ? 'Edit article' : 'New article'} onClose={() => setEdit(null)}><PostForm post={edit.id ? edit : null} onSaved={close} onDelete={async () => { await api.del(`/admin/news/${edit.id}`); close(); }} /></Modal>}
      {edit && tab === 'jobs' && <Modal wide title={edit.id ? 'Edit job' : 'New job'} onClose={() => setEdit(null)}><JobForm job={edit.id ? edit : null} onSaved={close} onDelete={async () => { await api.del(`/admin/jobs/${edit.id}`); close(); }} /></Modal>}
    </div>
  );
}
