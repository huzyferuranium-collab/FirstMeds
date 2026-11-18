import { Link } from 'react-router-dom';
import { PageHero } from './Pages.jsx';
import { ImpactStrip } from './Home.jsx';

// The problems Ugandan pharmacies and drug shops tell us about most, and what FirstMeds does about each.
const PROBLEMS = [
  {
    ico: '🛡️', title: 'Fake and substandard medicines',
    pain: 'Falsified antimalarials and antibiotics reach shelves through informal suppliers. One bad batch can harm patients and cost you your licence.',
    fix: [
      'Verify a medicine by scanning its barcode or typing its name and batch number',
      'Report a suspect batch in one step. It is quarantined immediately at every FirstMeds facility that holds it',
      'Deliveries of a flagged batch are quarantined on arrival, and quarantined stock can never be sold',
      'Every batch is traced to its supplier and receipt',
    ],
  },
  {
    ico: '📦', title: 'Stock-outs and guesswork',
    pain: 'Paper books and memory mean fast-moving medicines run out and patients walk to the next shop.',
    fix: ['Live stock for every medicine and batch', 'Low-stock and out-of-stock alerts', 'Reorder suggestions based on how fast each item really sells and how long your supplier takes to deliver'],
  },
  {
    ico: '⏳', title: 'Money lost to expired stock',
    pain: 'Expired medicines are pure loss and a risk at inspection.',
    fix: ['Sells the batch that expires first, automatically', '90-day expiry warnings so you can sell or return in time', 'Expired batches are blocked at the till and written off properly'],
  },
  {
    ico: '💚', title: 'Patients who cannot afford treatment',
    pain: 'People buy half a course, skip tests or go without.',
    fix: ['Partner-funded discounts on malaria tests, chronic care, mother & child health and family planning, applied at checkout', 'One-click monthly claims so your pharmacy is reimbursed for every subsidy'],
  },
  {
    ico: '📈', title: 'Thin margins and cash flow',
    pain: 'Without numbers you cannot see what makes money, and lenders and suppliers will not give you credit.',
    fix: ['Daily revenue, gross margin and best-sellers on your phone', 'Supplier balances and due dates in one place', 'A clean digital track record that supports supplier credit and stock financing'],
  },
  {
    ico: '⚖️', title: 'NDA inspections and compliance',
    pain: 'Inspections are stressful, and drug shops risk selling medicines their licence does not allow.',
    fix: ['Drug shops are automatically prevented from stocking or selling prescription-only medicines', 'Prescription register filled in at the counter, with prescriber, registration number and date', 'Licence number and TIN on every receipt, with receipts ready for URA EFRIS'],
  },
  {
    ico: '🩺', title: 'Unsafe dispensing',
    pain: 'Antibiotics without prescriptions and antimalarials without a test drive resistance and hide other illnesses.',
    fix: ['The till asks about a malaria test before any antimalarial is sold', 'Prescription-only medicines need prescription details', 'Dispensing advice appears on screen for every medicine that needs it'],
  },
  {
    ico: '🔐', title: 'Cash leakage and theft',
    pain: 'Missing cash, fake mobile money messages and unrecorded sales eat your profit quietly.',
    fix: ['Each cashier opens and closes their own till, and shortages show immediately', 'Mobile money payments are matched against your MTN and Airtel statement', 'Voids and discounts need a senior staff member and a reason', 'Every stock movement is logged with who did it'],
  },
  {
    ico: '📴', title: 'No internet, no power',
    pain: 'Systems that stop working when the network drops are useless in much of Uganda.',
    fix: ['Keep selling without internet. Sales are saved on the phone or laptop', 'Everything syncs automatically, and safely, when the connection returns', 'Installs on any Android phone like an app'],
  },
  {
    ico: '🚚', title: 'Unreliable suppliers and prices',
    pain: 'Prices differ a lot between wholesalers, and it is hard to know who is cheapest or reliable.',
    fix: ['Compare prices from licensed wholesalers side by side', 'Purchase orders sent by WhatsApp and received batch by batch', 'See how much you could have saved on every order'],
  },
];

export default function Why() {
  return (
    <>
      <PageHero title="Why pharmacies choose FirstMeds">
        Ten problems every Ugandan pharmacy and drug shop knows, and how FirstMeds solves each one in a single app.
      </PageHero>
      <ImpactStrip />
      <section className="section">
        <div className="container stack" style={{ gap: 20 }}>
          {PROBLEMS.map((p, i) => (
            <div key={p.title} className="card problem-card">
              <div>
                <div className="row" style={{ gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 28 }}>{p.ico}</span>
                  <span className="badge amber">Problem {i + 1}</span>
                </div>
                <h3 style={{ fontSize: 22 }}>{p.title}</h3>
                <p className="muted" style={{ margin: 0 }}>{p.pain}</p>
              </div>
              <div>
                <div className="kicker" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>How FirstMeds solves it</div>
                <ul className="checks" style={{ margin: 0 }}>{p.fix.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="section alt">
        <div className="container split">
          <div>
            <div className="section-head" style={{ marginBottom: 16 }}>
              <div className="kicker">See it for your pharmacy</div>
              <h2>The FirstMeds health check</h2>
              <p>Every partner pharmacy gets a live score across all ten areas, with the next thing to fix. Our field officers review it with you every month.</p>
            </div>
            <div className="row">
              <Link to="/join" className="btn lg">Join the network, free</Link>
              <Link to="/app/login" className="btn secondary lg">Try the demo</Link>
            </div>
          </div>
          <div className="card">
            <h3>What it costs</h3>
            <ul className="checks" style={{ marginBottom: 0 }}>
              <li>The app is free for partner pharmacies, drug shops and clinics</li>
              <li>Setup, stock loading and staff training on site</li>
              <li>Works on the phone or laptop you already have</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
