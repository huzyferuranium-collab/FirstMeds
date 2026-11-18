import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { str, int, bad, notFound, isDate, today, addDays } from '../util.js';

/** Stock summary per product for one pharmacy (sellable = unexpired quantity). */
export function stockSummary(db, pharmacyId, { q = '', onlyStocked = false } = {}) {
  const t = today();
  const like = `%${q}%`;
  return db.all(
    `SELECT p.id AS product_id, p.name, p.generic_name, p.strength, p.form, p.category, p.unit,
            p.requires_prescription, p.is_essential,
            COALESCE(pp.price, p.default_price) AS price, COALESCE(pp.reorder_level, 10) AS reorder_level,
            p.barcode, p.nda_status, p.counselling, p.antibiotic,
            COALESCE(SUM(CASE WHEN b.expiry_date >= ? AND b.quarantined = 0 THEN b.quantity END), 0) AS in_stock,
            COALESCE(SUM(CASE WHEN b.expiry_date < ? AND b.quarantined = 0 THEN b.quantity END), 0) AS expired_qty,
            COALESCE(SUM(CASE WHEN b.quarantined = 1 THEN b.quantity END), 0) AS quarantined_qty,
            MIN(CASE WHEN b.quantity > 0 AND b.expiry_date >= ? AND b.quarantined = 0 THEN b.expiry_date END) AS next_expiry,
            COALESCE(SUM(CASE WHEN b.expiry_date >= ? AND b.quarantined = 0 THEN b.quantity * b.cost_price END), 0) AS stock_value
       FROM products p
       LEFT JOIN pharmacy_products pp ON pp.product_id = p.id AND pp.pharmacy_id = ?
       LEFT JOIN inventory_batches b ON b.product_id = p.id AND b.pharmacy_id = ?
      WHERE p.active = 1 AND (p.name LIKE ? OR p.generic_name LIKE ? OR p.category LIKE ? OR p.barcode = ?)
        AND (? != 'drug_shop' OR p.requires_prescription = 0)
      GROUP BY p.id
      ${onlyStocked ? 'HAVING in_stock > 0' : ''}
      ORDER BY p.name`,
    t, t, t, t, pharmacyId, pharmacyId, like, like, like, q, phType(db, pharmacyId),
  );
}

export default function inventoryRoutes(db) {
  const r = Router();
  const managers = allow('admin', 'owner', 'pharmacist');

  r.get('/', (req, res) => {
    const ph = pharmacyScope(req);
    res.json(stockSummary(db, ph, { q: (req.query.q || '').trim(), onlyStocked: req.query.stocked === '1' }));
  });

  r.get('/alerts', (req, res) => {
    const ph = pharmacyScope(req);
    const t = today();
    const summary = stockSummary(db, ph);
    res.json({
      low_stock: summary.filter((s) => s.in_stock <= s.reorder_level && (s.in_stock > 0 || s.expired_qty > 0 || hasHistory(db, ph, s.product_id))),
      out_of_stock: summary.filter((s) => s.in_stock === 0 && hasHistory(db, ph, s.product_id)),
      expiring: db.all(
        `SELECT b.*, p.name, p.strength FROM inventory_batches b JOIN products p ON p.id = b.product_id
          WHERE b.pharmacy_id = ? AND b.quantity > 0 AND b.quarantined = 0 AND b.expiry_date >= ? AND b.expiry_date <= ? ORDER BY b.expiry_date`,
        ph, t, addDays(t, 90),
      ),
      quarantined: db.all(
        `SELECT b.*, p.name, p.strength FROM inventory_batches b JOIN products p ON p.id = b.product_id
          WHERE b.pharmacy_id = ? AND b.quantity > 0 AND b.quarantined = 1 ORDER BY b.id DESC`,
        ph,
      ),
      expired: db.all(
        `SELECT b.*, p.name, p.strength FROM inventory_batches b JOIN products p ON p.id = b.product_id
          WHERE b.pharmacy_id = ? AND b.quantity > 0 AND b.quarantined = 0 AND b.expiry_date < ? ORDER BY b.expiry_date`,
        ph, t,
      ),
    });
  });

  r.get('/movements', (req, res) => {
    const ph = pharmacyScope(req);
    const productId = req.query.product_id ? Number(req.query.product_id) : null;
    res.json(db.all(
      `SELECT m.*, p.name AS product_name, b.batch_no, u.name AS user_name
         FROM stock_movements m JOIN products p ON p.id = m.product_id
         LEFT JOIN inventory_batches b ON b.id = m.batch_id LEFT JOIN users u ON u.id = m.user_id
        WHERE m.pharmacy_id = ? ${productId ? 'AND m.product_id = ?' : ''}
        ORDER BY m.id DESC LIMIT 200`,
      ...(productId ? [ph, productId] : [ph]),
    ));
  });

  r.get('/:productId/batches', (req, res) => {
    const ph = pharmacyScope(req);
    res.json(db.all(
      'SELECT * FROM inventory_batches WHERE pharmacy_id = ? AND product_id = ? ORDER BY expiry_date, id',
      ph, Number(req.params.productId),
    ));
  });

  r.post('/receive', managers, (req, res) => {
    const ph = pharmacyScope(req);
    const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
    const supplier = str(req.body, 'supplier', { required: false, max: 120 });
    const t = today();
    const created = db.tx(() => items.map((it) => {
      const productId = int(it, 'product_id', { min: 1 });
      const prod = db.get('SELECT name, requires_prescription, nda_status FROM products WHERE id = ?', productId);
      if (!prod) throw notFound(`Product ${productId}`);
      if (prod.requires_prescription && phType(db, ph) === 'drug_shop') throw bad(`${prod.name} is prescription-only; drug shops may not stock it`);
      if (prod.nda_status === 'suspended') throw bad(`${prod.name} is suspended after a quality alert and cannot be received`);
      const qty = int(it, 'quantity', { min: 1, max: 1_000_000 });
      const expiry = str(it, 'expiry_date', { max: 10 });
      if (!isDate(expiry)) throw bad('expiry_date must be YYYY-MM-DD');
      if (expiry < t) throw bad('Cannot receive stock that has already expired');
      const batchNo = str(it, 'batch_no', { max: 60 });
      const cost = int(it, 'cost_price', { required: false, min: 0 }) ?? 0;
      const { id } = db.run(
        'INSERT INTO inventory_batches (pharmacy_id, product_id, batch_no, expiry_date, quantity, cost_price, supplier) VALUES (?,?,?,?,?,?,?)',
        ph, productId, batchNo, expiry, qty, cost, it.supplier || supplier,
      );
      if (it.po_id) db.run('UPDATE inventory_batches SET po_id = ? WHERE id = ?', Number(it.po_id), id);
      // Batch already flagged as fake elsewhere in the network? Quarantine it on arrival.
      if (flaggedBatch(db, productId, batchNo)) db.run('UPDATE inventory_batches SET quarantined = 1 WHERE id = ?', id);
      db.run(
        "INSERT INTO stock_movements (pharmacy_id, product_id, batch_id, type, quantity, reason, user_id) VALUES (?,?,?,'receive',?,?,?)",
        ph, productId, id, qty, supplier ? `From ${supplier}` : 'Stock received', req.user.id,
      );
      if (it.price !== undefined && it.price !== '') {
        const price = int(it, 'price', { min: 0 });
        db.run(
          `INSERT INTO pharmacy_products (pharmacy_id, product_id, price) VALUES (?,?,?)
           ON CONFLICT(pharmacy_id, product_id) DO UPDATE SET price = excluded.price`,
          ph, productId, price,
        );
      }
      return db.get('SELECT * FROM inventory_batches WHERE id = ?', id);
    }));
    res.status(201).json(created);
  });

  // Adjust a batch: stock count corrections, damage, write-off of expired stock.
  r.post('/adjust', managers, (req, res) => {
    const ph = pharmacyScope(req);
    const batchId = int(req.body, 'batch_id', { min: 1 });
    const change = int(req.body, 'change');
    if (change === 0) throw bad('change cannot be 0');
    const reason = str(req.body, 'reason', { max: 200 });
    const type = req.body.type === 'expire' ? 'expire' : 'adjust';
    const batch = db.get('SELECT * FROM inventory_batches WHERE id = ? AND pharmacy_id = ?', batchId, ph);
    if (!batch) throw notFound('Batch');
    if (batch.quantity + change < 0) throw bad(`Batch only has ${batch.quantity} units`);
    db.tx(() => {
      db.run('UPDATE inventory_batches SET quantity = quantity + ? WHERE id = ?', change, batchId);
      db.run(
        'INSERT INTO stock_movements (pharmacy_id, product_id, batch_id, type, quantity, reason, user_id) VALUES (?,?,?,?,?,?,?)',
        ph, batch.product_id, batchId, type, change, reason, req.user.id,
      );
    });
    res.json(db.get('SELECT * FROM inventory_batches WHERE id = ?', batchId));
  });

  r.put('/:productId/settings', allow('admin', 'owner'), (req, res) => {
    const ph = pharmacyScope(req);
    const productId = Number(req.params.productId);
    if (!db.get('SELECT 1 FROM products WHERE id = ?', productId)) throw notFound('Product');
    const price = int(req.body, 'price', { required: false, min: 0 });
    const reorder = int(req.body, 'reorder_level', { required: false, min: 0 }) ?? 10;
    db.run(
      `INSERT INTO pharmacy_products (pharmacy_id, product_id, price, reorder_level) VALUES (?,?,?,?)
       ON CONFLICT(pharmacy_id, product_id) DO UPDATE SET price = excluded.price, reorder_level = excluded.reorder_level`,
      ph, productId, price, reorder,
    );
    res.json({ ok: true });
  });

  return r;
}

export function flaggedBatch(db, productId, batchNo) {
  return db.get(
    `SELECT id, status FROM quality_reports WHERE product_id = ? AND batch_no = ? COLLATE NOCASE
        AND status IN ('open','investigating','reported_to_nda','confirmed') LIMIT 1`,
    productId, batchNo,
  );
}

function phType(db, ph) {
  return db.get('SELECT type FROM pharmacies WHERE id = ?', ph)?.type || 'pharmacy';
}

function hasHistory(db, ph, productId) {
  return !!db.get('SELECT 1 FROM inventory_batches WHERE pharmacy_id = ? AND product_id = ? LIMIT 1', ph, productId);
}
