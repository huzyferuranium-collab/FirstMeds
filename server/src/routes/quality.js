import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { str, int, bad, notFound, forbidden, isDate, EAT } from '../util.js';

const ISSUES = ['suspected_fake', 'poor_quality', 'packaging', 'adverse_reaction', 'unregistered'];
const STATUSES = ['open', 'investigating', 'reported_to_nda', 'cleared', 'confirmed'];

/** Quarantine (or release) every batch with this product + batch number across the network. */
function setNetworkQuarantine(db, productId, batchNo, on) {
  return db.run(
    'UPDATE inventory_batches SET quarantined = ? WHERE product_id = ? AND batch_no = ? COLLATE NOCASE',
    on ? 1 : 0, productId, batchNo,
  ).changes;
}

export default function qualityRoutes(db) {
  const r = Router();

  /**
   * Verify a medicine at the counter or on delivery: look it up by barcode or name and check
   * its registration status and any open quality alerts for the batch.
   */
  r.get('/verify', (req, res) => {
    const code = String(req.query.code || '').trim();
    const batch = String(req.query.batch || '').trim();
    if (!code) throw bad('Enter a barcode or product name');
    const products = db.all(
      `SELECT id, name, generic_name, strength, form, barcode, nda_reg_no, nda_status, requires_prescription
         FROM products WHERE barcode = ? OR name LIKE ? OR generic_name LIKE ? ORDER BY (barcode = ?) DESC, name LIMIT 5`,
      code, `%${code}%`, `%${code}%`, code,
    );
    const results = products.map((p) => {
      const alerts = db.all(
        `SELECT q.id, q.batch_no, q.issue_type, q.status, q.created_at, ph.district
           FROM quality_reports q JOIN pharmacies ph ON ph.id = q.pharmacy_id
          WHERE q.product_id = ? AND q.status IN ('open','investigating','reported_to_nda','confirmed')
            ${batch ? 'AND q.batch_no = ? COLLATE NOCASE' : ''}
          ORDER BY q.created_at DESC LIMIT 10`,
        ...(batch ? [p.id, batch] : [p.id]),
      );
      let verdict = 'ok';
      if (p.nda_status === 'suspended') verdict = 'suspended';
      else if (p.nda_status === 'unverified' || !p.nda_reg_no) verdict = 'unverified';
      if (batch && alerts.length) verdict = alerts.some((a) => a.status === 'confirmed') ? 'confirmed_fake' : 'batch_alert';
      return { ...p, alerts, verdict };
    });
    res.json({ code, batch: batch || null, found: results.length > 0, results });
  });

  r.get('/', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    res.json(db.all(
      `SELECT q.*, p.name AS product_name, p.strength, ph.name AS pharmacy_name, ph.district, u.name AS reported_by,
              (SELECT COUNT(*) FROM inventory_batches b WHERE b.product_id = q.product_id AND b.batch_no = q.batch_no COLLATE NOCASE AND b.quarantined = 1 AND b.quantity > 0) AS quarantined_batches,
              (SELECT COALESCE(SUM(b.quantity),0) FROM inventory_batches b WHERE b.product_id = q.product_id AND b.batch_no = q.batch_no COLLATE NOCASE AND b.quarantined = 1) AS quarantined_units
         FROM quality_reports q JOIN products p ON p.id = q.product_id JOIN pharmacies ph ON ph.id = q.pharmacy_id
         LEFT JOIN users u ON u.id = q.created_by
        WHERE (? IS NULL OR q.pharmacy_id = ? OR q.status IN ('open','investigating','reported_to_nda','confirmed'))
        ORDER BY (q.status IN ('open','investigating')) DESC, q.created_at DESC LIMIT 300`,
      ph, ph,
    ).map((x) => ({ ...x, mine: !ph || x.pharmacy_id === ph })));
  });

  r.post('/', (req, res) => {
    const ph = pharmacyScope(req);
    const b = req.body || {};
    const productId = int(b, 'product_id', { min: 1 });
    const product = db.get('SELECT id, name FROM products WHERE id = ?', productId);
    if (!product) throw notFound('Product');
    if (!ISSUES.includes(b.issue_type)) throw bad(`issue_type must be one of ${ISSUES.join(', ')}`);
    let batchNo = str(b, 'batch_no', { required: false, max: 60 });
    let batchId = b.batch_id ? Number(b.batch_id) : null;
    let supplier = str(b, 'supplier', { required: false, max: 120 });
    if (batchId) {
      const batch = db.get('SELECT * FROM inventory_batches WHERE id = ? AND pharmacy_id = ?', batchId, ph);
      if (!batch) throw notFound('Batch');
      batchNo = batch.batch_no;
      supplier = supplier || batch.supplier;
    }
    if (!batchNo) throw bad('batch_no is required');
    const out = db.tx(() => {
      const { id } = db.run(
        `INSERT INTO quality_reports (pharmacy_id, product_id, batch_id, batch_no, supplier, issue_type, description, created_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        ph, productId, batchId, batchNo, supplier, b.issue_type, str(b, 'description', { max: 2000 }), req.user.id,
      );
      // Precaution: suspected fakes and unregistered products are pulled from sale across the whole network.
      const networkWide = b.issue_type === 'suspected_fake' || b.issue_type === 'unregistered';
      const quarantined = networkWide
        ? setNetworkQuarantine(db, productId, batchNo, true)
        : db.run('UPDATE inventory_batches SET quarantined = 1 WHERE pharmacy_id = ? AND product_id = ? AND batch_no = ? COLLATE NOCASE', ph, productId, batchNo).changes;
      return { id, quarantined_batches: quarantined, network_wide: networkWide };
    });
    res.status(201).json(out);
  });

  r.put('/:id', allow('admin'), (req, res) => {
    const q = db.get('SELECT * FROM quality_reports WHERE id = ?', Number(req.params.id));
    if (!q) throw notFound('Report');
    const status = req.body.status;
    if (!STATUSES.includes(status)) throw bad('Invalid status');
    db.tx(() => {
      db.run("UPDATE quality_reports SET status = ?, hq_note = COALESCE(?, hq_note), updated_at = datetime('now') WHERE id = ?",
        status, str(req.body, 'hq_note', { required: false, max: 1000 }), q.id);
      // Cleared: release the batch everywhere unless another open report still covers it.
      if (status === 'cleared') {
        const other = db.get(
          "SELECT 1 FROM quality_reports WHERE id != ? AND product_id = ? AND batch_no = ? COLLATE NOCASE AND status IN ('open','investigating','reported_to_nda','confirmed')",
          q.id, q.product_id, q.batch_no,
        );
        if (!other) setNetworkQuarantine(db, q.product_id, q.batch_no, false);
      }
      if (status === 'confirmed') setNetworkQuarantine(db, q.product_id, q.batch_no, true);
    });
    res.json(db.get('SELECT * FROM quality_reports WHERE id = ?', q.id));
  });

  /* ---------- Prescription register ---------- */
  r.get('/prescriptions', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const from = isDate(req.query.from) ? req.query.from : '0000-01-01';
    const to = isDate(req.query.to) ? req.query.to : '9999-12-31';
    res.json(db.all(
      `SELECT rx.*, s.receipt_no, s.voided, pt.name AS patient, ph.name AS pharmacy_name, u.name AS dispensed_by,
              (SELECT GROUP_CONCAT(p.name || ' ' || COALESCE(p.strength,'') || ' ×' || si.quantity, '; ')
                 FROM sale_items si JOIN products p ON p.id = si.product_id
                WHERE si.sale_id = rx.sale_id AND p.requires_prescription = 1) AS items
         FROM prescriptions rx LEFT JOIN sales s ON s.id = rx.sale_id LEFT JOIN patients pt ON pt.id = rx.patient_id
         JOIN pharmacies ph ON ph.id = rx.pharmacy_id LEFT JOIN users u ON u.id = rx.created_by
        WHERE (? IS NULL OR rx.pharmacy_id = ?) AND date(rx.created_at, ${EAT}) BETWEEN ? AND ?
        ORDER BY rx.created_at DESC LIMIT 1000`,
      ph, ph, from, to,
    ));
  });

  /* ---------- Dispensing quality: malaria testing rate ---------- */
  r.get('/dispensing', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    if (req.user.role === 'cashier') throw forbidden();
    res.json(db.all(
      `SELECT COALESCE(malaria_test, 'unknown') AS malaria_test, COUNT(*) AS sales FROM sales s
        WHERE s.voided = 0 AND (? IS NULL OR s.pharmacy_id = ?)
          AND EXISTS (SELECT 1 FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id AND p.category = 'Antimalarial')
          AND date(s.created_at, ${EAT}) >= date('now', '-30 days')
        GROUP BY 1 ORDER BY sales DESC`,
      ph, ph,
    ));
  });

  return r;
}
