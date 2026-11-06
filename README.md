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
- **URA EFRIS** e-receipting is not connected yet. You may need it, depending on your tax obligations.
- **Data protection**: register with the Personal Data Protection Office and review consent wording under Uganda's Data Protection and Privacy Act, 2019, before storing real patient data.

## License

MIT
