import { bad, conflict, notFound, forbidden, today, EAT, PAYMENT_METHODS } from '../util.js';

/** Effective selling price of a product at a pharmacy. */
export function priceFor(db, pharmacyId, productId) {
  const row = db.get(
    `SELECT p.id, p.name, p.default_price, p.active, pp.price
       FROM products p LEFT JOIN pharmacy_products pp ON pp.product_id = p.id AND pp.pharmacy_id = ?
      WHERE p.id = ?`,
    pharmacyId, productId,
  );
  if (!row) throw notFound(`Product ${productId}`);
  return { ...row, unit_price: row.price ?? row.default_price };
}

/**
 * Work out subsidy for a basket under a program. Pure function so it is easy to test.
 * lines: [{ product_id, line_total }]; eligible: Set of product ids; program: { discount_percent, max_subsidy_per_visit }
 * Returns array of subsidies aligned with lines.
 */
export function computeSubsidies(lines, program, eligible) {
  if (!program) return lines.map(() => 0);
  const raw = lines.map((l) => (eligible.has(l.product_id) ? Math.round((l.line_total * program.discount_percent) / 100) : 0));
  const total = raw.reduce((a, b) => a + b, 0);
  const cap = program.max_subsidy_per_visit;
  if (!cap || total <= cap) return raw;
  // Scale down proportionally to respect the per-visit cap, fixing rounding on the largest line.
  const scaled = raw.map((r) => Math.floor((r * cap) / total));
  const diff = cap - scaled.reduce((a, b) => a + b, 0);
  if (diff) scaled[raw.indexOf(Math.max(...raw))] += diff;
  return scaled;
}

/** Quote a basket without committing anything (used by the POS for live totals). */
export function quoteSale(db, pharmacyId, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw bad('Add at least one item');

  // Merge duplicate product lines.
  const merged = new Map();
  for (const it of items) {
    const productId = Number(it.product_id);
    const qty = Number(it.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty <= 0) throw bad('Each item needs product_id and a positive whole quantity');
    const days = Number(it.days_supply || 0);
    if (!Number.isInteger(days) || days < 0 || days > 365) throw bad('days_supply must be 0–365');
    const prev = merged.get(productId);
    merged.set(productId, { product_id: productId, quantity: (prev?.quantity || 0) + qty, days_supply: Math.max(prev?.days_supply || 0, days) });
  }

  const lines = [...merged.values()].map((it) => {
    const p = priceFor(db, pharmacyId, it.product_id);
    if (!p.active) throw bad(`${p.name} is no longer sold`);
    return { ...it, name: p.name, unit_price: p.unit_price, line_total: p.unit_price * it.quantity };
  });

  let program = null;
  let eligible = new Set();
  const patientId = body.patient_id ? Number(body.patient_id) : null;
  if (patientId) {
    const pt = db.get('SELECT id, pharmacy_id FROM patients WHERE id = ?', patientId);
    if (!pt) throw notFound('Patient');
    if (pt.pharmacy_id !== pharmacyId) throw forbidden('Patient is registered at another pharmacy');
  }
  if (body.program_id) {
    program = db.get('SELECT * FROM programs WHERE id = ?', Number(body.program_id));
    if (!program) throw notFound('Program');
    const t = today();
    if (!program.active || (program.start_date && program.start_date > t) || (program.end_date && program.end_date < t)) {
      throw bad(`${program.name} is not running today`);
    }
    if (program.requires_enrollment) {
      if (!patientId) throw bad(`${program.name} requires an enrolled patient`);
      const en = db.get("SELECT 1 FROM enrollments WHERE program_id = ? AND patient_id = ? AND status = 'active'", program.id, patientId);
      if (!en) throw bad(`Patient is not enrolled in ${program.name}`);
    }
    eligible = new Set(db.all('SELECT product_id FROM program_products WHERE program_id = ?', program.id).map((r) => r.product_id));
  }

  const subsidies = computeSubsidies(lines, program, eligible);
  lines.forEach((l, i) => { l.subsidy = subsidies[i]; l.eligible = eligible.has(l.product_id); });

  const subtotal = lines.reduce((a, l) => a + l.line_total, 0);
  const subsidy_total = subsidies.reduce((a, b) => a + b, 0);
  const discount_total = Math.min(Math.max(0, Math.round(Number(body.discount || 0))), subtotal - subsidy_total);
  const total = subtotal - subsidy_total - discount_total;
  return { lines, program, patient_id: patientId, subtotal, subsidy_total, discount_total, total };
}

function nextReceiptNo(db, pharmacyId, d) {
  const n = db.get(
    "SELECT COUNT(*) AS n FROM sales WHERE pharmacy_id = ? AND receipt_no LIKE ?",
    pharmacyId, `FM${pharmacyId}-${d.replaceAll('-', '').slice(2)}-%`,
  ).n;
  return `FM${pharmacyId}-${d.replaceAll('-', '').slice(2)}-${String(n + 1).padStart(4, '0')}`;
}

/**
 * Create a sale: price it, allocate stock first-expiry-first-out (FEFO), record movements.
 * Expired batches are never sold.
 */
export function createSale(db, { pharmacyId, user, body, createdAt = null }) {
  const method = body.payment_method || 'cash';
  if (!PAYMENT_METHODS.includes(method)) throw bad(`payment_method must be one of ${PAYMENT_METHODS.join(', ')}`);
  if (body.discount && !['admin', 'owner', 'pharmacist'].includes(user.role)) throw forbidden('Only pharmacists and owners can give discounts');

  return db.tx(() => {
    const q = quoteSale(db, pharmacyId, body);
    if (method === 'program' && q.total !== 0) throw bad('Payment method "program" is only for fully subsidised sales');
    if ((method === 'mtn_momo' || method === 'airtel_money') && q.total > 0 && !body.payment_ref) {
      throw bad('Enter the mobile money transaction ID');
    }
    const tendered = body.amount_tendered != null && body.amount_tendered !== '' ? Number(body.amount_tendered) : null;
    if (method === 'cash' && tendered != null && tendered < q.total) throw bad('Cash tendered is less than the amount due');

    const asOf = (createdAt || new Date().toISOString()).slice(0, 10);
    const allocations = [];
    for (const line of q.lines) {
      const batches = db.all(
        `SELECT id, quantity, cost_price FROM inventory_batches
          WHERE pharmacy_id = ? AND product_id = ? AND quantity > 0 AND expiry_date >= ?
          ORDER BY expiry_date, id`,
        pharmacyId, line.product_id, asOf,
      );
      let need = line.quantity;
      const parts = [];
      for (const b of batches) {
        if (!need) break;
        const take = Math.min(need, b.quantity);
        parts.push({ batch: b, qty: take });
        need -= take;
      }
      if (need > 0) {
        const have = line.quantity - need;
        throw conflict(`Not enough stock of ${line.name}: ${have} available, ${line.quantity} requested`);
      }
      allocations.push({ line, parts });
    }

    const eatDay = createdAt ? new Date(Date.parse(`${createdAt.replace(' ', 'T')}Z`) + 3 * 3600e3).toISOString().slice(0, 10) : today();
    const receipt_no = nextReceiptNo(db, pharmacyId, eatDay);
    const sale = db.run(
      `INSERT INTO sales (pharmacy_id, user_id, patient_id, program_id, receipt_no, subtotal, discount_total, subsidy_total, total,
                          payment_method, payment_ref, amount_tendered, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, COALESCE(?, datetime('now')))`,
      pharmacyId, user.id, q.patient_id, q.program?.id ?? null, receipt_no, q.subtotal, q.discount_total, q.subsidy_total, q.total,
      method, body.payment_ref ? String(body.payment_ref).slice(0, 64) : null, tendered, createdAt,
    );

    for (const { line, parts } of allocations) {
      // Spread the line subsidy across batch parts in proportion to quantity.
      let subsidyLeft = line.subsidy;
      parts.forEach((p, i) => {
        const sub = i === parts.length - 1 ? subsidyLeft : Math.round((line.subsidy * p.qty) / line.quantity);
        subsidyLeft -= sub;
        db.run('UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?', p.qty, p.batch.id);
        db.run(
          `INSERT INTO sale_items (sale_id, product_id, batch_id, quantity, unit_price, unit_cost, line_total, subsidy, days_supply)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          sale.id, line.product_id, p.batch.id, p.qty, line.unit_price, p.batch.cost_price, line.unit_price * p.qty, sub, line.days_supply,
        );
        db.run(
          `INSERT INTO stock_movements (pharmacy_id, product_id, batch_id, type, quantity, reason, user_id, created_at)
           VALUES (?,?,?,'sale',?,?,?, COALESCE(?, datetime('now')))`,
          pharmacyId, line.product_id, p.batch.id, -p.qty, receipt_no, user.id, createdAt,
        );
      });
    }
    return getSale(db, sale.id);
  });
}

export function getSale(db, id) {
  const sale = db.get(
    `SELECT s.*, u.name AS cashier_name, pt.name AS patient_name, pt.phone AS patient_phone, pr.name AS program_name,
            ph.name AS pharmacy_name, ph.address AS pharmacy_address, ph.town AS pharmacy_town, ph.district AS pharmacy_district,
            ph.phone AS pharmacy_phone, ph.tin AS pharmacy_tin, ph.nda_license AS pharmacy_nda_license
       FROM sales s
       JOIN pharmacies ph ON ph.id = s.pharmacy_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN patients pt ON pt.id = s.patient_id
       LEFT JOIN programs pr ON pr.id = s.program_id
      WHERE s.id = ?`,
    id,
  );
  if (!sale) return null;
  sale.items = db.all(
    `SELECT si.*, p.name, p.strength, p.form, b.batch_no, b.expiry_date
       FROM sale_items si JOIN products p ON p.id = si.product_id LEFT JOIN inventory_batches b ON b.id = si.batch_id
      WHERE si.sale_id = ? ORDER BY si.id`,
    id,
  );
  sale.voided = !!sale.voided;
  if (sale.amount_tendered != null) sale.change_due = Math.max(0, sale.amount_tendered - sale.total);
  return sale;
}

/** Void a sale and return stock to the batches it came from. */
export function voidSale(db, { sale, user, reason }) {
  if (sale.voided) throw conflict('Sale is already voided');
  if (sale.program_id) {
    const claimed = db.get(
      `SELECT 1 FROM claims WHERE pharmacy_id = ? AND program_id = ? AND status != 'rejected'
          AND period = strftime('%Y-%m', ?, ${EAT})`,
      sale.pharmacy_id, sale.program_id, sale.created_at,
    );
    if (claimed) throw conflict('This sale is part of a submitted subsidy claim and cannot be voided');
  }
  return db.tx(() => {
    for (const it of sale.items) {
      if (it.batch_id) db.run('UPDATE inventory_batches SET quantity = quantity + ? WHERE id = ?', it.quantity, it.batch_id);
      db.run(
        `INSERT INTO stock_movements (pharmacy_id, product_id, batch_id, type, quantity, reason, user_id)
         VALUES (?,?,?,'void',?,?,?)`,
        sale.pharmacy_id, it.product_id, it.batch_id, it.quantity, `Void ${sale.receipt_no}: ${reason}`, user.id,
      );
    }
    db.run('UPDATE sales SET voided = 1, void_reason = ?, voided_by = ? WHERE id = ?', reason, user.id, sale.id);
    return getSale(db, sale.id);
  });
}
