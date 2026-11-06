import { Link } from 'react-router-dom';
import { useApi, Spinner } from '../components/UI.jsx';
import { BarList } from '../components/Charts.jsx';
import { compact, num } from '../format.js';
import { ImpactStrip } from './Home.jsx';

export function PageHero({ title, children }) {
  return (
    <section className="page-hero">
      <div className="container">
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </section>
  );
}

export function PointOfSale() {
  const features = [
    ['⚡', 'Fast checkout', 'Search by brand or generic name, tap to add, and finish a sale in seconds — even on a basic Android phone.'],
    ['📦', 'Batches & expiry', 'Every batch is tracked. The app always sells the batch that expires first and blocks expired stock.'],
    ['📱', 'Mobile money', 'Record MTN MoMo, Airtel Money, cash or card with the transaction ID on every receipt.'],
    ['🔔', 'Smart alerts', 'Low-stock, out-of-stock and 90-day expiry alerts so you can reorder on time.'],
    ['👥', 'Patient records', 'Register patients, see their history, enrol them in programmes and remind them to refill.'],
    ['🧑‍⚕️', 'Staff roles', 'Owners, pharmacists and cashiers each see what they need. Only senior staff can void or discount.'],
    ['🧾', 'Receipts', 'Printable receipts with your NDA licence and TIN, shareable by SMS or WhatsApp.'],
    ['📈', 'Business reports', 'Daily sales, margins, best-sellers and payment mix, plus CSV export for your accountant.'],
  ];
  return (
    <>
      <PageHero title="The FirstMeds Point of Sale">
        A free pharmacy management app built for Uganda's pharmacies, drug shops and clinics.
      </PageHero>
      <section className="section">
        <div className="container">
          <div className="grid cols-4">
            {features.map(([ico, t, d]) => <div className="feature" key={t}><div className="ico">{ico}</div><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="container split">
          <div>
            <div className="section-head" style={{ marginBottom: 20 }}>
              <div className="kicker">Built for the counter</div>
              <h2>Designed with Ugandan pharmacists</h2>
            </div>
            <ul className="checks">
              <li>Prices in Uganda shillings, phone numbers in local format, times in East Africa Time.</li>
              <li>Drug shops automatically see only medicines they are licensed to sell.</li>
              <li>Works in the browser — install it on your phone home screen like an app.</li>
              <li>Your data stays yours. Patient information is only visible to your facility.</li>
            </ul>
            <div className="row"><Link to="/join" className="btn">Get the app free</Link><Link to="/app" className="btn secondary">Sign in</Link></div>
          </div>
          <div className="card">
            <h3>What it costs</h3>
            <p className="muted">The FirstMeds app is free for partner facilities. We are funded by programme partners who want quality data and better access to medicines.</p>
            <ul className="checks" style={{ marginBottom: 0 }}>
              <li>No setup fee</li>
              <li>No monthly subscription</li>
              <li>Free training and support from our field team</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

export function Programmes() {
  const { data, loading } = useApi('/public/programs');
  return (
    <>
      <PageHero title="Patient Programmes">
        Partner-funded discounts that make essential care affordable — applied instantly at FirstMeds pharmacies.
      </PageHero>
      <section className="section">
        <div className="container">
          {loading ? <Spinner /> : (
            <div className="grid cols-2">
              {data?.map((p) => (
                <div className="feature" key={p.id}>
                  <div className="row between" style={{ marginBottom: 10 }}>
                    <span className="badge green">{p.discount_percent === 100 ? 'Free' : `${p.discount_percent}% off`}</span>
                    <span className="small muted">{num(p.enrolled)} enrolled</span>
                  </div>
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <div className="section-head"><div className="kicker">How it works</div><h2>Simple for patients, transparent for funders</h2></div>
          <div className="steps">
            <div><h3>Visit a pharmacy</h3><p className="muted">Patients go to any FirstMeds partner near them. Some programmes need a one-time registration.</p></div>
            <div><h3>Discount at checkout</h3><p className="muted">The app checks eligibility and applies the subsidy to eligible medicines automatically.</p></div>
            <div><h3>Pharmacy is reimbursed</h3><p className="muted">Every subsidised sale is recorded. Pharmacies submit a monthly claim and get paid.</p></div>
            <div><h3>Funders see impact</h3><p className="muted">Partners get dashboards showing reach, spend and outcomes by district.</p></div>
          </div>
          <div style={{ marginTop: 32 }}><Link to="/contact?subject=Partnership" className="btn">Fund a programme</Link></div>
        </div>
      </section>
    </>
  );
}

export function DataInsights() {
  const { data } = useApi('/public/stats');
  return (
    <>
      <PageHero title="Data Insights">
        Every sale on the FirstMeds network is anonymised and aggregated into a live picture of Uganda's medicine market.
      </PageHero>
      <ImpactStrip />
      <section className="section">
        <div className="container">
          {!data ? <Spinner /> : (
            <div className="grid cols-2">
              <div className="card">
                <h3>Patient visits by district</h3>
                <p className="small muted">Non-voided sales recorded at partner facilities.</p>
                <BarList items={data.by_district.map((d) => ({ label: d.district, value: d.visits }))} format={num} />
              </div>
              <div className="card">
                <h3>What patients buy most</h3>
                <p className="small muted">Units dispensed by therapeutic category.</p>
                <BarList items={data.top_categories.map((c) => ({ label: c.category, value: c.units }))} format={compact} color="var(--accent)" />
              </div>
            </div>
          )}
        </div>
      </section>
      <section className="section alt">
        <div className="container grid cols-3">
          <div className="feature"><div className="ico">🗺️</div><h3>Stock-out monitoring</h3><p>See where essential medicines are running out, before patients are turned away.</p></div>
          <div className="feature"><div className="ico">💰</div><h3>Price transparency</h3><p>Track retail prices of essential medicines across districts and over time.</p></div>
          <div className="feature"><div className="ico">🦠</div><h3>Early warning</h3><p>Spikes in malaria tests or diarrhoea treatment can signal outbreaks days earlier.</p></div>
        </div>
        <div className="container" style={{ marginTop: 32 }}>
          <Link to="/contact?subject=Data%20request" className="btn">Request a data partnership</Link>
        </div>
      </section>
    </>
  );
}

export function About() {
  return (
    <>
      <PageHero title="About FirstMeds">We believe every Ugandan should get the right medicine, at a fair price, close to home.</PageHero>
      <section className="section">
        <div className="container split">
          <div className="prose">
            <h2>Our story</h2>
            <p>In Uganda, the local pharmacy or drug shop is often the first — and sometimes the only — place people go when they are unwell. These businesses are run by dedicated health workers, but most still work with paper books, guess at stock levels and have no way to offer patients the subsidies that donors and government fund.</p>
            <p>FirstMeds started with a simple idea: give these facilities great digital tools for free, and use the network they form to deliver affordable care and better data.</p>
            <p>We are starting in Uganda, working district by district with pharmacists, the National Drug Authority's standards and local partners.</p>
          </div>
          <div className="grid">
            <div className="feature"><div className="ico">🎯</div><h3>Mission</h3><p>Make quality medicines affordable and accessible at every neighbourhood pharmacy in Uganda.</p></div>
            <div className="feature"><div className="ico">🤝</div><h3>How we work</h3><p>Pharmacists first. We build with them, train in local languages and stay on the ground.</p></div>
            <div className="feature"><div className="ico">🔒</div><h3>Trust</h3><p>Patient data is private to each facility. We only share anonymised, aggregated insights.</p></div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <div className="section-head"><div className="kicker">Our team</div><h2>Pharmacists, engineers and field officers</h2>
            <p>We are a growing team based in Kampala with field staff across the regions. <Link to="/careers">We're hiring</Link>.</p></div>
          <div className="grid cols-4">
            {[['Operations', 'Onboarding and supporting partner facilities'], ['Technology', 'Building the app and data platform'], ['Programmes', 'Designing subsidies with partners'], ['Data & Impact', 'Measuring what works']].map(([t, d]) => (
              <div className="feature" key={t}><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function NotFound() {
  return (
    <section className="section">
      <div className="container" style={{ textAlign: 'center' }}>
        <h1>Page not found</h1>
        <p className="muted">The page you are looking for does not exist.</p>
        <Link to="/" className="btn">Back to home</Link>
      </div>
    </section>
  );
}
