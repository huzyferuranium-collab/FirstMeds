import { Link } from 'react-router-dom';
import { useApi } from '../components/UI.jsx';
import { compact, num } from '../format.js';

export function ImpactStrip() {
  const { data } = useApi('/public/stats');
  const items = [
    [data ? num(data.facilities) : '—', 'Partner facilities'],
    [data ? num(data.districts) : '—', 'Districts in Uganda'],
    [data ? compact(data.patient_visits) : '—', 'Patient visits recorded'],
    [data ? `UGX ${compact(data.subsidy_ugx)}` : '—', 'Subsidies delivered'],
  ];
  return (
    <div className="container">
      <div className="impact">
        {items.map(([v, l]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}
      </div>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="phone-mock" aria-hidden="true">
      <div className="screen">
        <div className="bar"><span>New sale</span><span>FM1-0042</span></div>
        <div className="line"><div>Malaria Rapid Test<small>Batch B1-2207 · exp Mar 2028</small></div><b>3,000</b></div>
        <div className="line"><div>Artemether-Lumefantrine<small>20/120mg ×24</small></div><b>12,000</b></div>
        <div className="line"><div>Paracetamol 500mg<small>×10</small></div><b>500</b></div>
        <div className="tot sub"><span>Malaria Test &amp; Treat −50%</span><span>−7,500</span></div>
        <div className="tot"><span>Patient pays</span><span>UGX 8,000</span></div>
        <div className="pay">Pay with MTN MoMo</div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <div>
            <span className="eyebrow">
              <span className="flag"><i style={{ background: '#000' }} /><i style={{ background: '#fcdc04' }} /><i style={{ background: '#d90000' }} /></span>
              Now live across Uganda
            </span>
            <h1>Quality medicines, first, for every Ugandan.</h1>
            <p className="lead">
              FirstMeds gives neighbourhood pharmacies, drug shops and clinics a simple point-of-sale app, links patients to subsidised
              care at the counter, and turns every sale into health data that helps the whole country.
            </p>
            <div className="row" style={{ marginTop: 28, gap: 12 }}>
              <Link to="/join" className="btn accent lg">Join the network</Link>
              <Link to="/point-of-sale" className="btn secondary lg">See how it works</Link>
            </div>
          </div>
          <PhoneMock />
        </div>
      </section>
      <ImpactStrip />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="kicker">What we do</div>
            <h2>One platform for the pharmacies Ugandans already trust</h2>
            <p>Most people visit a pharmacy or drug shop before any other health facility. We make that first visit count.</p>
          </div>
          <div className="grid cols-3">
            <div className="feature"><div className="ico">🧾</div><h3>Point of Sale</h3><p>Fast checkout on any Android phone or laptop. Batch and expiry tracking, MTN MoMo and Airtel Money, and printable receipts.</p><p style={{ marginTop: 12 }}><Link to="/point-of-sale">Explore the app →</Link></p></div>
            <div className="feature"><div className="ico">💚</div><h3>Patient Programmes</h3><p>Partner-funded discounts on malaria tests, chronic care, maternal and child health — applied automatically at the counter.</p><p style={{ marginTop: 12 }}><Link to="/programmes">View programmes →</Link></p></div>
            <div className="feature"><div className="ico">📊</div><h3>Data Insights</h3><p>Real-time view of medicine demand, prices and stock-outs by district, for pharmacies, partners and the health system.</p><p style={{ marginTop: 12 }}><Link to="/data">See the data →</Link></p></div>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container split">
          <div>
            <div className="section-head" style={{ marginBottom: 24 }}>
              <div className="kicker">For pharmacy owners</div>
              <h2>Run a better business — and a healthier community</h2>
            </div>
            <ul className="checks">
              <li><strong>Know your stock.</strong> Low-stock and expiry alerts so you never sell an expired medicine or turn a patient away.</li>
              <li><strong>Get paid for subsidies.</strong> Programme discounts are tracked per sale and claimed every month in one click.</li>
              <li><strong>Keep patients coming back.</strong> Refill reminders by SMS for people on long-term treatment.</li>
              <li><strong>See your numbers.</strong> Daily sales, margins and best-sellers on your phone.</li>
            </ul>
            <Link to="/join" className="btn">Apply to join — it's free</Link>
          </div>
          <div className="steps">
            <div><h3>Apply online</h3><p className="muted">Tell us about your facility and NDA licence. We reply within a week.</p></div>
            <div><h3>Get set up</h3><p className="muted">Our field team loads your stock, trains your staff and gets you live in a day.</p></div>
            <div><h3>Serve more patients</h3><p className="muted">Offer programme discounts, send refill reminders and grow with the network.</p></div>
          </div>
        </div>
      </section>

      <section className="section dark">
        <div className="container">
          <div className="section-head center">
            <div className="kicker">Why it matters</div>
            <h2>Closing the last mile of healthcare</h2>
            <p>Better data at the pharmacy counter means fewer stock-outs, fairer prices and treatment that starts with a diagnosis.</p>
          </div>
          <div className="grid cols-4">
            <div className="feature"><div className="ico">🦟</div><h3>Test before treat</h3><p>Every fever deserves a malaria test. Subsidised rapid tests make it the easy choice.</p></div>
            <div className="feature"><div className="ico">❤️</div><h3>Chronic care</h3><p>Affordable refills and reminders for hypertension and diabetes.</p></div>
            <div className="feature"><div className="ico">🤰</div><h3>Mothers &amp; babies</h3><p>Iron-folic acid, delivery kits and cord care for expectant mothers.</p></div>
            <div className="feature"><div className="ico">🧒</div><h3>Child health</h3><p>Free ORS and zinc for children with diarrhoea.</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta-band">
            <div>
              <h2>Partner with FirstMeds</h2>
              <p>Fund a programme, access market data, or bring your facility onto the network.</p>
            </div>
            <div className="row">
              <Link to="/contact?subject=Partnership" className="btn accent lg">Talk to us</Link>
              <Link to="/join" className="btn secondary lg">Join as a pharmacy</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
