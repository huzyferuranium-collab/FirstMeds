import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApi, Spinner, ErrorBox, Empty, useForm, Field } from '../components/UI.jsx';
import { api } from '../api.js';
import { date } from '../format.js';
import { PageHero } from './Pages.jsx';

const Paragraphs = ({ text }) => text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>);

export function News() {
  const { data, loading, error } = useApi('/public/news');
  return (
    <>
      <PageHero title="Newsroom">Updates from the FirstMeds network.</PageHero>
      <section className="section">
        <div className="container">
          <ErrorBox error={error} />
          {loading ? <Spinner /> : !data?.length ? <Empty>No news yet.</Empty> : (
            <div className="grid cols-3">
              {data.map((p) => (
                <Link className="post-card" key={p.id} to={`/news/${p.slug}`}>
                  <span className="badge green" style={{ alignSelf: 'flex-start' }}>{p.category}</span>
                  <h3>{p.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>{p.excerpt}</p>
                  <span className="small muted" style={{ marginTop: 'auto' }}>{date(p.published_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function NewsPost() {
  const { slug } = useParams();
  const { data, loading, error } = useApi(`/public/news/${slug}`);
  if (loading) return <Spinner />;
  if (error) return <div className="container section"><ErrorBox error={error} /><Link to="/news">← All news</Link></div>;
  return (
    <>
      <PageHero title={data.title}>{date(data.published_at)} · {data.category}</PageHero>
      <section className="section">
        <div className="container">
          <article className="prose"><Paragraphs text={data.body} /></article>
          <Link to="/news">← All news</Link>
        </div>
      </section>
    </>
  );
}

export function Careers() {
  const { data, loading } = useApi('/public/jobs');
  const [open, setOpen] = useState(null);
  return (
    <>
      <PageHero title="Careers">Help us bring quality medicines to every Ugandan community.</PageHero>
      <section className="section">
        <div className="container stack">
          <h2>Open positions</h2>
          {loading ? <Spinner /> : !data?.length ? <Empty>No open positions right now — check back soon.</Empty> : data.map((j) => (
            <div className="card" key={j.id}>
              <div className="row between">
                <div>
                  <h3 style={{ marginBottom: 4 }}>{j.title}</h3>
                  <div className="row small muted"><span>{j.department}</span>·<span>{j.location}</span>·<span>{j.employment_type}</span></div>
                </div>
                <button className="btn secondary sm" onClick={() => setOpen(open === j.id ? null : j.id)}>{open === j.id ? 'Hide' : 'Details'}</button>
              </div>
              {open === j.id && (
                <div style={{ marginTop: 16 }}>
                  <Paragraphs text={j.description} />
                  <a className="btn" href={`mailto:${j.apply_email || 'careers@firstmeds.ug'}?subject=${encodeURIComponent(`Application: ${j.title}`)}`}>Apply by email</a>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function Join() {
  const { data: districts } = useApi('/public/districts');
  const [done, setDone] = useState(false);
  const f = useForm({ facility_name: '', type: 'pharmacy', owner_name: '', phone: '', email: '', district: '', town: '', nda_license: '', message: '' });
  if (done) {
    return (
      <>
        <PageHero title="Thank you!" />
        <section className="section"><div className="container">
          <div className="alert success">We've received your application. A FirstMeds field officer will call you within 5 working days.</div>
          <p style={{ marginTop: 20 }}><Link to="/">← Back to home</Link></p>
        </div></section>
      </>
    );
  }
  return (
    <>
      <PageHero title="Join the FirstMeds network">Free tools, patient programmes and support for your pharmacy, drug shop or clinic.</PageHero>
      <section className="section">
        <div className="container split" style={{ alignItems: 'start' }}>
          <form className="card stack" onSubmit={f.submit(async (v) => { await api.post('/public/applications', v); setDone(true); })}>
            <h3>Tell us about your facility</h3>
            <ErrorBox error={f.error} />
            <div className="form-grid">
              <Field label="Facility name *" className="full"><input required value={f.values.facility_name} onChange={f.set('facility_name')} /></Field>
              <Field label="Type *">
                <select value={f.values.type} onChange={f.set('type')}>
                  <option value="pharmacy">Pharmacy</option><option value="drug_shop">Drug shop</option><option value="clinic">Clinic</option>
                </select>
              </Field>
              <Field label="NDA licence no.">
                <input value={f.values.nda_license} onChange={f.set('nda_license')} />
              </Field>
              <Field label="Owner / in-charge name *"><input required value={f.values.owner_name} onChange={f.set('owner_name')} /></Field>
              <Field label="Phone *"><input required type="tel" placeholder="0772 123456" value={f.values.phone} onChange={f.set('phone')} /></Field>
              <Field label="Email" className="full"><input type="email" value={f.values.email} onChange={f.set('email')} /></Field>
              <Field label="District *">
                <select required value={f.values.district} onChange={f.set('district')}>
                  <option value="">Choose…</option>
                  {districts?.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Town / trading centre"><input value={f.values.town} onChange={f.set('town')} /></Field>
              <Field label="Anything else?" className="full"><textarea value={f.values.message} onChange={f.set('message')} /></Field>
            </div>
            <button className="btn lg" disabled={f.busy}>{f.busy ? 'Sending…' : 'Submit application'}</button>
          </form>
          <div className="stack">
            <h2>What you get</h2>
            <ul className="checks">
              <li>The FirstMeds point-of-sale app, free</li>
              <li>On-site setup and staff training</li>
              <li>Access to subsidy programmes and monthly reimbursement</li>
              <li>SMS refill reminders for your patients</li>
              <li>Business reports and stock alerts</li>
            </ul>
            <div className="alert info">You'll need a valid National Drug Authority licence for your premises to join.</div>
          </div>
        </div>
      </section>
    </>
  );
}

export function Contact() {
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);
  const f = useForm({ name: '', email: '', phone: '', subject: params.get('subject') || '', message: '' });
  return (
    <>
      <PageHero title="Contact us">Questions, partnerships or press — we'd love to hear from you.</PageHero>
      <section className="section">
        <div className="container split" style={{ alignItems: 'start' }}>
          {done ? <div className="alert success">Thanks — your message has been sent. We'll get back to you soon.</div> : (
            <form className="card stack" onSubmit={f.submit(async (v) => { await api.post('/public/contact', v); setDone(true); })}>
              <ErrorBox error={f.error} />
              <div className="form-grid">
                <Field label="Your name *" className="full"><input required value={f.values.name} onChange={f.set('name')} /></Field>
                <Field label="Email"><input type="email" value={f.values.email} onChange={f.set('email')} /></Field>
                <Field label="Phone"><input type="tel" value={f.values.phone} onChange={f.set('phone')} /></Field>
                <Field label="Subject" className="full"><input value={f.values.subject} onChange={f.set('subject')} /></Field>
                <Field label="Message *" className="full"><textarea required value={f.values.message} onChange={f.set('message')} /></Field>
              </div>
              <button className="btn" disabled={f.busy}>{f.busy ? 'Sending…' : 'Send message'}</button>
            </form>
          )}
          <div className="stack">
            <div className="card"><h3>Head office</h3><p className="muted" style={{ margin: 0 }}>Kampala, Uganda</p></div>
            <div className="card"><h3>Email</h3><p style={{ margin: 0 }}><a href="mailto:hello@firstmeds.ug">hello@firstmeds.ug</a></p></div>
            <div className="card"><h3>Pharmacy support</h3><p className="muted" style={{ margin: 0 }}>Already a partner? Sign in to the app and use the help options, or call your field officer.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
