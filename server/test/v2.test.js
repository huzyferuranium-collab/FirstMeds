import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { parseStatement } from '../src/routes/cash.js';
import { today, addDays } from '../src/util.js';

process.env.NODE_ENV = 'test';
let server, base, db;
const tk = {};
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
const login = async (email) => (await call('POST', '/api/auth/login', { body: { email, password: 'demo1234' } })).data.token;
const pid = (name) => db.get('SELECT id FROM products WHERE name = ?', name).id;

before(async () => {
  db = openDb(':memory:');
  seed(db, { days: 20, quiet: true });
  server = createApp(db, { serveClient: false }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  tk.admin = await login('admin@firstmeds.ug');
  tk.owner1 = await login('owner1@demo.firstmeds.ug');
  tk.cashier1 = await login('cashier1@demo.firstmeds.ug');
  tk.drugshop = await login('owner2@demo.firstmeds.ug'); // Kireka Care Drug Shop
});
after(() => { server.close(); db.close(); });

test('drug shops cannot sell or receive prescription-only medicines', async () => {
  const amox = pid('Amoxicillin');
  assert.equal((await call('POST', '/api/sales/quote', { token: tk.drugshop, body: { items: [{ product_id: amox, quantity: 1 }] } })).status, 403);
  assert.equal((await call('POST', '/api/inventory/receive', { token: tk.drugshop, body: { product_id: amox, quantity: 5, batch_no: 'X1', expiry_date: addDays(today(), 300) } })).status, 400);
  const inv = await call('GET', '/api/inventory', { token: tk.drugshop });
  assert.ok(!inv.data.some((p) => p.requires_prescription));
});

test('prescription-only sale needs a valid prescription and is recorded in the register', async () => {
  const amox = pid('Amoxicillin');
  const base_ = { items: [{ product_id: amox, quantity: 1 }], payment_method: 'cash' };
  const noRx = await call('POST', '/api/sales', { token: tk.cashier1, body: base_ });
  assert.equal(noRx.status, 400);
  assert.equal(noRx.data.details.code, 'PRESCRIPTION_REQUIRED');
  const old = await call('POST', '/api/sales', { token: tk.cashier1, body: { ...base_, prescription: { prescriber_name: 'Dr X', rx_date: addDays(today(), -45) } } });
  assert.equal(old.status, 400);
  const ok = await call('POST', '/api/sales', { token: tk.cashier1, body: { ...base_, prescription: { prescriber_name: 'Dr Test', prescriber_reg_no: 'UMDPC/1', rx_date: today() } } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.prescription.prescriber_name, 'Dr Test');
  const reg = await call('GET', '/api/quality/prescriptions', { token: tk.owner1 });
  assert.ok(reg.data.some((r) => r.sale_id === ok.data.id));
});

test('antimalarials need a malaria test answer unless a test is in the basket', async () => {
  const al = pid('Artemether-Lumefantrine');
  const rdt = pid('Malaria Rapid Diagnostic Test');
  const r1 = await call('POST', '/api/sales', { token: tk.cashier1, body: { items: [{ product_id: al, quantity: 1 }] } });
  assert.equal(r1.data.details?.code, 'MALARIA_TEST_REQUIRED');
  const r2 = await call('POST', '/api/sales', { token: tk.cashier1, body: { items: [{ product_id: al, quantity: 1 }], malaria_test: 'tested_elsewhere' } });
  assert.equal(r2.status, 201);
  assert.equal(r2.data.malaria_test, 'tested_elsewhere');
  const r3 = await call('POST', '/api/sales', { token: tk.cashier1, body: { items: [{ product_id: al, quantity: 1 }, { product_id: rdt, quantity: 1 }] } });
  assert.equal(r3.data.malaria_test, 'tested_here');
});

test('reporting a suspected fake batch quarantines it network-wide and blocks sale; clearing releases it', async () => {
  const cetirizine = pid('Cetirizine');
  // Same batch number at two facilities.
  for (const token of [tk.owner1, tk.drugshop]) {
    const r = await call('POST', '/api/inventory/receive', { token, body: { product_id: cetirizine, quantity: 50, batch_no: 'FAKE-77', expiry_date: addDays(today(), 400) } });
    assert.equal(r.status, 201);
  }
  db.run("UPDATE inventory_batches SET quantity = 0 WHERE product_id = ? AND batch_no != 'FAKE-77'", cetirizine);
  const rep = await call('POST', '/api/quality', { token: tk.owner1, body: { product_id: cetirizine, batch_no: 'FAKE-77', issue_type: 'suspected_fake', description: 'Wrong colour' } });
  assert.equal(rep.status, 201);
  assert.equal(rep.data.network_wide, true);
  assert.equal(db.get("SELECT COUNT(*) n FROM inventory_batches WHERE batch_no = 'FAKE-77' AND quarantined = 1").n, 2);
  const sale = await call('POST', '/api/sales', { token: tk.drugshop, body: { items: [{ product_id: cetirizine, quantity: 1 }] } });
  assert.equal(sale.status, 409);
  // New deliveries of the flagged batch are quarantined on arrival.
  await call('POST', '/api/inventory/receive', { token: tk.owner1, body: { product_id: cetirizine, quantity: 5, batch_no: 'fake-77', expiry_date: addDays(today(), 400) } });
  assert.equal(db.get("SELECT quarantined FROM inventory_batches WHERE batch_no = 'fake-77'").quarantined, 1);
  const v = await call('GET', `/api/quality/verify?code=${encodeURIComponent('Cetirizine')}&batch=FAKE-77`, { token: tk.cashier1 });
  assert.equal(v.data.results[0].verdict, 'batch_alert');
  assert.equal((await call('PUT', `/api/quality/${rep.data.id}`, { token: tk.owner1, body: { status: 'cleared' } })).status, 403);
  assert.equal((await call('PUT', `/api/quality/${rep.data.id}`, { token: tk.admin, body: { status: 'cleared' } })).status, 200);
  assert.equal(db.get("SELECT COUNT(*) n FROM inventory_batches WHERE batch_no = 'FAKE-77' COLLATE NOCASE AND quarantined = 1").n, 0);
});

test('offline sales sync once (idempotent) and keep their original time', async () => {
  const para = pid('Paracetamol');
  const when = new Date(Date.now() - 3 * 3600e3).toISOString();
  const body = { client_id: 'dev1-0001', offline_created_at: when, items: [{ product_id: para, quantity: 1 }] };
  const a = await call('POST', '/api/sales', { token: tk.cashier1, body });
  const b = await call('POST', '/api/sales', { token: tk.cashier1, body });
  assert.equal(a.status, 201);
  assert.equal(b.data.id, a.data.id);
  assert.equal(b.data.duplicate, true);
  assert.equal(a.data.offline, 1);
  assert.equal(a.data.created_at, when.replace('T', ' ').slice(0, 19));
  const tooOld = await call('POST', '/api/sales', { token: tk.cashier1, body: { ...body, client_id: 'dev1-0002', offline_created_at: new Date(Date.now() - 20 * 864e5).toISOString() } });
  assert.equal(tooOld.status, 400);
});

test('till shift: open, sell cash, close with variance', async () => {
  const t = await login('pharmacist1@demo.firstmeds.ug');
  const cur = await call('GET', '/api/cash/current', { token: t });
  if (cur.data) await call('POST', '/api/cash/close', { token: t, body: { counted_cash: cur.data.totals.expected_cash } });
  assert.equal((await call('POST', '/api/cash/open', { token: t, body: { opening_float: 20000 } })).status, 201);
  assert.equal((await call('POST', '/api/cash/open', { token: t, body: {} })).status, 409);
  const sale = await call('POST', '/api/sales', { token: t, body: { items: [{ product_id: pid('Paracetamol'), quantity: 2 }], payment_method: 'cash' } });
  const now = await call('GET', '/api/cash/current', { token: t });
  assert.equal(now.data.totals.expected_cash, 20000 + sale.data.total);
  assert.equal(sale.data.shift_id, now.data.id);
  const closed = await call('POST', '/api/cash/close', { token: t, body: { counted_cash: 20000 + sale.data.total - 500 } });
  assert.equal(closed.data.variance, -500);
});

test('mobile money statement import matches by reference and amount', async () => {
  assert.deepEqual(parseStatement('Ref,Amount\nMP123, 8,000\njunk\nMP124;500;2026-11-05 10:01\n"AM55","UGX 12,500"'), [
    { reference: 'MP123', amount: 8000, txn_time: null },
    { reference: 'MP124', amount: 500, txn_time: '2026-11-05 10:01' },
    { reference: 'AM55', amount: 12500, txn_time: null },
  ]);
  const s = await call('POST', '/api/sales', { token: tk.cashier1, body: { items: [{ product_id: pid('Vitamin C'), quantity: 2 }], payment_method: 'mtn_momo', payment_ref: 'MPTEST999' } });
  const imp = await call('POST', '/api/cash/momo/import', { token: tk.owner1, body: { provider: 'mtn_momo', text: `MPTEST999\t${s.data.total}\nMPNOT00001\t5000` } });
  assert.equal(imp.data.matched, 1);
  assert.equal(db.get('SELECT payment_verified FROM sales WHERE id = ?', s.data.id).payment_verified, 1);
  const m = await call('GET', '/api/cash/momo', { token: tk.owner1 });
  assert.ok(m.data.unmatched_lines.some((l) => l.reference === 'MPNOT00001'));
});

test('purchase order: create at supplier price, receive into stock, pay balance', async () => {
  const sup = db.get("SELECT id, payment_terms_days FROM suppliers WHERE name = 'Joint Medical Store'");
  const ors = pid('Oral Rehydration Salts');
  const price = db.get('SELECT price FROM supplier_prices WHERE supplier_id = ? AND product_id = ?', sup.id, ors)?.price ?? 0;
  const po = await call('POST', '/api/purchasing/orders', { token: tk.owner1, body: { supplier_id: sup.id, items: [{ product_id: ors, quantity: 100 }] } });
  assert.equal(po.status, 201);
  assert.equal(po.data.total, 100 * price);
  assert.equal((await call('POST', `/api/purchasing/orders/${po.data.id}/send`, { token: tk.owner1 })).status, 200);
  const before_ = db.get('SELECT COALESCE(SUM(quantity),0) q FROM inventory_batches WHERE pharmacy_id = 1 AND product_id = ?', ors).q;
  const rec = await call('POST', `/api/purchasing/orders/${po.data.id}/receive`, { token: tk.owner1, body: { lines: [{ po_item_id: po.data.items[0].id, quantity: 90, batch_no: 'ORS-NEW', expiry_date: addDays(today(), 600) }] } });
  assert.equal(rec.status, 200, JSON.stringify(rec.data));
  assert.equal(rec.data.total, 90 * price);
  assert.equal(db.get('SELECT COALESCE(SUM(quantity),0) q FROM inventory_batches WHERE pharmacy_id = 1 AND product_id = ?', ors).q, before_ + 90);
  assert.equal(rec.data.due_date, addDays(today(), sup.payment_terms_days));
  const pay = await call('POST', `/api/purchasing/orders/${po.data.id}/payments`, { token: tk.owner1, body: { amount: rec.data.total } });
  assert.equal(pay.data.balance, 0);
  assert.equal((await call('POST', `/api/purchasing/orders/${po.data.id}/payments`, { token: tk.owner1, body: { amount: 1 } })).status, 400);
});

test('health check scores all eleven areas', async () => {
  const h = await call('GET', '/api/reports/health', { token: tk.owner1 });
  assert.equal(h.status, 200);
  assert.equal(h.data.checks.length, 11);
  assert.ok(h.data.score >= 0 && h.data.score <= 100);
  assert.ok(h.data.checks.every((c) => ['good', 'watch', 'act'].includes(c.status)));
});
