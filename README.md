# FirstMeds

**Quality medicines, first, for every Ugandan.**

FirstMeds is a digital network for Uganda's neighbourhood pharmacies, drug shops and clinics. It has three parts:

1. **Point of Sale app**: checkout, batch and expiry tracking, MTN MoMo and Airtel Money, receipts, patients and staff roles.
2. **Patient programmes**: partner-funded subsidies applied automatically at the counter, with monthly reimbursement claims.
3. **Data insights**: live dashboards for each facility, plus a network-wide HQ view by district, programme and stock-outs.

It also includes the public website (home, point of sale, programmes, data, about, news, careers, join, contact). The site is managed from the HQ admin area.

## Quick start

Requires **Node.js 22.5+**. It uses the built-in `node:sqlite`, so there are no native modules to compile.

```bash
npm install
npm run seed      # demo data: 10 facilities, 90 days of sales
npm run dev       # API on :4000, web on http://localhost:5173
```

Demo sign-ins at `/app/login` all use the password `demo1234`:

| Role | Email | Can do |
|---|---|---|
| HQ admin | `admin@firstmeds.ug` | Everything; pick any facility under "Working as" |
| Owner | `owner1@demo.firstmeds.ug` … `owner10@…` | Own facility: prices, staff, claims, reports |
| Pharmacist | `pharmacist1@demo.firstmeds.ug` | Sales, stock receiving and adjustments, voids, discounts |
| Cashier | `cashier1@demo.firstmeds.ug` | Sales and patients |

Other commands:

```bash
npm test          # API test suite (node:test, in-memory DB)
npm run build     # production build of the web client
npm start         # serve API + built client on :4000
```

## Presenting FirstMeds to pharmacies (demo script, ~10 minutes)

Open the site, then go to `/app/login` and use the demo accounts (password `demo1234`).

1. **Website → "Why FirstMeds"** (`/why-firstmeds`): the 10 problems pharmacies face and how each is solved. Start here.
2. **Sign in as `owner1@demo.firstmeds.ug` → Health check**: one score across 11 areas, with what to fix next. Each card opens the screen that fixes it.
3. **New sale**: add *Amoxicillin* and *Artemether-Lumefantrine*. Show the dispensing advice, the malaria-test question and the prescription details the app requires. Pay with MTN MoMo and show the receipt (prescriber, EFRIS number, batch and expiry).
4. **Offline**: switch the phone to airplane mode and make a sale. It is saved on the device, then syncs when you reconnect (*Cash & payments → Offline sales*).
5. **Cash & payments**: the till cash-up, the shift history with shortages, and the *Mobile money check* ("Fill with demo statement" → *Match payments*).
6. **Purchasing**: reorder suggestions → *Create purchase orders* → open one (WhatsApp it to the supplier, receive with batch and expiry). Then show *Compare prices* and *Supplier balances*.
7. **Medicine safety**: verify *Artemether* batch `AL2409-117X`. It is flagged as suspected fake and quarantined at 3 facilities. Show *Report a problem*.
8. **Prescriptions**: the register to show an NDA inspector, and the "test before treat" rate.
9. **Sign in as `owner2@demo.firstmeds.ug`** (a drug shop): search *Amoxicillin*. It is not available, because drug shops can't sell prescription-only medicines.
10. **Sign in as `admin@firstmeds.ug`**: the network overview, quality alerts across all facilities, suppliers and claims.

## Features

**At the counter**
- Product search across the catalogue. Stock is sold first-expiry-first-out (FEFO), expired batches are blocked, and selling more than you have is refused.
- Payment by cash with change calculation, MTN MoMo or Airtel Money (transaction ID required), or card. Fully subsidised sales are supported.
- Printable receipt showing the facility's NDA licence and URA TIN, batch numbers and expiry dates. Receipts can also be shared by WhatsApp.
- Voids (pharmacist or owner, with a reason) return stock to the original batches. A sale that is already in a subsidy claim cannot be voided.
- Patient register with Ugandan phone numbers normalised to `+256…`, optional NIN and SMS consent.

**Stock**
- Receive deliveries batch by batch, with supplier, cost and selling price.
- Low-stock, out-of-stock, 90-day-expiry and expired alerts. Stock count corrections and expiry write-offs.
- Full movement history for every product. Drug shops (class C) are not given prescription-only items in the demo.

**Programmes and claims**
- Each programme has a discount percentage, an optional per-visit cap, eligible products, dates, and an "enrolment required" flag.
- Demo programmes: Malaria Test & Treat, Heart & Sugar Care (hypertension and diabetes), Mama First, Child Diarrhoea Care (ORS and zinc), and Family Planning Access.
- Owners submit monthly claims. HQ approves, pays or rejects them (submitted → approved → paid).

**Refill reminders**
- Enter "Refill in X days" at checkout, and patients appear on the reminder list when their supply runs out.
- Send an SMS through [Africa's Talking](https://africastalking.com) or log a phone call. Without API keys, SMS messages are only logged.

**Reports**
- Facility dashboard: revenue, margin, average basket, subsidies, daily chart, top medicines, payment mix and busiest hours. Sales lines export to CSV.
- HQ network view: revenue by district, a league table of facilities, programme reach, and stock-outs of essential medicines.

**Medicine safety (fake and substandard medicines)**
- Verify a medicine by barcode or name plus batch number. The app checks its registration status and any open quality alerts.
- Report a suspect batch. Suspected fakes and unregistered products are quarantined at every facility that holds that batch, and new deliveries of a flagged batch are quarantined on arrival. Quarantined stock cannot be sold.
- HQ tracks each report: investigating → reported to NDA → confirmed or cleared. Clearing a report releases the stock.

**Rules and safe dispensing**
- Drug shops can't stock, order or sell prescription-only medicines.
- Prescription-only sales need the prescriber, registration number and a prescription dated within the last 30 days. These are kept in a printable prescription register.
- Antimalarial sales record whether the patient was tested ("test before treat" rate), and dispensing advice is shown at the counter.

**Purchasing and suppliers**
- Price lists from licensed wholesalers, with side-by-side comparison.
- Reorder suggestions based on sales speed, supplier delivery time and 14 days of cover.
- Purchase orders (sent by WhatsApp) and receiving batch by batch, which refuses expired stock and quarantines flagged batches.
- Supplier credit terms, payments, balances and overdue amounts.

**Cash control**
- Each cashier opens and closes their own till. Expected and counted cash give a variance, and the owner sees every shift.
- Mobile money check: paste the MTN or Airtel statement, and payments are matched by transaction ID and amount. Unmatched or mismatched payments are flagged.

**Offline**
- The app installs on phones and works without internet. Stock, programmes and patients are cached on the device.
- Sales made offline are queued on the device and sync automatically. Each sale has its own ID, so it is never recorded twice. Sales the server refuses (for example, if stock ran out meanwhile) are kept for review.

**Health check**: one score across 11 areas: fake medicines, stock-outs, expiry, affordability, cash flow, compliance, dispensing, theft, offline readiness, supplier prices and patient retention.

**Tax receipts**: receipts are ready for URA EFRIS. In demo mode they carry a placeholder fiscal document number clearly marked "demo".

**HQ admin**
- Facilities (add, edit, suspend) and staff accounts with temporary passwords.
- Join applications from the website: approving one creates the facility and the owner's login.
- Product catalogue, programmes, and website content (news, jobs, contact messages).

All money is whole Uganda shillings. All dates and times are shown in East Africa Time (UTC+3).

## Project layout

```
server/            Express 5 API + SQLite (node:sqlite)
  src/schema.sql   database schema
  src/routes/      public, auth, products, inventory, sales, patients,
                   programs, claims, reminders, reports, admin
  src/services/    sales engine (pricing, subsidies, FEFO), SMS
  src/seed.js      catalogue, programmes and demo data
  test/            API tests
client/            React 18 + Vite
  src/site/        public website
  src/app/         pharmacy app + HQ admin (src/app/admin)
```

## Deploying

### One-click: Render (free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/huzyferuranium-collab/UraniumFx)

`render.yaml` sets up one web service that serves the website, the app and the API on a single `https://<name>.onrender.com` URL. During setup you choose the HQ admin password. Demo mode is on (demo facilities and sales are loaded, and the demo-login buttons are shown). Set `SEED_DEMO=0` and `VITE_SHOW_DEMO_LOGINS=0` when you go live.

Render's free plan has no persistent disk. The database resets whenever the service restarts or redeploys, and an idle free service goes to sleep after about 15 minutes. That is fine for a demo. For real pharmacies, use a paid instance with a persistent disk mounted at `/data`, and set `DATABASE_PATH=/data/firstmeds.db`.

### Docker

The easiest route is the Docker image, which builds the client and serves everything from one Node process:

```bash
docker build -t firstmeds .
```

```bash
docker run -p 4000:4000 -v firstmeds-data:/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_EMAIL=you@firstmeds.ug -e ADMIN_PASSWORD='a-strong-password' \
  firstmeds
```

`.env.example` lists every setting.

- In production the server refuses to start without a `JWT_SECRET` of at least 32 characters.
- On first start with an empty database, it loads the catalogue and programmes and creates the HQ admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Demo facilities are only added if `SEED_DEMO=1`.
- To show the demo-login buttons in a production build, build with `--build-arg VITE_SHOW_DEMO_LOGINS=1`.
- Keep `/data` on a persistent volume and back it up. That one file is the whole database.

## Before going live: what is a placeholder

- **Programme sponsors** are labelled "(demo)". Replace them with real partners and set real prices and eligibility.
- **NDA registration numbers** in the catalogue are placeholders (`NDA/DEMO/…`). Load the real ones from the National Drug Authority register.
- **Mobile money** references are typed in by staff. To confirm payments automatically, integrate the MTN MoMo Collections and Airtel Money APIs.
- **URA EFRIS**: receipts currently show a placeholder `DEMO…` fiscal document number. Live fiscalisation needs URA EFRIS system-to-system credentials (`EFRIS_API_URL`, `EFRIS_DEVICE_NO` and a signing key). The code hook is in `server/src/services/efris.js`.
- **Medicine verification** checks the FirstMeds catalogue and network alerts. It does not query NDA directly. Load real NDA registration numbers and product barcodes (GTINs) before relying on it. Demo barcodes start with `2000…`.
- **Mobile money matching** works from a pasted statement. To verify payments automatically, connect the MTN MoMo and Airtel Money collection APIs.
- **Supplier price lists** in the demo are invented. Collect real price lists from wholesalers.
- **Data protection**: register with the Personal Data Protection Office and review consent wording under Uganda's Data Protection and Privacy Act, 2019, before storing real patient data.

## License

MIT
