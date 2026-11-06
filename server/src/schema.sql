-- FirstMeds database schema (SQLite). All money values are whole Uganda Shillings (UGX).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pharmacies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'pharmacy' CHECK (type IN ('pharmacy','drug_shop','clinic')),
  district      TEXT NOT NULL,
  town          TEXT,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  nda_license   TEXT,          -- National Drug Authority licence number
  tin           TEXT,          -- URA Taxpayer Identification Number
  owner_name    TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','owner','pharmacist','cashier')),
  pharmacy_id   INTEGER REFERENCES pharmacies(id),
  active        INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Network-wide product catalogue, managed by FirstMeds HQ.
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  generic_name  TEXT,
  strength      TEXT,
  form          TEXT,          -- tablet, syrup, sachet, injection, test kit...
  category      TEXT NOT NULL DEFAULT 'General',
  unit          TEXT NOT NULL DEFAULT 'unit',
  nda_reg_no    TEXT,
  default_price INTEGER NOT NULL DEFAULT 0,
  is_essential  INTEGER NOT NULL DEFAULT 0,  -- on Uganda Essential Medicines List
  requires_prescription INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-pharmacy price and reorder settings.
CREATE TABLE IF NOT EXISTS pharmacy_products (
  pharmacy_id   INTEGER NOT NULL REFERENCES pharmacies(id),
  product_id    INTEGER NOT NULL REFERENCES products(id),
  price         INTEGER,
  reorder_level INTEGER NOT NULL DEFAULT 10,
  PRIMARY KEY (pharmacy_id, product_id)
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id   INTEGER NOT NULL REFERENCES pharmacies(id),
  product_id    INTEGER NOT NULL REFERENCES products(id),
  batch_no      TEXT NOT NULL,
  expiry_date   TEXT NOT NULL,          -- YYYY-MM-DD
  quantity      INTEGER NOT NULL CHECK (quantity >= 0),
  cost_price    INTEGER NOT NULL DEFAULT 0,
  supplier      TEXT,
  received_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_batches_lookup ON inventory_batches(pharmacy_id, product_id, expiry_date);

CREATE TABLE IF NOT EXISTS patients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id   INTEGER NOT NULL REFERENCES pharmacies(id),
  name          TEXT NOT NULL,
  phone         TEXT,
  sex           TEXT CHECK (sex IN ('F','M') OR sex IS NULL),
  dob           TEXT,
  district      TEXT,
  village       TEXT,
  nin           TEXT,                   -- National Identification Number (optional)
  sms_consent   INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patients_pharmacy ON patients(pharmacy_id, name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);

CREATE TABLE IF NOT EXISTS programs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  sponsor       TEXT,
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  max_subsidy_per_visit INTEGER NOT NULL DEFAULT 0,   -- 0 = no cap
  requires_enrollment INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 1,
  start_date    TEXT,
  end_date      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS program_products (
  program_id    INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  PRIMARY KEY (program_id, product_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id    INTEGER NOT NULL REFERENCES programs(id),
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  enrolled_by   INTEGER REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  enrolled_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (program_id, patient_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id   INTEGER NOT NULL REFERENCES pharmacies(id),
  user_id       INTEGER REFERENCES users(id),
  patient_id    INTEGER REFERENCES patients(id),
  program_id    INTEGER REFERENCES programs(id),
  receipt_no    TEXT NOT NULL UNIQUE,
  subtotal      INTEGER NOT NULL,
  discount_total INTEGER NOT NULL DEFAULT 0,
  subsidy_total INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL,       -- amount paid by the patient
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','mtn_momo','airtel_money','card','insurance','program')),
  payment_ref   TEXT,
  amount_tendered INTEGER,
  voided        INTEGER NOT NULL DEFAULT 0,
  void_reason   TEXT,
  voided_by     INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_date ON sales(pharmacy_id, created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id       INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  batch_id      INTEGER REFERENCES inventory_batches(id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    INTEGER NOT NULL,
  unit_cost     INTEGER NOT NULL DEFAULT 0,
  line_total    INTEGER NOT NULL,
  subsidy       INTEGER NOT NULL DEFAULT 0,
  days_supply   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id   INTEGER NOT NULL REFERENCES pharmacies(id),
  product_id    INTEGER NOT NULL REFERENCES products(id),
  batch_id      INTEGER REFERENCES inventory_batches(id),
  type          TEXT NOT NULL CHECK (type IN ('receive','sale','adjust','expire','void')),
  quantity      INTEGER NOT NULL,       -- signed
  reason        TEXT,
  user_id       INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id   INTEGER NOT NULL REFERENCES pharmacies(id),
  program_id    INTEGER NOT NULL REFERENCES programs(id),
  period        TEXT NOT NULL,          -- YYYY-MM
  amount        INTEGER NOT NULL,
  sales_count   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','paid','rejected')),
  note          TEXT,
  submitted_by  INTEGER REFERENCES users(id),
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT
);

CREATE TABLE IF NOT EXISTS reminder_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_item_id  INTEGER NOT NULL REFERENCES sale_items(id),
  patient_id    INTEGER NOT NULL REFERENCES patients(id),
  channel       TEXT NOT NULL CHECK (channel IN ('sms','call','in_person')),
  status        TEXT NOT NULL,          -- sent, queued, failed, contacted
  note          TEXT,
  user_id       INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Website: applications to join the network.
CREATE TABLE IF NOT EXISTS applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_name TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'pharmacy',
  owner_name    TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  district      TEXT NOT NULL,
  town          TEXT,
  nda_license   TEXT,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','approved','rejected')),
  pharmacy_id   INTEGER REFERENCES pharmacies(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  subject       TEXT,
  message       TEXT NOT NULL,
  handled       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news_posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  excerpt       TEXT,
  body          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Update',
  published     INTEGER NOT NULL DEFAULT 1,
  published_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  department    TEXT,
  location      TEXT NOT NULL DEFAULT 'Kampala',
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  description   TEXT NOT NULL,
  apply_email   TEXT,
  published     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
