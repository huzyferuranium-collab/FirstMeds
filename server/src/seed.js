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
  const log = quiet ? () => {} : console.log;
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
    }
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
