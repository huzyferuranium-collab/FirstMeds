import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { str, int, bool, bad, notFound, forbidden, conflict, isDate, today, addDays, normalizePhone, EAT } from '../util.js';
import { stockSummary, flaggedBatch } from './inventory.js';

/** Reorder suggestions: sales velocity × (supplier lead time + 14 days cover) − stock on hand. */
export function reorderSuggestions(db, pharmacyId) {
  const stock = stockSummary(db, pharmacyId);
  const velocity = new Map(db.all(
    `SELECT si.product_id, SUM(si.quantity) / 30.0 AS per_day FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.pharmacy_id = ? AND s.voided = 0 AND s.created_at >= datetime('now', '-30 days') GROUP BY si.product_id`,
    pharmacyId,
  ).map((r) => [r.product_id, r.per_day]));
  const offers = db.all(
    `SELECT sp.product_id, sp.price, s.id AS supplier_id, s.name AS supplier_name, s.lead_time_days, s.payment_terms_days
       FROM supplier_prices sp JOIN suppliers s ON s.id = sp.supplier_id
      WHERE s.active = 1 AND sp.in_stock = 1 ORDER BY sp.price`,
  );
  const best = new Map();
  for (const o of offers) if (!best.has(o.product_id)) best.set(o.product_id, o);
  const onOrder = new Map(db.all(
    `SELECT pi.product_id, SUM(pi.quantity - pi.received_qty) AS qty FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
      WHERE po.pharmacy_id = ? AND po.status IN ('draft','sent') GROUP BY pi.product_id`,
    pharmacyId,
  ).map((r) => [r.product_id, r.qty]));

  const out = [];
  for (const s of stock) {
    const perDay = velocity.get(s.product_id) || 0;
    if (!perDay && s.in_stock > s.reorder_level) continue;
    const offer = best.get(s.product_id);
    const lead = offer?.lead_time_days ?? 3;
    const target = Math.ceil(perDay * (lead + 14));
    const pending = onOrder.get(s.product_id) || 0;
    const need = Math.max(target, s.reorder_level * 2) - s.in_stock - pending;
    const urgent = s.in_stock <= s.reorder_level || (perDay > 0 && s.in_stock / perDay <= lead);
    if (need <= 0 || (!urgent && s.in_stock > target)) continue;
    out.push({
      product_id: s.product_id, name: s.name, strength: s.strength, in_stock: s.in_stock, on_order: pending,
      reorder_level: s.reorder_level, per_day: Math.round(perDay * 10) / 10,
      days_left: perDay ? Math.floor(s.in_stock / perDay) : null, suggested_qty: need, urgent,
      best_supplier_id: offer?.supplier_id ?? null, best_supplier: offer?.supplier_name ?? null, best_price: offer?.price ?? null,
      current_price: s.price,
    });
  }
  return out.sort((a, b) => (b.urgent - a.urgent) || ((a.days_left ?? 999) - (b.days_left ?? 999)));
}

function nextPoNo(db, ph) {
  const d = today().replaceAll('-', '').slice(2);
  const n = db.get('SELECT COUNT(*) n FROM purchase_orders WHERE pharmacy_id = ? AND po_no LIKE ?', ph, `PO${ph}-${d}-%`).n;
  return `PO${ph}-${d}-${String(n + 1).padStart(3, '0')}`;
}

export function getPo(db, id) {
  const po = db.get(
    `SELECT po.*, s.name AS supplier_name, s.phone AS supplier_phone, s.payment_terms_days, ph.name AS pharmacy_name, u.name AS created_by_name
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id JOIN pharmacies ph ON ph.id = po.pharmacy_id
       LEFT JOIN users u ON u.id = po.created_by WHERE po.id = ?`,
    id,
  );
  if (!po) return null;
  po.items = db.all(
    `SELECT pi.*, p.name, p.strength, p.unit FROM po_items pi JOIN products p ON p.id = pi.product_id WHERE pi.po_id = ? ORDER BY p.name`,
    id,
  );
  po.payments = db.all('SELECT sp.*, u.name AS user_name FROM supplier_payments sp LEFT JOIN users u ON u.id = sp.user_id WHERE po_id = ? ORDER BY id', id);
  po.balance = po.status === 'received' ? po.total - po.paid : 0;
  return po;
}

export default function purchasingRoutes(db) {
  const r = Router();
  const managers = allow('admin', 'owner', 'pharmacist');

  /* ---------- Suppliers & price comparison ---------- */
  r.get('/suppliers', (_req, res) => {
    res.json(db.all(
      `SELECT s.*, (SELECT COUNT(*) FROM supplier_prices sp WHERE sp.supplier_id = s.id) AS products_priced
         FROM suppliers s ORDER BY s.active DESC, s.name`,
    ));
  });

  const supplierFields = (b) => [
    str(b, 'name', { max: 120 }), normalizePhone(b.phone) || str(b, 'phone', { required: false, max: 30 }),
    str(b, 'email', { required: false, max: 200 }), str(b, 'district', { required: false, max: 60 }),
    str(b, 'nda_license', { required: false, max: 60 }), int(b, 'lead_time_days', { required: false, min: 0, max: 60 }) ?? 3,
    int(b, 'payment_terms_days', { required: false, min: 0, max: 120 }) ?? 0,
  ];
  r.post('/suppliers', allow('admin'), (req, res) => {
    const { id } = db.run(
      'INSERT INTO suppliers (name, phone, email, district, nda_license, lead_time_days, payment_terms_days) VALUES (?,?,?,?,?,?,?)',
      ...supplierFields(req.body),
    );
    res.status(201).json(db.get('SELECT * FROM suppliers WHERE id = ?', id));
  });
  r.put('/suppliers/:id', allow('admin'), (req, res) => {
    const id = Number(req.params.id);
    const { changes } = db.run(
      'UPDATE suppliers SET name=?, phone=?, email=?, district=?, nda_license=?, lead_time_days=?, payment_terms_days=?, active=? WHERE id = ?',
      ...supplierFields(req.body), req.body.active === undefined ? 1 : bool(req.body.active), id,
    );
    if (!changes) throw notFound('Supplier');
    res.json(db.get('SELECT * FROM suppliers WHERE id = ?', id));
  });
  r.put('/suppliers/:id/prices', allow('admin'), (req, res) => {
    const id = Number(req.params.id);
    if (!db.get('SELECT 1 FROM suppliers WHERE id = ?', id)) throw notFound('Supplier');
    const rows = Array.isArray(req.body.prices) ? req.body.prices : [];
    db.tx(() => {
      for (const p of rows) {
        const productId = int(p, 'product_id', { min: 1 });
        if (p.price === null || p.price === '') { db.run('DELETE FROM supplier_prices WHERE supplier_id = ? AND product_id = ?', id, productId); continue; }
        db.run(
          `INSERT INTO supplier_prices (supplier_id, product_id, price, in_stock, updated_at) VALUES (?,?,?,?, datetime('now'))
           ON CONFLICT(supplier_id, product_id) DO UPDATE SET price = excluded.price, in_stock = excluded.in_stock, updated_at = excluded.updated_at`,
          id, productId, int(p, 'price', { min: 0 }), p.in_stock === undefined ? 1 : bool(p.in_stock),
        );
      }
    });
    res.json({ ok: true });
  });

  /** Price comparison: every product with each supplier's price, cheapest first. */
  r.get('/compare', (req, res) => {
    const q = `%${(req.query.q || '').trim()}%`;
    const rows = db.all(
      `SELECT p.id AS product_id, p.name, p.strength, p.category, s.id AS supplier_id, s.name AS supplier, s.lead_time_days,
              s.payment_terms_days, s.rating, sp.price, sp.in_stock, sp.updated_at
         FROM supplier_prices sp JOIN products p ON p.id = sp.product_id JOIN suppliers s ON s.id = sp.supplier_id
        WHERE s.active = 1 AND p.active = 1 AND (p.name LIKE ? OR p.generic_name LIKE ? OR p.category LIKE ?)
        ORDER BY p.name, sp.price`,
      q, q, q,
    );
    const byProduct = new Map();
    for (const r_ of rows) {
      if (!byProduct.has(r_.product_id)) byProduct.set(r_.product_id, { product_id: r_.product_id, name: r_.name, strength: r_.strength, category: r_.category, offers: [] });
      byProduct.get(r_.product_id).offers.push(r_);
    }
    res.json([...byProduct.values()].map((p) => {
      const prices = p.offers.filter((o) => o.in_stock).map((o) => o.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return { ...p, min, max, saving_pct: prices.length > 1 && max ? Math.round(((max - min) / max) * 100) : 0 };
    }));
  });

  /* ---------- Reorder suggestions ---------- */
  r.get('/suggestions', (req, res) => res.json(reorderSuggestions(db, pharmacyScope(req))));

  /* ---------- Purchase orders ---------- */
  r.get('/orders', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    res.json(db.all(
      `SELECT po.*, s.name AS supplier_name, ph.name AS pharmacy_name,
              (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) AS lines,
              CASE WHEN po.status = 'received' THEN po.total - po.paid ELSE 0 END AS balance
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id JOIN pharmacies ph ON ph.id = po.pharmacy_id
        WHERE (? IS NULL OR po.pharmacy_id = ?) ORDER BY po.created_at DESC LIMIT 300`,
      ph, ph,
    ));
  });

  r.get('/payables', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const t = today();
    const rows = db.all(
      `SELECT po.id, po.po_no, po.total, po.paid, po.total - po.paid AS balance, po.due_date, po.received_at, s.name AS supplier_name
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.status = 'received' AND po.total > po.paid AND (? IS NULL OR po.pharmacy_id = ?) ORDER BY po.due_date`,
      ph, ph,
    );
    res.json({
      orders: rows,
      outstanding: rows.reduce((a, r_) => a + r_.balance, 0),
      overdue: rows.filter((r_) => r_.due_date && r_.due_date < t).reduce((a, r_) => a + r_.balance, 0),
      due_7d: rows.filter((r_) => r_.due_date && r_.due_date >= t && r_.due_date <= addDays(t, 7)).reduce((a, r_) => a + r_.balance, 0),
    });
  });

  const load = (req) => {
    const po = getPo(db, Number(req.params.id));
    if (!po) throw notFound('Purchase order');
    if (req.user.role !== 'admin' && po.pharmacy_id !== req.user.pharmacy_id) throw forbidden();
    return po;
  };

  r.get('/orders/:id', (req, res) => res.json(load(req)));

  r.post('/orders', managers, (req, res) => {
    const ph = pharmacyScope(req);
    const supplierId = int(req.body, 'supplier_id', { min: 1 });
    const supplier = db.get('SELECT * FROM suppliers WHERE id = ? AND active = 1', supplierId);
    if (!supplier) throw notFound('Supplier');
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) throw bad('Add at least one item');
    const type = db.get('SELECT type FROM pharmacies WHERE id = ?', ph)?.type;
    const id = db.tx(() => {
      const po = db.run(
        'INSERT INTO purchase_orders (pharmacy_id, supplier_id, po_no, notes, created_by) VALUES (?,?,?,?,?)',
        ph, supplierId, nextPoNo(db, ph), str(req.body, 'notes', { required: false, max: 500 }), req.user.id,
      );
      let total = 0;
      for (const it of items) {
        const productId = int(it, 'product_id', { min: 1 });
        const prod = db.get('SELECT name, requires_prescription FROM products WHERE id = ?', productId);
        if (!prod) throw notFound(`Product ${productId}`);
        if (type === 'drug_shop' && prod.requires_prescription) throw bad(`${prod.name} is prescription-only; drug shops may not order it`);
        const qty = int(it, 'quantity', { min: 1, max: 1_000_000 });
        const offer = db.get('SELECT price FROM supplier_prices WHERE supplier_id = ? AND product_id = ?', supplierId, productId);
        const cost = it.unit_cost !== undefined && it.unit_cost !== '' ? int(it, 'unit_cost', { min: 0 }) : offer?.price ?? 0;
        db.run('INSERT INTO po_items (po_id, product_id, quantity, unit_cost) VALUES (?,?,?,?)', po.id, productId, qty, cost);
        total += qty * cost;
      }
      db.run('UPDATE purchase_orders SET total = ? WHERE id = ?', total, po.id);
      return po.id;
    });
    res.status(201).json(getPo(db, id));
  });

  r.post('/orders/:id/send', managers, (req, res) => {
    const po = load(req);
    if (po.status !== 'draft') throw conflict(`Order is already ${po.status}`);
    db.run("UPDATE purchase_orders SET status = 'sent', sent_at = datetime('now') WHERE id = ?", po.id);
    res.json(getPo(db, po.id));
  });

  r.post('/orders/:id/cancel', managers, (req, res) => {
    const po = load(req);
    if (!['draft', 'sent'].includes(po.status)) throw conflict(`A ${po.status} order cannot be cancelled`);
    db.run("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?", po.id);
    res.json(getPo(db, po.id));
  });

  /** Receive a delivery against the order: each line needs batch number and expiry; creates stock batches. */
  r.post('/orders/:id/receive', managers, (req, res) => {
    const po = load(req);
    if (!['draft', 'sent'].includes(po.status)) throw conflict(`Order is already ${po.status}`);
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const t = today();
    const flagged = [];
    db.tx(() => {
      let total = 0;
      for (const item of po.items) {
        const l = lines.find((x) => Number(x.po_item_id) === item.id);
        const qty = l ? Number(l.quantity) : 0;
        if (!Number.isInteger(qty) || qty < 0) throw bad(`Invalid quantity for ${item.name}`);
        if (qty > 0) {
          const batchNo = str(l, 'batch_no', { max: 60 });
          const expiry = str(l, 'expiry_date', { max: 10 });
          if (!isDate(expiry)) throw bad(`Expiry for ${item.name} must be YYYY-MM-DD`);
          if (expiry < t) throw bad(`${item.name} batch ${batchNo} has already expired. Reject it.`);
          const cost = l.unit_cost !== undefined && l.unit_cost !== '' ? int(l, 'unit_cost', { min: 0 }) : item.unit_cost;
          const quarantine = flaggedBatch(db, item.product_id, batchNo) ? 1 : 0;
          if (quarantine) flagged.push(`${item.name} batch ${batchNo}`);
          const b = db.run(
            'INSERT INTO inventory_batches (pharmacy_id, product_id, batch_no, expiry_date, quantity, cost_price, supplier, po_id, quarantined) VALUES (?,?,?,?,?,?,?,?,?)',
            po.pharmacy_id, item.product_id, batchNo, expiry, qty, cost, po.supplier_name, po.id, quarantine,
          );
          db.run(
            "INSERT INTO stock_movements (pharmacy_id, product_id, batch_id, type, quantity, reason, user_id) VALUES (?,?,?,'receive',?,?,?)",
            po.pharmacy_id, item.product_id, b.id, qty, `${po.po_no} from ${po.supplier_name}`, req.user.id,
          );
          db.run('UPDATE po_items SET received_qty = ?, unit_cost = ? WHERE id = ?', qty, cost, item.id);
          total += qty * cost;
        }
      }
      if (!total) throw bad('Enter the quantities received');
      const due = po.payment_terms_days ? addDays(t, po.payment_terms_days) : t;
      db.run("UPDATE purchase_orders SET status = 'received', received_at = datetime('now'), total = ?, due_date = ? WHERE id = ?", total, due, po.id);
    });
    res.json({ ...getPo(db, po.id), quarantined: flagged });
  });

  r.post('/orders/:id/payments', allow('admin', 'owner'), (req, res) => {
    const po = load(req);
    if (po.status !== 'received') throw conflict('Record payments after the delivery is received');
    const amount = int(req.body, 'amount', { min: 1 });
    if (amount > po.total - po.paid) throw bad(`Only ${po.total - po.paid} is outstanding`);
    db.tx(() => {
      db.run('INSERT INTO supplier_payments (po_id, amount, method, reference, user_id) VALUES (?,?,?,?,?)',
        po.id, amount, ['cash', 'mtn_momo', 'airtel_money', 'bank'].includes(req.body.method) ? req.body.method : 'cash',
        str(req.body, 'reference', { required: false, max: 64 }), req.user.id);
      db.run('UPDATE purchase_orders SET paid = paid + ? WHERE id = ?', amount, po.id);
    });
    res.status(201).json(getPo(db, po.id));
  });

  /* ---------- Monthly spend by supplier (for the business report) ---------- */
  r.get('/spend', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    res.json(db.all(
      `SELECT s.name AS supplier, COUNT(*) AS orders, SUM(po.total) AS total
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.status = 'received' AND (? IS NULL OR po.pharmacy_id = ?) AND date(po.received_at, ${EAT}) >= date('now', '-90 days')
        GROUP BY s.id ORDER BY total DESC`,
      ph, ph,
    ));
  });

  return r;
}
