import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { int, str, bad, conflict, notFound, forbidden, EAT } from '../util.js';

/** Totals taken by one cashier during a shift (cash is what should be in the drawer). */
export function shiftTotals(db, shift, until = null) {
  const t = db.get(
    `SELECT COUNT(*) AS sales,
            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total END), 0) AS cash,
            COALESCE(SUM(CASE WHEN payment_method = 'mtn_momo' THEN total END), 0) AS mtn_momo,
            COALESCE(SUM(CASE WHEN payment_method = 'airtel_money' THEN total END), 0) AS airtel_money,
            COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total END), 0) AS card,
            COALESCE(SUM(subsidy_total), 0) AS subsidy
       FROM sales WHERE pharmacy_id = ? AND user_id = ? AND voided = 0
        AND created_at >= ? AND created_at <= COALESCE(?, datetime('now'))`,
    shift.pharmacy_id, shift.user_id, shift.opened_at, until,
  );
  return { ...t, expected_cash: shift.opening_float + t.cash };
}

/** Parse a pasted statement: one transaction per line, "reference, amount[, time]". Headers and junk lines are skipped. */
export function parseStatement(text) {
  const out = [];
  // reference, amount (may contain thousands commas), optional time — separated by comma, semicolon or tab.
  const re = /^\s*"?([^,;\t"]+?)"?\s*[,;\t]\s*"?(?:UGX\s*)?(\d[\d,]*(?:\.\d+)?)"?(?:\s*[,;\t]\s*"?([^"]*)"?)?\s*$/i;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.match(re);
    if (!m) continue;
    const ref = m[1].trim();
    const amount = Number(m[2].replace(/,/g, ''));
    if (!/\d/.test(ref) || !Number.isFinite(amount) || amount <= 0) continue;
    out.push({ reference: ref.slice(0, 64), amount: Math.round(amount), txn_time: m[3]?.trim() || null });
  }
  return out;
}

export default function cashRoutes(db) {
  const r = Router();

  r.get('/current', (req, res) => {
    const ph = pharmacyScope(req);
    const shift = db.get("SELECT * FROM shifts WHERE pharmacy_id = ? AND user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", ph, req.user.id);
    res.json(shift ? { ...shift, totals: shiftTotals(db, shift) } : null);
  });

  r.post('/open', (req, res) => {
    const ph = pharmacyScope(req);
    if (db.get("SELECT 1 FROM shifts WHERE pharmacy_id = ? AND user_id = ? AND status = 'open'", ph, req.user.id)) throw conflict('You already have an open shift');
    const float = int(req.body, 'opening_float', { required: false, min: 0 }) ?? 0;
    const { id } = db.run('INSERT INTO shifts (pharmacy_id, user_id, opening_float) VALUES (?,?,?)', ph, req.user.id, float);
    res.status(201).json(db.get('SELECT * FROM shifts WHERE id = ?', id));
  });

  r.post('/close', (req, res) => {
    const ph = pharmacyScope(req);
    const shift = db.get("SELECT * FROM shifts WHERE pharmacy_id = ? AND user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", ph, req.user.id);
    if (!shift) throw notFound('Open shift');
    const counted = int(req.body, 'counted_cash', { min: 0 });
    const t = shiftTotals(db, shift);
    db.run(
      `UPDATE shifts SET status = 'closed', closed_at = datetime('now'), expected_cash = ?, counted_cash = ?, variance = ?,
              momo_total = ?, airtel_total = ?, sales_count = ?, notes = ? WHERE id = ?`,
      t.expected_cash, counted, counted - t.expected_cash, t.mtn_momo, t.airtel_money, t.sales,
      str(req.body, 'notes', { required: false, max: 500 }), shift.id,
    );
    res.json(db.get('SELECT * FROM shifts WHERE id = ?', shift.id));
  });

  r.get('/shifts', allow('admin', 'owner', 'pharmacist'), (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const rows = db.all(
      `SELECT sh.*, u.name AS user_name, ph.name AS pharmacy_name FROM shifts sh JOIN users u ON u.id = sh.user_id
         JOIN pharmacies ph ON ph.id = sh.pharmacy_id
        WHERE (? IS NULL OR sh.pharmacy_id = ?) ORDER BY sh.opened_at DESC LIMIT 200`,
      ph, ph,
    );
    res.json(rows.map((s) => (s.status === 'open' ? { ...s, totals: shiftTotals(db, s) } : s)));
  });

  /* ---------- Mobile money reconciliation ---------- */

  /** Mobile-money sales and whether each has been matched to the provider statement. */
  r.get('/momo', allow('admin', 'owner', 'pharmacist'), (req, res) => {
    const ph = pharmacyScope(req);
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
    const sales = db.all(
      `SELECT s.id, s.receipt_no, s.created_at, s.total, s.payment_method, s.payment_ref, s.payment_verified, u.name AS cashier
         FROM sales s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.pharmacy_id = ? AND s.voided = 0 AND s.payment_method IN ('mtn_momo','airtel_money') AND s.total > 0
          AND date(s.created_at, ${EAT}) >= date('now', ?)
        ORDER BY s.payment_verified, s.created_at DESC`,
      ph, `-${days} days`,
    );
    const unmatched_lines = db.all(
      'SELECT * FROM momo_statement_lines WHERE pharmacy_id = ? AND matched_sale_id IS NULL ORDER BY imported_at DESC LIMIT 200',
      ph,
    );
    const unverified = sales.filter((s) => !s.payment_verified);
    res.json({
      days, sales, unmatched_lines,
      summary: {
        total: sales.reduce((a, s) => a + s.total, 0),
        verified: sales.filter((s) => s.payment_verified).reduce((a, s) => a + s.total, 0),
        unverified: unverified.reduce((a, s) => a + s.total, 0),
        unverified_count: unverified.length,
      },
    });
  });

  /** Import a statement (pasted CSV from the MTN/Airtel merchant portal) and match by transaction ID + amount. */
  r.post('/momo/import', allow('admin', 'owner', 'pharmacist'), (req, res) => {
    const ph = pharmacyScope(req);
    const provider = req.body.provider;
    if (!['mtn_momo', 'airtel_money'].includes(provider)) throw bad('provider must be mtn_momo or airtel_money');
    const lines = parseStatement(req.body.text);
    if (!lines.length) throw bad('No transactions found. Paste lines like: MP241105.1203.C12345, 8000');
    let matched = 0;
    let mismatched = 0;
    const problems = [];
    db.tx(() => {
      for (const l of lines) {
        db.run(
          `INSERT INTO momo_statement_lines (pharmacy_id, provider, reference, amount, txn_time) VALUES (?,?,?,?,?)
           ON CONFLICT(pharmacy_id, provider, reference) DO NOTHING`,
          ph, provider, l.reference, l.amount, l.txn_time,
        );
        const line = db.get('SELECT * FROM momo_statement_lines WHERE pharmacy_id = ? AND provider = ? AND reference = ?', ph, provider, l.reference);
        if (line.matched_sale_id) continue;
        const sale = db.get(
          "SELECT id, total, receipt_no FROM sales WHERE pharmacy_id = ? AND payment_method = ? AND voided = 0 AND payment_ref = ? COLLATE NOCASE",
          ph, provider, l.reference,
        );
        if (!sale) continue;
        if (sale.total !== line.amount) {
          mismatched++;
          problems.push(`${sale.receipt_no}: receipt says ${sale.total}, statement says ${line.amount}`);
          continue;
        }
        db.run('UPDATE momo_statement_lines SET matched_sale_id = ? WHERE id = ?', sale.id, line.id);
        db.run('UPDATE sales SET payment_verified = 1 WHERE id = ?', sale.id);
        matched++;
      }
    });
    res.json({ imported: lines.length, matched, mismatched, problems });
  });

  r.post('/momo/:saleId/verify', allow('admin', 'owner'), (req, res) => {
    const sale = db.get('SELECT id, pharmacy_id FROM sales WHERE id = ?', Number(req.params.saleId));
    if (!sale) throw notFound('Sale');
    if (req.user.role !== 'admin' && sale.pharmacy_id !== req.user.pharmacy_id) throw forbidden();
    db.run('UPDATE sales SET payment_verified = 1 WHERE id = ?', sale.id);
    res.json({ ok: true });
  });

  return r;
}
