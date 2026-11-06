import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { computeSubsidies } from '../src/services/sales.js';
import { normalizePhone, addDays, today } from '../src/util.js';

process.env.NODE_ENV = 'test';
let server, base, db;
const tokens = {};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function login(email) {
  const r = await call('POST', '/api/auth/login', { body: { email, password: 'demo1234' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}

before(async () => {
  db = openDb(':memory:');
  seed(db, { days: 20, quiet: true });
  server = createApp(db, { serveClient: false }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  tokens.admin = await login('admin@firstmeds.ug');
  tokens.owner1 = await login('owner1@demo.firstmeds.ug');
  tokens.cashier1 = await login('cashier1@demo.firstmeds.ug');
  tokens.owner2 = await login('owner2@demo.firstmeds.ug');
});

after(() => { server.close(); db.close(); });

/* ---------- unit ---------- */

test('phone numbers normalise to +256', () => {
  assert.equal(normalizePhone('0772 123456'), '+256772123456');
  assert.equal(normalizePhone('+256 701-234-567'), '+256701234567');
  assert.equal(normalizePhone('256752000111'), '+256752000111');
  assert.equal(normalizePhone('12345'), null);
});

test('subsidy respects discount percent and per-visit cap', () => {
  const lines = [{ product_id: 1, line_total: 10000 }, { product_id: 2, line_total: 30000 }, { product_id: 3, line_total: 5000 }];
  const eligible = new Set([1, 2]);
  assert.deepEqual(computeSubsidies(lines, { discount_percent: 50, max_subsidy_per_visit: 0 }, eligible), [5000, 15000, 0]);
  const capped = computeSubsidies(lines, { discount_percent: 100, max_subsidy_per_visit: 20000 }, eligible);
  assert.equal(capped.reduce((a, b) => a + b, 0), 20000);
  assert.equal(capped[2], 0);
});

/* ---------- auth & scoping ---------- */

test('rejects bad login and missing token', async () => {
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'admin@firstmeds.ug', password: 'nope' } })).status, 401);
  assert.equal((await call('GET', '/api/inventory')).status, 401);
});

test('staff only see their own pharmacy', async () => {
  const sales = await call('GET', '/api/sales?limit=50', { token: tokens.owner1 });
  assert.equal(sales.status, 200);
  assert.ok(sales.data.length > 0);
  assert.ok(sales.data.every((s) => s.pharmacy_id === 1));
  const foreign = db.get('SELECT id FROM sales WHERE pharmacy_id = 2 LIMIT 1').id;
  assert.equal((await call('GET', `/api/sales/${foreign}`, { token: tokens.owner1 })).status, 403);
  // pharmacy_id query param is ignored for non-admins
  const inv = await call('GET', '/api/inventory?pharmacy_id=2', { token: tokens.owner1 });
  assert.equal(inv.status, 200);
});

test('cashiers cannot manage stock or users', async () => {
  assert.equal((await call('POST', '/api/inventory/receive', { token: tokens.cashier1, body: { product_id: 1, quantity: 5, batch_no: 'X', expiry_date: '2030-01-01' } })).status, 403);
  assert.equal((await call('GET', '/api/admin/users', { token: tokens.cashier1 })).status, 403);
});

/* ---------- sales ---------- */

test('sale deducts stock first-expiry-first-out and void restores it', async () => {
  const productId = db.get("SELECT id FROM products WHERE name = 'Ibuprofen'").id;
  // Two fresh batches: the one expiring sooner must be used first.
  const t = today();
  const rec = await call('POST', '/api/inventory/receive', {
    token: tokens.owner1,
    body: { items: [
      { product_id: productId, quantity: 5, batch_no: 'LATE', expiry_date: addDays(t, 400) },
      { product_id: productId, quantity: 3, batch_no: 'SOON', expiry_date: addDays(t, 2) },
    ] },
  });
  assert.equal(rec.status, 201);
  // Drain older batches so only the two test batches remain.
  db.run("UPDATE inventory_batches SET quantity = 0 WHERE pharmacy_id = 1 AND product_id = ? AND batch_no NOT IN ('LATE','SOON')", productId);

  const sale = await call('POST', '/api/sales', {
    token: tokens.cashier1,
    body: { items: [{ product_id: productId, quantity: 4 }], payment_method: 'cash', amount_tendered: 50000 },
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.data));
  const byBatch = Object.fromEntries(sale.data.items.map((i) => [i.batch_no, i.quantity]));
  assert.deepEqual(byBatch, { SOON: 3, LATE: 1 });
  assert.equal(sale.data.change_due, 50000 - sale.data.total);
  assert.match(sale.data.receipt_no, /^FM1-\d{6}-\d{4}$/);

  const left = () => db.all("SELECT batch_no, quantity FROM inventory_batches WHERE pharmacy_id = 1 AND product_id = ? AND batch_no IN ('LATE','SOON') ORDER BY batch_no", productId);
  assert.deepEqual(left().map((b) => b.quantity), [4, 0]);

  // Not enough stock -> 409
  const tooMany = await call('POST', '/api/sales', { token: tokens.cashier1, body: { items: [{ product_id: productId, quantity: 99 }] } });
  assert.equal(tooMany.status, 409);

  // Cashier cannot void; owner can.
  assert.equal((await call('POST', `/api/sales/${sale.data.id}/void`, { token: tokens.cashier1, body: { reason: 'x' } })).status, 403);
  const v = await call('POST', `/api/sales/${sale.data.id}/void`, { token: tokens.owner1, body: { reason: 'Wrong item' } });
  assert.equal(v.status, 200);
  assert.equal(v.data.voided, true);
  assert.deepEqual(left().map((b) => b.quantity), [5, 3]);
});

test('expired batches are never sold', async () => {
  const productId = db.get("SELECT id FROM products WHERE name = 'Cough Syrup'").id;
  db.run('UPDATE inventory_batches SET quantity = 0 WHERE pharmacy_id = 1 AND product_id = ? AND expiry_date >= ?', productId, today());
  const r = await call('POST', '/api/sales', { token: tokens.owner1, body: { items: [{ product_id: productId, quantity: 1 }] } });
  assert.equal(r.status, 409);
});

test('mobile money requires a transaction id', async () => {
  const productId = db.get("SELECT id FROM products WHERE name = 'Paracetamol'").id;
  const r = await call('POST', '/api/sales', { token: tokens.cashier1, body: { items: [{ product_id: productId, quantity: 1 }], payment_method: 'mtn_momo' } });
  assert.equal(r.status, 400);
});

test('program subsidy needs enrollment and feeds claims', async () => {
  const heart = db.get("SELECT * FROM programs WHERE code = 'HEART'");
  const amlo = db.get("SELECT id FROM products WHERE name = 'Amlodipine'").id;
  const pt = await call('POST', '/api/patients', { token: tokens.cashier1, body: { name: 'Test Patient', phone: '0772 999888', sex: 'F' } });
  assert.equal(pt.status, 201);
  assert.equal(pt.data.phone, '+256772999888');

  const body = { patient_id: pt.data.id, program_id: heart.id, items: [{ product_id: amlo, quantity: 3, days_supply: 30 }] };
  assert.equal((await call('POST', '/api/sales/quote', { token: tokens.cashier1, body })).status, 400);

  assert.equal((await call('POST', `/api/patients/${pt.data.id}/enroll`, { token: tokens.cashier1, body: { program_id: heart.id } })).status, 201);
  const q = await call('POST', '/api/sales/quote', { token: tokens.cashier1, body });
  assert.equal(q.status, 200);
  assert.equal(q.data.subsidy_total, Math.round(q.data.subtotal * 0.3));
  assert.equal(q.data.total, q.data.subtotal - q.data.subsidy_total);

  const s = await call('POST', '/api/sales', { token: tokens.cashier1, body: { ...body, payment_method: 'cash' } });
  assert.equal(s.status, 201);

  // Patients from another pharmacy cannot be used
  const other = await call('POST', '/api/sales/quote', { token: tokens.owner2, body });
  assert.equal(other.status, 403);

  const preview = await call('GET', '/api/claims/preview', { token: tokens.owner1 });
  const line = preview.data.programs.find((p) => p.program_id === heart.id);
  assert.ok(line && line.amount >= s.data.subsidy_total);

  const sub = await call('POST', '/api/claims', { token: tokens.owner1, body: { period: preview.data.period, program_id: heart.id } });
  assert.equal(sub.status, 201);
  assert.equal((await call('POST', '/api/claims', { token: tokens.owner1, body: { period: preview.data.period, program_id: heart.id } })).status, 409);
  // A claimed sale can no longer be voided
  assert.equal((await call('POST', `/api/sales/${s.data.id}/void`, { token: tokens.owner1, body: { reason: 'x' } })).status, 409);

  const claimId = sub.data.created[0];
  assert.equal((await call('PUT', `/api/claims/${claimId}/status`, { token: tokens.owner1, body: { status: 'approved' } })).status, 403);
  assert.equal((await call('PUT', `/api/claims/${claimId}/status`, { token: tokens.admin, body: { status: 'paid' } })).status, 400);
  assert.equal((await call('PUT', `/api/claims/${claimId}/status`, { token: tokens.admin, body: { status: 'approved' } })).status, 200);
  assert.equal((await call('PUT', `/api/claims/${claimId}/status`, { token: tokens.admin, body: { status: 'paid' } })).status, 200);
});

test('refill reminders list due chronic patients and SMS logs clear them', async () => {
  const due = await call('GET', '/api/reminders', { token: tokens.owner1 });
  assert.equal(due.status, 200);
  if (due.data.length) {
    const item = due.data.find((d) => d.phone && d.sms_consent) || due.data[0];
    const r = await call('POST', '/api/reminders', { token: tokens.owner1, body: { sale_item_id: item.sale_item_id, channel: 'call', note: 'Will come tomorrow' } });
    assert.equal(r.status, 201);
    const again = await call('GET', '/api/reminders', { token: tokens.owner1 });
    assert.ok(!again.data.some((d) => d.sale_item_id === item.sale_item_id));
  }
});

/* ---------- website & HQ ---------- */

test('website join application can be approved into a pharmacy + owner', async () => {
  const bad = await call('POST', '/api/public/applications', { body: { facility_name: 'X', owner_name: 'Y', phone: '123', district: 'Gulu' } });
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/api/public/applications', {
    body: { facility_name: 'Arua Test Pharmacy', owner_name: 'Ruth Test', phone: '0782 111222', email: 'ruth@arua.test', district: 'Arua' },
  });
  assert.equal(ok.status, 201);
  assert.equal((await call('POST', `/api/admin/applications/${ok.data.id}/approve`, { token: tokens.owner1 })).status, 403);
  const ap = await call('POST', `/api/admin/applications/${ok.data.id}/approve`, { token: tokens.admin });
  assert.equal(ap.status, 200);
  const l = await call('POST', '/api/auth/login', { body: { email: 'ruth@arua.test', password: ap.data.temporary_password } });
  assert.equal(l.status, 200);
  assert.equal(l.data.user.role, 'owner');
  assert.equal(l.data.user.must_change_password, true);
});

test('owners can add cashiers but not owners/admins', async () => {
  const ok = await call('POST', '/api/admin/users', { token: tokens.owner1, body: { name: 'New Cashier', email: 'newcashier@test.ug', role: 'cashier' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.pharmacy_id, 1);
  assert.equal((await call('POST', '/api/admin/users', { token: tokens.owner1, body: { name: 'Bad', email: 'bad@test.ug', role: 'admin' } })).status, 403);
});

test('public stats and reports respond', async () => {
  const s = await call('GET', '/api/public/stats');
  assert.equal(s.status, 200);
  assert.equal(s.data.facilities >= 10, true);
  const n = await call('GET', '/api/reports/network?days=7', { token: tokens.admin });
  assert.equal(n.status, 200);
  assert.equal(n.data.series.length, 7);
  assert.equal((await call('GET', '/api/reports/network', { token: tokens.owner1 })).status, 403);
  const csv = await call('GET', '/api/reports/sales.csv?days=7', { token: tokens.owner1 });
  assert.equal(csv.status, 200);
  assert.match(csv.data, /^receipt_no,time_eat,pharmacy/);
});
