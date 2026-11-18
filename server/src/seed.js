/* eslint-disable no-console */
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { openDb, DEFAULT_DB_PATH } from './db.js';
import { createSale } from './services/sales.js';
import { addDays, today } from './util.js';

export const DEMO_PASSWORD = 'demo1234';

// name, generic, strength, form, category, unit, price (UGX), essential, rx, days_supply typical
export const CATALOGUE = [
  ['Artemether-Lumefantrine', 'Artemether + Lumefantrine', '20/120mg ×24', 'tablet', 'Antimalarial', 'pack', 12000, 1, 0, 3],
  ['Malaria Rapid Diagnostic Test', 'mRDT (Pf/Pan)', '', 'test kit', 'Diagnostics', 'test', 3000, 1, 0, 0],
  ['Quinine', 'Quinine sulphate', '300mg ×10', 'tablet', 'Antimalarial', 'strip', 3000, 1, 1, 7],
  ['Paracetamol', 'Paracetamol', '500mg ×10', 'tablet', 'Pain & Fever', 'strip', 500, 1, 0, 0],
  ['Paracetamol Syrup', 'Paracetamol', '120mg/5ml 100ml', 'syrup', 'Pain & Fever', 'bottle', 3000, 1, 0, 0],
  ['Ibuprofen', 'Ibuprofen', '400mg ×10', 'tablet', 'Pain & Fever', 'strip', 1000, 1, 0, 0],
  ['Amoxicillin', 'Amoxicillin', '500mg ×10', 'capsule', 'Antibiotic', 'strip', 2500, 1, 1, 5],
  ['Amoxicillin Suspension', 'Amoxicillin', '125mg/5ml 100ml', 'suspension', 'Antibiotic', 'bottle', 4000, 1, 1, 5],
  ['Cotrimoxazole', 'Sulfamethoxazole + Trimethoprim', '480mg ×10', 'tablet', 'Antibiotic', 'strip', 1000, 1, 1, 5],
  ['Metronidazole', 'Metronidazole', '400mg ×10', 'tablet', 'Antibiotic', 'strip', 1000, 1, 1, 5],
  ['Ciprofloxacin', 'Ciprofloxacin', '500mg ×10', 'tablet', 'Antibiotic', 'strip', 3000, 1, 1, 5],
  ['Oral Rehydration Salts', 'ORS (low osmolarity)', '20.5g', 'sachet', 'Child Health', 'sachet', 500, 1, 0, 0],
  ['Zinc Sulphate Dispersible', 'Zinc sulphate', '20mg ×10', 'tablet', 'Child Health', 'strip', 1500, 1, 0, 10],
  ['ORS + Zinc Co-pack', 'ORS + Zinc', '2 sachets + 10 tabs', 'co-pack', 'Child Health', 'pack', 3000, 1, 0, 10],
  ['Metformin', 'Metformin HCl', '500mg ×10', 'tablet', 'Diabetes', 'strip', 1500, 1, 1, 5],
  ['Glibenclamide', 'Glibenclamide', '5mg ×10', 'tablet', 'Diabetes', 'strip', 1000, 1, 1, 10],
  ['Amlodipine', 'Amlodipine', '5mg ×10', 'tablet', 'Hypertension', 'strip', 2000, 1, 1, 10],
  ['Nifedipine Retard', 'Nifedipine', '20mg ×10', 'tablet', 'Hypertension', 'strip', 1500, 1, 1, 5],
  ['Hydrochlorothiazide', 'Hydrochlorothiazide', '25mg ×10', 'tablet', 'Hypertension', 'strip', 1000, 1, 1, 10],
  ['Losartan', 'Losartan potassium', '50mg ×10', 'tablet', 'Hypertension', 'strip', 3500, 1, 1, 10],
  ['Ferrous + Folic Acid', 'Ferrous sulphate + Folic acid', '200mg/0.4mg ×10', 'tablet', 'Maternal Health', 'strip', 1000, 1, 0, 10],
  ['Folic Acid', 'Folic acid', '5mg ×10', 'tablet', 'Maternal Health', 'strip', 500, 1, 0, 10],
  ['Chlorhexidine Cord Gel', 'Chlorhexidine digluconate', '7.1% 10g', 'gel', 'Maternal Health', 'tube', 3000, 1, 0, 0],
  ['Clean Delivery Kit', 'Mama kit', 'standard', 'kit', 'Maternal Health', 'kit', 25000, 1, 0, 0],
  ['Albendazole', 'Albendazole', '400mg', 'tablet', 'Deworming', 'tablet', 1000, 1, 0, 0],
  ['Mebendazole', 'Mebendazole', '500mg', 'tablet', 'Deworming', 'tablet', 500, 1, 0, 0],
  ['Salbutamol Inhaler', 'Salbutamol', '100mcg 200 doses', 'inhaler', 'Respiratory', 'inhaler', 12000, 1, 1, 30],
  ['Cough Syrup', 'Dextromethorphan + Guaifenesin', '100ml', 'syrup', 'Respiratory', 'bottle', 4000, 0, 0, 0],
  ['Cetirizine', 'Cetirizine', '10mg ×10', 'tablet', 'Allergy', 'strip', 1000, 1, 0, 0],
  ['Omeprazole', 'Omeprazole', '20mg ×10', 'capsule', 'Digestive', 'strip', 2000, 1, 1, 10],
  ['Magnesium Trisilicate', 'Magnesium trisilicate', '×10', 'tablet', 'Digestive', 'strip', 1000, 1, 0, 0],
  ['Vitamin C', 'Ascorbic acid', '100mg ×10', 'tablet', 'Vitamins', 'strip', 500, 0, 0, 0],
  ['Multivitamin Syrup', 'Multivitamin', '100ml', 'syrup', 'Vitamins', 'bottle', 5000, 0, 0, 0],
  ['Male Condoms', 'Latex condoms', '×3', 'pack', 'Family Planning', 'pack', 1000, 1, 0, 0],
  ['Combined Oral Contraceptive', 'Levonorgestrel + Ethinylestradiol', '1 cycle', 'tablet', 'Family Planning', 'cycle', 1500, 1, 0, 28],
  ['Emergency Contraceptive', 'Levonorgestrel', '1.5mg', 'tablet', 'Family Planning', 'tablet', 5000, 1, 0, 0],
  ['DMPA Injection', 'Medroxyprogesterone acetate', '150mg/ml', 'injection', 'Family Planning', 'vial', 5000, 1, 1, 90],
  ['Blood Glucose Test Strip', 'Glucose test strip', '', 'test kit', 'Diagnostics', 'strip', 2000, 0, 0, 0],
  ['HIV Self-Test Kit', 'Oral HIV self-test', '', 'test kit', 'Diagnostics', 'kit', 10000, 1, 0, 0],
  ['Examination Gloves', 'Nitrile gloves', '1 pair', 'pair', 'Supplies', 'pair', 500, 0, 0, 0],
];

// Dispensing advice shown at the counter.
const COUNSELLING = {
  'Artemether-Lumefantrine': 'Confirm malaria with a test first. Take with food or milk, twice a day for 3 days, and finish all 24 tablets.',
  'Quinine': 'For confirmed malaria only. Can cause ringing in the ears; take with food. Finish the full 7-day course.',
  'Amoxicillin': 'Antibiotic: finish the whole course even if feeling better. Ask about penicillin allergy before dispensing.',
  'Amoxicillin Suspension': 'Antibiotic: shake well, keep in a cool place, finish the course. Check the child\'s weight for the dose.',
  'Cotrimoxazole': 'Antibiotic: drink plenty of water. Ask about sulfa allergy and pregnancy.',
  'Metronidazole': 'No alcohol during the course and for 48 hours after. Take after food.',
  'Ciprofloxacin': 'Antibiotic: not for children or pregnant women. Do not take with milk or antacids.',
  'Metformin': 'Take with meals. Check blood sugar regularly; return for refill before the tablets run out.',
  'Amlodipine': 'Take once a day at the same time. Do not stop suddenly. Check blood pressure monthly.',
  'Losartan': 'Not for pregnant women. Check blood pressure monthly.',
  'Oral Rehydration Salts': 'Mix one sachet in 1 litre of clean water. Give small sips often; continue breastfeeding.',
  'Zinc Sulphate Dispersible': 'Give for 10 days even after diarrhoea stops: half a tablet under 6 months, one tablet from 6 months.',
  'ORS + Zinc Co-pack': 'Give ORS after every loose stool and zinc once a day for 10 days.',
  'Emergency Contraceptive': 'Take as soon as possible, within 72 hours. Not for regular contraception.',
  'DMPA Injection': 'Next injection due in 3 months (13 weeks). Record the return date on the client card.',
  'Salbutamol Inhaler': 'Shake before use; show the patient how to use a spacer. Seek care if needed more than twice a week.',
  'Ferrous + Folic Acid': 'One tablet a day throughout pregnancy. May darken stool; take with orange juice, not tea.',
};
const ANTIBIOTICS = ['Amoxicillin', 'Amoxicillin Suspension', 'Cotrimoxazole', 'Metronidazole', 'Ciprofloxacin'];

const SUPPLIERS = [
  // name, district, lead days, payment terms (days), price factor vs. reference cost, rating
  ['Joint Medical Store', 'Kampala', 4, 30, 0.97, 4.6],
  ['Kampala Pharma Wholesalers', 'Kampala', 1, 0, 1.06, 4.1],
  ['Abacus Distributors', 'Wakiso', 2, 14, 1.0, 4.3],
  ['Unity Medical Supplies', 'Mbarara', 3, 7, 0.94, 3.9],
  ['Northern Pharma Traders', 'Gulu', 2, 0, 1.1, 3.6],
];

const PRESCRIBERS = [
  ['Dr. Agnes Namutebi', 'UMDPC/DEMO/1041'], ['Dr. Patrick Okot', 'UMDPC/DEMO/2207'], ['Dr. Brenda Tumwine', 'UMDPC/DEMO/3318'],
  ['Clin. Off. Isaac Wafula', 'AHPC/DEMO/0874'], ['Dr. Moses Kiggundu', 'UMDPC/DEMO/1765'], ['Clin. Off. Grace Atim', 'AHPC/DEMO/1123'],
];
const RX_FACILITY = {
  Kampala: 'Kiruddu Hospital', Wakiso: 'Kireka HC III', Mukono: 'Mukono HC IV', Jinja: 'Jinja RRH', Gulu: 'Gulu RRH',
  Mbarara: 'Mbarara RRH', Lira: 'Lira RRH', Mbale: 'Mbale RRH', Entebbe: 'Entebbe RRH', Masaka: 'Masaka RRH',
};

const PROGRAMS = [
  {
    code: 'MALARIA', name: 'Malaria Test & Treat', sponsor: 'Malaria partner fund (demo)', discount_percent: 50, max: 0, enroll: 0,
    description: 'Half-price malaria rapid tests and quality-assured ACTs so every fever is tested before it is treated.',
    products: ['Malaria Rapid Diagnostic Test', 'Artemether-Lumefantrine'],
  },
  {
    code: 'HEART', name: 'Heart & Sugar Care', sponsor: 'NCD partner fund (demo)', discount_percent: 30, max: 20000, enroll: 1,
    description: 'Lower-cost monthly refills, glucose checks and SMS reminders for people living with hypertension or diabetes.',
    products: ['Metformin', 'Glibenclamide', 'Amlodipine', 'Nifedipine Retard', 'Hydrochlorothiazide', 'Losartan', 'Blood Glucose Test Strip'],
  },
  {
    code: 'MAMA', name: 'Mama First', sponsor: 'Maternal health partner (demo)', discount_percent: 100, max: 30000, enroll: 1,
    description: 'Free iron-folic acid, clean delivery kits and cord-care gel for registered pregnant women.',
    products: ['Ferrous + Folic Acid', 'Folic Acid', 'Clean Delivery Kit', 'Chlorhexidine Cord Gel'],
  },
  {
    code: 'CHILD', name: 'Child Diarrhoea Care', sponsor: 'Child health partner (demo)', discount_percent: 100, max: 10000, enroll: 0,
    description: 'Free ORS and zinc for children under five with diarrhoea — the treatment WHO recommends.',
    products: ['Oral Rehydration Salts', 'Zinc Sulphate Dispersible', 'ORS + Zinc Co-pack'],
  },
  {
    code: 'FP', name: 'Family Planning Access', sponsor: 'Reproductive health partner (demo)', discount_percent: 50, max: 0, enroll: 0,
    description: 'Affordable, private access to contraception at your neighbourhood pharmacy.',
    products: ['Male Condoms', 'Combined Oral Contraceptive', 'Emergency Contraceptive', 'DMPA Injection'],
  },
];

const PHARMACIES = [
  ['Nakawa Community Pharmacy', 'pharmacy', 'Kampala', 'Nakawa', 'Plot 14, Jinja Road', '+256772100201'],
  ['Kireka Care Drug Shop', 'drug_shop', 'Wakiso', 'Kireka', 'Kireka Trading Centre', '+256752100202'],
  ['Mukono Family Pharmacy', 'pharmacy', 'Mukono', 'Mukono Town', 'Kauga Road', '+256782100203'],
  ['Jinja Riverside Pharmacy', 'pharmacy', 'Jinja', 'Jinja City', 'Main Street', '+256702100204'],
  ['Gulu Hope Pharmacy', 'pharmacy', 'Gulu', 'Gulu City', 'Awich Road', '+256772100205'],
  ['Mbarara Wellness Pharmacy', 'pharmacy', 'Mbarara', 'Mbarara City', 'High Street', '+256782100206'],
  ['Lira Town Clinic', 'clinic', 'Lira', 'Lira City', 'Obote Avenue', '+256752100207'],
  ['Elgon View Drug Shop', 'drug_shop', 'Mbale', 'Mbale City', 'Republic Street', '+256702100208'],
  ['Lakeside Pharmacy Entebbe', 'pharmacy', 'Entebbe', 'Kitooro', 'Kitooro Road', '+256772100209'],
  ['Masaka Unity Clinic', 'clinic', 'Masaka', 'Nyendo', 'Nyendo Road', '+256782100210'],
];

const FIRST = ['Sarah', 'Grace', 'Joseph', 'Moses', 'Esther', 'Peter', 'Ruth', 'Brian', 'Patience', 'Ivan', 'Agnes', 'Denis', 'Florence',
  'Samuel', 'Mercy', 'Isaac', 'Juliet', 'Ronald', 'Doreen', 'Emmanuel', 'Annet', 'Robert', 'Prossy', 'Fred', 'Harriet', 'Allan',
  'Winnie', 'Godfrey', 'Sylvia', 'Martin', 'Josephine', 'Paul', 'Rebecca', 'Hassan', 'Aisha', 'Brenda', 'Julius', 'Lydia'];
const LAST = ['Nakato', 'Okello', 'Mugisha', 'Namubiru', 'Opio', 'Atim', 'Byaruhanga', 'Nansubuga', 'Kato', 'Akello', 'Tumusiime',
  'Nalwoga', 'Ssempala', 'Mukasa', 'Auma', 'Kiggundu', 'Asiimwe', 'Namazzi', 'Odongo', 'Ninsiima', 'Lubega', 'Apio', 'Wasswa',
  'Babirye', 'Ojok', 'Nabirye', 'Tumwine', 'Achan', 'Kintu', 'Nakimuli'];

// Deterministic PRNG so the demo looks the same every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed catalogue + programs (always) and, when demo=true, facilities, staff, stock and sales history. */
export function seed(db, { demo = true, days = 90, adminEmail = 'admin@firstmeds.ug', adminPassword = DEMO_PASSWORD, quiet = false } = {}) {
  log = quiet ? () => {} : console.log;
  const rand = rng(256);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const hash = (pw) => bcrypt.hashSync(pw, 8);

  const products = {};
  db.tx(() => {
    for (const [name, generic, strength, form, category, unit, price, ess, rx, days_] of CATALOGUE) {
      const { id } = db.run(
        `INSERT INTO products (name, generic_name, strength, form, category, unit, default_price, is_essential, requires_prescription, nda_reg_no)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        name, generic, strength, form, category, unit, price, ess, rx, `NDA/DEMO/${String(Object.keys(products).length + 1).padStart(4, '0')}`,
      );
      products[name] = { id, price, days: days_, category, rx };
      db.run('UPDATE products SET barcode = ?, counselling = ?, antibiotic = ? WHERE id = ?',
        `2000${String(id).padStart(8, '0')}${(id * 7) % 10}`, COUNSELLING[name] || null, ANTIBIOTICS.includes(name) ? 1 : 0, id);
    }
    // One product without an NDA registration number, to show the "unverified" warning.
    db.run("UPDATE products SET nda_status = 'unverified', nda_reg_no = NULL WHERE name = 'Multivitamin Syrup'");
    const start = addDays(today(), -days - 30);
    for (const p of PROGRAMS) {
      const { id } = db.run(
        `INSERT INTO programs (code, name, description, sponsor, discount_percent, max_subsidy_per_visit, requires_enrollment, start_date)
         VALUES (?,?,?,?,?,?,?,?)`,
        p.code, p.name, p.description, p.sponsor, p.discount_percent, p.max, p.enroll, start,
      );
      p.id = id;
      for (const name of p.products) db.run('INSERT INTO program_products (program_id, product_id) VALUES (?,?)', id, products[name].id);
    }
    db.run("INSERT INTO users (name, email, password_hash, role) VALUES ('FirstMeds HQ Admin', ?, ?, 'admin')", adminEmail, hash(adminPassword));
  });
  log(`  catalogue: ${CATALOGUE.length} products, ${PROGRAMS.length} programs`);

  if (!demo) return;

  // Website content
  const posts = [
    ['firstmeds-launches-in-uganda', 'FirstMeds launches its pharmacy network in Uganda', 'Launch',
      'We are starting with neighbourhood pharmacies, drug shops and clinics in ten districts.',
      'FirstMeds is live in Uganda.\n\nOur first partners are independent pharmacies, drug shops and clinics in Kampala, Wakiso, Mukono, Entebbe, Jinja, Mbale, Gulu, Lira, Mbarara and Masaka. Each one now runs on the FirstMeds point-of-sale app: every sale, batch and expiry date is recorded, and patients can join subsidy programmes right at the counter.\n\nOver the next year we will grow to more districts and add more programmes with partners who share our goal: quality, affordable medicines within walking distance of every Ugandan.'],
    ['test-before-you-treat', 'Test before you treat: half-price malaria tests at the counter', 'Programmes',
      'Our Malaria Test & Treat programme makes rapid tests and ACTs 50% cheaper.',
      'Most people with a fever in Uganda first visit a pharmacy or drug shop, not a health centre. That makes the counter the best place to make sure malaria is confirmed before it is treated.\n\nWith Malaria Test & Treat, partner pharmacies offer rapid diagnostic tests and quality-assured artemether-lumefantrine at half price. The subsidy is applied automatically at checkout, and each pharmacy is reimbursed monthly through the FirstMeds claims process.'],
    ['refill-reminders-by-sms', 'Never miss a refill: SMS reminders for chronic care', 'Product',
      'Patients on Heart & Sugar Care now get an SMS when it is time to refill.',
      'Running out of blood pressure or diabetes medicine is one of the biggest risks for people living with chronic conditions.\n\nFirstMeds now tracks how many days of medicine each patient takes home, and shows pharmacists a daily list of patients due for a refill. With one tap the pharmacy can send a friendly SMS reminder — or log a phone call — so patients stay on treatment.'],
  ];
  posts.forEach(([slug, title, category, excerpt, body], i) => db.run(
    "INSERT INTO news_posts (slug, title, category, excerpt, body, published_at) VALUES (?,?,?,?,?, datetime('now', ?))",
    slug, title, category, excerpt, body, `-${(posts.length - i) * 9} days`,
  ));
  const jobs = [
    ['Pharmacy Network Associate', 'Operations', 'Kampala', 'Full-time', 'Recruit, onboard and support partner pharmacies across the Central region. You will train pharmacy staff on the FirstMeds app, run monthly visits and make sure stock and claims data are accurate.\n\nYou have a diploma or degree in pharmacy or a related field, a valid riding/driving permit and excellent Luganda and English.'],
    ['Software Engineer (Full-stack)', 'Technology', 'Kampala / Remote (Uganda)', 'Full-time', 'Build the FirstMeds point-of-sale, programme and data tools used every day by pharmacists. Our stack is JavaScript end to end (React, Node.js, SQL).\n\nYou care about software that works on low-end Android phones and patchy networks.'],
    ['Field Data Officer', 'Data & Impact', 'Gulu', 'Contract', 'Work with pharmacies in the Northern region to improve data quality, collect patient feedback and support programme evaluations.'],
  ];
  for (const j of jobs) db.run('INSERT INTO jobs (title, department, location, employment_type, description, apply_email) VALUES (?,?,?,?,?,?)', ...j, 'careers@firstmeds.ug');
  db.run("INSERT INTO applications (facility_name, type, owner_name, phone, district, town, nda_license, message) VALUES ('Kasese Mountain Pharmacy','pharmacy','Joseph Bwambale','+256772555111','Kasese','Kasese Town','NDA/DEMO/RP/0991','We serve many patients with hypertension and would like to join Heart & Sugar Care.')");
  db.run("INSERT INTO contact_messages (name, email, subject, message) VALUES ('Agnes Nakimuli','agnes@example.com','Partnership','Our NGO supports maternal health in Masaka. Can we co-fund Mama First?')");

  // Facilities, staff, stock
  const pharmacies = [];
  const pwHash = hash(DEMO_PASSWORD);
  db.tx(() => {
    PHARMACIES.forEach(([name, type, district, town, address, phone], i) => {
      const n = i + 1;
      const owner = `${pick(FIRST)} ${pick(LAST)}`;
      const { id } = db.run(
        'INSERT INTO pharmacies (name, type, district, town, address, phone, email, nda_license, tin, owner_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?, datetime(\'now\', ?))',
        name, type, district, town, address, phone, `pharmacy${n}@demo.firstmeds.ug`, `NDA/DEMO/RP/${1000 + n}`, `10000${String(n).padStart(5, '0')}`, owner,
        `-${days + 20 - i} days`,
      );
      const insUser = (uname, email, role) => db.run(
        'INSERT INTO users (name, email, phone, password_hash, role, pharmacy_id) VALUES (?,?,?,?,?,?)',
        uname, email, `+25677${String(3000000 + n * 10 + role.length).padStart(7, '0')}`, pwHash, role, id,
      ).id;
      const ownerId = insUser(owner, `owner${n}@demo.firstmeds.ug`, 'owner');
      const pharmacistId = insUser(`${pick(FIRST)} ${pick(LAST)}`, `pharmacist${n}@demo.firstmeds.ug`, 'pharmacist');
      const cashierId = insUser(`${pick(FIRST)} ${pick(LAST)}`, `cashier${n}@demo.firstmeds.ug`, 'cashier');
      pharmacies.push({ id, n, staff: [ownerId, pharmacistId, cashierId], size: type === 'drug_shop' ? 0.6 : type === 'clinic' ? 0.8 : 1 });

      for (const [pname, p] of Object.entries(products)) {
        // Drug shops (class C) do not stock prescription-only medicines.
        if (type === 'drug_shop' && p.rx) continue;
        // Local price variation ±10%, rounded to 100 UGX.
        const price = Math.round((p.price * (0.9 + rand() * 0.2)) / 100) * 100;
        db.run('INSERT INTO pharmacy_products (pharmacy_id, product_id, price, reorder_level) VALUES (?,?,?,?)', id, p.id, price, between(5, 20));
        const fast = ['Paracetamol', 'Artemether-Lumefantrine', 'Malaria Rapid Diagnostic Test', 'Oral Rehydration Salts', 'Amoxicillin'].includes(pname);
        const batches = between(1, 3);
        for (let b = 0; b < batches; b++) {
          const qty = Math.round(between(fast ? 250 : 60, fast ? 600 : 220) * pharmacies.at(-1).size);
          const exp = addDays(today(), between(b === 0 ? 20 : 120, 720));
          const cost = Math.round((p.price * (0.55 + rand() * 0.15)) / 50) * 50;
          const batch = db.run(
            "INSERT INTO inventory_batches (pharmacy_id, product_id, batch_no, expiry_date, quantity, cost_price, supplier, received_at) VALUES (?,?,?,?,?,?,?, datetime('now', ?))",
            id, p.id, `B${n}${p.id}${b}${between(100, 999)}`, exp, qty, cost, pick(['Joint Medical Store', 'Kampala Pharma Wholesalers', 'Abacus Distributors', 'Unity Medical Supplies']),
            `-${days + 5} days`,
          );
          db.run(
            "INSERT INTO stock_movements (pharmacy_id, product_id, batch_id, type, quantity, reason, user_id, created_at) VALUES (?,?,?,'receive',?,?,?, datetime('now', ?))",
            id, p.id, batch.id, qty, 'Opening stock', ownerId, `-${days + 5} days`,
          );
        }
      }
      // A couple of expired batches waiting to be written off.
      const expiredProduct = products['Cough Syrup'];
      db.run(
        "INSERT INTO inventory_batches (pharmacy_id, product_id, batch_no, expiry_date, quantity, cost_price, supplier, received_at) VALUES (?,?,?,?,?,?,?, datetime('now','-300 days'))",
        id, expiredProduct.id, `EXP${n}01`, addDays(today(), -between(3, 40)), between(3, 12), 2400, 'Abacus Distributors',
      );
    });
  });
  db.run("UPDATE pharmacies SET efris_enabled = 1 WHERE type = 'pharmacy'");
  log(`  facilities: ${pharmacies.length} with staff and opening stock`);

  // Patients and enrollments
  const patientsBy = new Map();
  const programBy = Object.fromEntries(PROGRAMS.map((p) => [p.code, p]));
  db.tx(() => {
    for (const ph of pharmacies) {
      const list = [];
      const district = PHARMACIES[ph.n - 1][2];
      const count = Math.round(between(45, 70) * ph.size);
      for (let i = 0; i < count; i++) {
        const sex = rand() < 0.6 ? 'F' : 'M';
        const dob = addDays(today(), -between(365 * 1, 365 * 75));
        const phone = rand() < 0.85 ? `+256${pick(['77', '78', '76', '70', '75', '74'])}${String(between(1000000, 9999999))}` : null;
        const { id } = db.run(
          "INSERT INTO patients (pharmacy_id, name, phone, sex, dob, district, created_at) VALUES (?,?,?,?,?,?, datetime('now', ?))",
          ph.id, `${pick(FIRST)} ${pick(LAST)}`, phone, sex, dob, district, `-${between(days, days + 30)} days`,
        );
        const age = (Date.now() - Date.parse(dob)) / (365.25 * 864e5);
        const pt = { id, sex, age, programs: [] };
        if (age > 35 && rand() < 0.45) pt.programs.push('HEART');
        if (sex === 'F' && age > 18 && age < 40 && rand() < 0.3) pt.programs.push('MAMA');
        for (const code of pt.programs) {
          db.run("INSERT INTO enrollments (program_id, patient_id, enrolled_by, enrolled_at) VALUES (?,?,?, datetime('now', ?))",
            programBy[code].id, id, ph.staff[1], `-${between(days - 10, days + 20)} days`);
        }
        list.push(pt);
      }
      patientsBy.set(ph.id, list);
    }
  });

  // Sales history
  const baskets = [
    { w: 18, items: [['Malaria Rapid Diagnostic Test', 1], ['Artemether-Lumefantrine', 1], ['Paracetamol', 1]], program: 'MALARIA' },
    { w: 8, items: [['Malaria Rapid Diagnostic Test', 1], ['Paracetamol', 1]], program: 'MALARIA' },
    { w: 5, items: [['Artemether-Lumefantrine', 1], ['Paracetamol', 1]], program: 'MALARIA', actOnly: true },
    { w: 16, items: [['Paracetamol', 2]] },
    { w: 7, items: [['Ibuprofen', 1], ['Magnesium Trisilicate', 1]] },
    { w: 9, items: [['Amoxicillin', 2], ['Paracetamol', 1]] },
    { w: 5, items: [['Amoxicillin Suspension', 1], ['Paracetamol Syrup', 1]] },
    { w: 6, items: [['ORS + Zinc Co-pack', 1]], program: 'CHILD', child: true },
    { w: 4, items: [['Oral Rehydration Salts', 3], ['Zinc Sulphate Dispersible', 1]], program: 'CHILD', child: true },
    { w: 10, items: [['Amlodipine', 3], ['Hydrochlorothiazide', 3]], program: 'HEART', chronic: true },
    { w: 7, items: [['Metformin', 6], ['Blood Glucose Test Strip', 1]], program: 'HEART', chronic: true },
    { w: 5, items: [['Ferrous + Folic Acid', 3]], program: 'MAMA', mama: true },
    { w: 2, items: [['Clean Delivery Kit', 1], ['Chlorhexidine Cord Gel', 1]], program: 'MAMA', mama: true },
    { w: 6, items: [['Male Condoms', 2]], program: 'FP' },
    { w: 3, items: [['Combined Oral Contraceptive', 3]], program: 'FP' },
    { w: 2, items: [['Emergency Contraceptive', 1]], program: 'FP' },
    { w: 4, items: [['Cotrimoxazole', 1], ['Vitamin C', 1]] },
    { w: 4, items: [['Cough Syrup', 1], ['Cetirizine', 1]] },
    { w: 3, items: [['Albendazole', 2]] },
    { w: 3, items: [['Omeprazole', 2]] },
    { w: 2, items: [['Salbutamol Inhaler', 1]] },
    { w: 2, items: [['HIV Self-Test Kit', 1]] },
    { w: 3, items: [['Multivitamin Syrup', 1]] },
    { w: 2, items: [['Metronidazole', 2], ['Ciprofloxacin', 1]] },
  ];
  const totalW = baskets.reduce((a, b) => a + b.w, 0);
  const pickBasket = () => { let x = rand() * totalW; for (const b of baskets) { x -= b.w; if (x <= 0) return b; } return baskets[0]; };
  const methods = [['cash', 55], ['mtn_momo', 28], ['airtel_money', 14], ['card', 3]];
  const pickMethod = () => { let x = rand() * 100; for (const [m, w] of methods) { x -= w; if (x <= 0) return m; } return 'cash'; };
  const pad = (n) => String(n).padStart(2, '0');

  let count = 0;
  for (let d = days; d >= 0; d--) {
    const date = addDays(today(), -d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const growth = 0.75 + 0.5 * ((days - d) / days); // network grows over time
    db.tx(() => {
      for (const ph of pharmacies) {
        const pts = patientsBy.get(ph.id);
        const user = { id: pick(ph.staff), role: 'pharmacist' };
        const n = Math.round(between(6, 16) * ph.size * growth * (dow === 0 ? 0.5 : 1) * (d === 0 ? 0.4 : 1));
        for (let i = 0; i < n; i++) {
          const basket = pickBasket();
          const items = basket.items.filter(([name]) => products[name] && (ph.size !== 0.6 || !products[name].rx));
          if (!items.length) continue;
          let patient = null;
          let program = null;
          if (basket.chronic) patient = pick(pts.filter((p) => p.programs.includes('HEART')));
          else if (basket.mama) patient = pick(pts.filter((p) => p.programs.includes('MAMA')));
          else if (rand() < (basket.program ? 0.8 : 0.3)) patient = pick(pts);
          if (basket.program && patient !== undefined) {
            const prog = programBy[basket.program];
            if (!prog.enroll || patient?.programs.includes(basket.program)) program = prog;
            if (prog.enroll && !patient) program = null;
          }
          if (patient === undefined) patient = null;
          const hourEat = between(7, 20);
          const createdAt = `${date} ${pad(hourEat - 3)}:${pad(between(0, 59))}:${pad(between(0, 59))}`; // stored in UTC
          const method = pickMethod();
          const needsRx = items.some(([name]) => products[name].rx);
          const district = PHARMACIES[ph.n - 1][2];
          const [prescriber, regNo] = pick(PRESCRIBERS);
          const prescription = needsRx ? {
            prescriber_name: prescriber, prescriber_reg_no: regNo, prescriber_facility: RX_FACILITY[district],
            rx_date: addDays(date, -(basket.chronic ? between(0, 25) : between(0, 2))),
            diagnosis: basket.chronic ? 'Hypertension / diabetes follow-up' : null,
          } : undefined;
          const malaria_test = basket.actOnly ? (rand() < 0.7 ? 'tested_elsewhere' : 'not_tested') : undefined;
          try {
            const sale = createSale(db, {
              pharmacyId: ph.id,
              user,
              createdAt,
              body: {
                patient_id: patient?.id,
                program_id: program?.id,
                payment_method: method,
                payment_ref: method.includes('_') ? `${method === 'mtn_momo' ? 'MP' : 'AM'}${between(10000000, 99999999)}` : null,
                prescription,
                malaria_test,
                items: items.map(([name, qty]) => ({ product_id: products[name].id, quantity: qty, days_supply: basket.chronic || basket.mama ? 30 : 0 })),
              },
            });
            if (sale.total === 0) db.run("UPDATE sales SET payment_method = 'program', payment_ref = NULL WHERE id = ?", sale.id);
            count++;
          } catch (e) {
            if (e.status !== 409) throw e; // out of stock: skip, like a real lost sale
          }
        }
      }
    });
  }
  log(`  sales: ${count} over ${days + 1} days`);
  seedOperations(db, { pharmacies, products, rand, pick, between, days });

  // Claims for previous full month(s): one paid, one submitted.
  const months = db.all("SELECT DISTINCT strftime('%Y-%m', created_at, '+3 hours') AS m FROM sales ORDER BY m").map((r) => r.m);
  const thisMonth = today().slice(0, 7);
  const past = months.filter((m) => m < thisMonth);
  db.tx(() => {
    past.forEach((period, idx) => {
      for (const ph of pharmacies) {
        const rows = db.all(
          `SELECT program_id, COUNT(*) c, SUM(subsidy_total) a FROM sales
            WHERE pharmacy_id = ? AND voided = 0 AND subsidy_total > 0 AND strftime('%Y-%m', created_at, '+3 hours') = ? GROUP BY program_id`,
          ph.id, period,
        );
        for (const r of rows) {
          const latest = idx === past.length - 1;
          db.run(
            `INSERT INTO claims (pharmacy_id, program_id, period, amount, sales_count, status, submitted_by, submitted_at, decided_at)
             VALUES (?,?,?,?,?,?,?, datetime('now', ?), ${latest ? 'NULL' : "datetime('now', '-3 days')"})`,
            ph.id, r.program_id, period, r.a, r.c, latest ? 'submitted' : 'paid', ph.staff[0], latest ? '-2 days' : '-20 days',
          );
        }
      }
    });
  });
  log(`  claims: ${past.length} month(s)`);
}

/** Suppliers, purchase orders, cash-up shifts, mobile money checks, quality alerts and offline sales. */
function seedOperations(db, { pharmacies, products, rand, pick, between }) {
  const t = today();
  db.tx(() => {
    // Suppliers and their price lists (cost to the pharmacy per selling unit).
    const suppliers = SUPPLIERS.map(([name, district, lead, terms, factor, rating]) => {
      const { id } = db.run(
        'INSERT INTO suppliers (name, phone, district, nda_license, lead_time_days, payment_terms_days, rating) VALUES (?,?,?,?,?,?,?)',
        name, `+25641${String(4000000 + Math.floor(rand() * 999999)).slice(0, 7)}`, district, `NDA/DEMO/WS/${200 + Math.floor(rand() * 700)}`, lead, terms, rating,
      );
      for (const p of Object.values(products)) {
        if (rand() < 0.12) continue; // not every wholesaler carries everything
        const price = Math.max(50, Math.round((p.price * 0.62 * factor * (0.92 + rand() * 0.16)) / 50) * 50);
        db.run('INSERT INTO supplier_prices (supplier_id, product_id, price, in_stock) VALUES (?,?,?,?)', id, p.id, price, rand() < 0.93 ? 1 : 0);
      }
      return { id, name, terms };
    });

    // Purchase orders: two received (one fully paid, one with a balance), one sent and awaiting delivery.
    for (const ph of pharmacies) {
      const type = db.get('SELECT type FROM pharmacies WHERE id = ?', ph.id).type;
      const pool = Object.entries(products).filter(([, p]) => !(type === 'drug_shop' && p.rx));
      [[45, 'paid'], [12, 'balance'], [2, 'sent']].forEach(([ago, kind], k) => {
        const sup = suppliers[(ph.n + k) % suppliers.length];
        const d = addDays(t, -ago);
        const poNo = `PO${ph.id}-${d.replaceAll('-', '').slice(2)}-00${k + 1}`;
        const po = db.run(
          "INSERT INTO purchase_orders (pharmacy_id, supplier_id, po_no, status, created_by, created_at, sent_at) VALUES (?,?,?,?,?, datetime(?, '+6 hours'), datetime(?, '+7 hours'))",
          ph.id, sup.id, poNo, kind === 'sent' ? 'sent' : 'received', ph.staff[0], d, d,
        );
        let total = 0;
        for (let i = 0; i < between(4, 7); i++) {
          const [, p] = pick(pool);
          if (db.get('SELECT 1 FROM po_items WHERE po_id = ? AND product_id = ?', po.id, p.id)) continue;
          const offer = db.get('SELECT price FROM supplier_prices WHERE supplier_id = ? AND product_id = ?', sup.id, p.id);
          const cost = offer?.price ?? Math.round(p.price * 0.65);
          const qty = between(2, 10) * 10;
          db.run('INSERT INTO po_items (po_id, product_id, quantity, unit_cost, received_qty) VALUES (?,?,?,?,?)', po.id, p.id, qty, cost, kind === 'sent' ? 0 : qty);
          total += qty * cost;
          if (kind !== 'sent') {
            const b = db.run(
              "INSERT INTO inventory_batches (pharmacy_id, product_id, batch_no, expiry_date, quantity, cost_price, supplier, po_id, received_at) VALUES (?,?,?,?,?,?,?,?, datetime(?, '+9 hours'))",
              ph.id, p.id, `${poNo.slice(-3)}${p.id}${between(1000, 9999)}`, addDays(t, between(200, 700)), qty, cost, sup.name, po.id, addDays(d, 1),
            );
            db.run(
              "INSERT INTO stock_movements (pharmacy_id, product_id, batch_id, type, quantity, reason, user_id, created_at) VALUES (?,?,?,'receive',?,?,?, datetime(?, '+9 hours'))",
              ph.id, p.id, b.id, qty, `${poNo} from ${sup.name}`, ph.staff[1], addDays(d, 1),
            );
          }
        }
        if (kind === 'sent') {
          db.run('UPDATE purchase_orders SET total = ? WHERE id = ?', total, po.id);
          return;
        }
        const due = addDays(addDays(d, 1), sup.terms);
        const paid = kind === 'paid' ? total : Math.round((total * (ph.n % 3 === 0 ? 0 : 0.4)) / 1000) * 1000;
        db.run("UPDATE purchase_orders SET total = ?, paid = ?, received_at = datetime(?, '+9 hours'), due_date = ? WHERE id = ?", total, paid, addDays(d, 1), due, po.id);
        if (paid) db.run("INSERT INTO supplier_payments (po_id, amount, method, user_id, created_at) VALUES (?,?,?,?, datetime(?, '+10 hours'))", po.id, paid, 'mtn_momo', ph.staff[0], addDays(d, 2));
      });
    }

    // Closed till shifts for the last 30 days, built from each cashier's actual sales that day.
    const rows = db.all(
      `SELECT pharmacy_id, user_id, date(created_at, '+3 hours') AS day, MIN(created_at) AS first, MAX(created_at) AS last,
              COUNT(*) AS n, SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) AS cash,
              SUM(CASE WHEN payment_method = 'mtn_momo' THEN total ELSE 0 END) AS momo,
              SUM(CASE WHEN payment_method = 'airtel_money' THEN total ELSE 0 END) AS airtel
         FROM sales WHERE voided = 0 AND date(created_at, '+3 hours') BETWEEN ? AND ?
        GROUP BY pharmacy_id, user_id, day`,
      addDays(t, -30), addDays(t, -1),
    );
    for (const r of rows) {
      const float = 50000;
      const expected = float + r.cash;
      // Mostly exact, small rounding differences sometimes; one facility has a recurring shortage to show the alert.
      let variance = rand() < 0.75 ? 0 : -Math.round(between(1, 10)) * 100;
      if (r.pharmacy_id === pharmacies[6].id && rand() < 0.35) variance = -between(5, 25) * 1000;
      const sh = db.run(
        `INSERT INTO shifts (pharmacy_id, user_id, opening_float, opened_at, closed_at, expected_cash, counted_cash, variance, momo_total, airtel_total, sales_count, status, notes)
         VALUES (?,?,?, datetime(?, '-20 minutes'), datetime(?, '+15 minutes'), ?,?,?,?,?,?, 'closed', ?)`,
        r.pharmacy_id, r.user_id, float, r.first, r.last, expected, expected + variance, variance, r.momo, r.airtel, r.n,
        variance < -4000 ? 'Shortage — owner to follow up' : null,
      );
      db.run(
        "UPDATE sales SET shift_id = ? WHERE pharmacy_id = ? AND user_id = ? AND date(created_at, '+3 hours') = ?",
        sh.id, r.pharmacy_id, r.user_id, r.day,
      );
    }
    // Today's open shift for the facility-1 demo staff.
    for (const uid of pharmacies[0].staff.slice(1)) {
      db.run("INSERT INTO shifts (pharmacy_id, user_id, opening_float, opened_at) VALUES (?,?,50000, datetime('now', 'start of day', '+5 hours'))", pharmacies[0].id, uid);
    }
    const open = db.all("SELECT id, user_id FROM shifts WHERE status = 'open'");
    for (const o of open) db.run("UPDATE sales SET shift_id = ? WHERE user_id = ? AND created_at >= datetime('now', 'start of day', '+5 hours')", o.id, o.user_id);

    // Make a few fast sellers run low at each facility so reorder suggestions have something to show.
    for (const ph of pharmacies) {
      const fast = db.all(
        `SELECT si.product_id, SUM(si.quantity) / 30.0 AS per_day FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE s.pharmacy_id = ? AND s.voided = 0 AND s.created_at >= datetime('now','-30 days')
          GROUP BY si.product_id ORDER BY per_day DESC LIMIT 12`, ph.id,
      );
      for (const f of fast.filter((_, i) => i % 3 === 1).slice(0, 4)) {
        const keep = Math.max(1, Math.round(f.per_day * between(1, 4)));
        const batches = db.all('SELECT id, quantity FROM inventory_batches WHERE pharmacy_id = ? AND product_id = ? AND quantity > 0 AND quarantined = 0 ORDER BY expiry_date', ph.id, f.product_id);
        let left = keep;
        for (const b of batches) {
          const newQ = Math.min(b.quantity, left);
          left -= newQ;
          if (newQ !== b.quantity) {
            db.run('UPDATE inventory_batches SET quantity = ? WHERE id = ?', newQ, b.id);
            db.run("INSERT INTO stock_movements (pharmacy_id, product_id, batch_id, type, quantity, reason, user_id, created_at) VALUES (?,?,?,'adjust',?,?,?, datetime('now','-1 days'))",
              ph.id, f.product_id, b.id, newQ - b.quantity, 'Stock count: damaged / returned to supplier', ph.staff[0]);
          }
        }
      }
    }

    // Mobile money: older payments matched to the statement; the last 3 days still to reconcile; a few never arrived.
    db.run(`UPDATE sales SET payment_verified = 1 WHERE payment_method IN ('mtn_momo','airtel_money')
              AND created_at < datetime('now', '-3 days') AND (id % 37) != 0`);

    // A power cut in the North: some sales at Gulu and Lira were made offline and synced later.
    for (const ph of [pharmacies[4], pharmacies[6]]) {
      db.run(`UPDATE sales SET offline = 1 WHERE pharmacy_id = ? AND date(created_at, '+3 hours') = ?`, ph.id, addDays(t, -9));
    }

    // Quality alert: a suspect batch of artemether-lumefantrine found in the North and quarantined network-wide.
    const al = products['Artemether-Lumefantrine'];
    const suspectBatch = 'AL2409-117X';
    for (const ph of [pharmacies[4], pharmacies[6], pharmacies[1]]) {
      db.run(
        "INSERT INTO inventory_batches (pharmacy_id, product_id, batch_no, expiry_date, quantity, cost_price, supplier, quarantined, received_at) VALUES (?,?,?,?,?,?,?,1, datetime('now','-8 days'))",
        ph.id, al.id, suspectBatch, addDays(t, 540), between(10, 40), 5200, 'Northern Pharma Traders',
      );
    }
    db.run(
      `INSERT INTO quality_reports (pharmacy_id, product_id, batch_no, supplier, issue_type, description, status, hq_note, created_by, created_at, updated_at)
       VALUES (?,?,?,?,'suspected_fake',?, 'reported_to_nda', ?, ?, datetime('now','-6 days'), datetime('now','-4 days'))`,
      pharmacies[4].id, al.id, suspectBatch, 'Northern Pharma Traders',
      'Blister foil printing is blurred, tablets are a lighter yellow than usual and the price was far below normal. Two patients said the treatment did not work.',
      'Samples sent to NDA Quality Control Lab. Batch quarantined at all FirstMeds facilities that received it.', pharmacies[4].staff[1],
    );
    const amox = products['Amoxicillin Suspension'];
    db.run(
      `INSERT INTO quality_reports (pharmacy_id, product_id, batch_no, supplier, issue_type, description, status, hq_note, created_by, created_at, updated_at)
       VALUES (?,?,?,?,'poor_quality',?, 'cleared', ?, ?, datetime('now','-40 days'), datetime('now','-33 days'))`,
      pharmacies[2].id, amox.id, 'AMX-5512', 'Abacus Distributors', 'Powder had clumped in two bottles.',
      'Supplier confirmed storage problem in one carton only; replaced. Batch cleared.', pharmacies[2].staff[1],
    );
  });
  log(`  operations: ${SUPPLIERS.length} suppliers, purchase orders, till shifts, quality alerts`);
}

let log = console.log;

// CLI: node src/seed.js [--reset]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--reset') && DEFAULT_DB_PATH !== ':memory:') {
    for (const suffix of ['', '-wal', '-shm']) rmSync(DEFAULT_DB_PATH + suffix, { force: true });
  }
  const db = openDb();
  if (db.get('SELECT 1 FROM users LIMIT 1')) {
    console.log('Database already has data. Run with --reset to start over.');
    process.exit(0);
  }
  const t0 = Date.now();
  console.log('Seeding FirstMeds demo data…');
  seed(db);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${DEFAULT_DB_PATH}`);
  console.log(`Sign in: admin@firstmeds.ug / owner1@demo.firstmeds.ug / pharmacist1@… / cashier1@…  password: ${DEMO_PASSWORD}`);
}
