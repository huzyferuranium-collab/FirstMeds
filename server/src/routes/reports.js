import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { EAT, today, addDays, isDate } from '../util.js';
import { stockSummary } from './inventory.js';
import { dueRefills } from './reminders.js';

function range(req) {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 366);
  const to = isDate(req.query.to) ? req.query.to : today();
  const from = isDate(req.query.from) ? req.query.from : addDays(to, -(days - 1));
  return { from, to };
}

/** Core sales metrics; pharmacyId null = whole network. */
export function salesMetrics(db, pharmacyId, from, to) {
  const scope = `s.voided = 0 AND (? IS NULL OR s.pharmacy_id = ?) AND date(s.created_at, ${EAT}) BETWEEN ? AND ?`;
  const p = [pharmacyId, pharmacyId, from, to];
  const totals = db.get(
    `SELECT COUNT(*) AS sales, COALESCE(SUM(total),0) AS collected, COALESCE(SUM(subtotal),0) AS gross,
            COALESCE(SUM(subsidy_total),0) AS subsidy, COALESCE(SUM(discount_total),0) AS discount,
            COUNT(DISTINCT patient_id) AS patients
       FROM sales s WHERE ${scope}`,
    ...p,
  );
  const cost = db.get(
    `SELECT COALESCE(SUM(si.unit_cost * si.quantity),0) AS cogs FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${scope}`,
    ...p,
  ).cogs;
  totals.revenue = totals.gross - totals.discount; // includes subsidy reimbursable by programs
  totals.gross_margin = totals.revenue - cost;
  totals.avg_basket = totals.sales ? Math.round(totals.gross / totals.sales) : 0;

  const daily = db.all(
    `SELECT date(s.created_at, ${EAT}) AS day, COUNT(*) AS sales, SUM(s.subtotal - s.discount_total) AS revenue, SUM(s.subsidy_total) AS subsidy
       FROM sales s WHERE ${scope} GROUP BY day ORDER BY day`,
    ...p,
  );
  // Fill gaps so charts have one point per day.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const series = [];
  for (let d = from; d <= to; d = addDays(d, 1)) series.push(byDay.get(d) || { day: d, sales: 0, revenue: 0, subsidy: 0 });

  const top_products = db.all(
    `SELECT p.id, p.name, p.strength, SUM(si.quantity) AS units, SUM(si.line_total) AS revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
      WHERE ${scope} GROUP BY p.id ORDER BY revenue DESC LIMIT 10`,
    ...p,
  );
  const categories = db.all(
    `SELECT p.category, SUM(si.quantity) AS units, SUM(si.line_total) AS revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
      WHERE ${scope} GROUP BY p.category ORDER BY revenue DESC`,
    ...p,
  );
  const payments = db.all(
    `SELECT payment_method, COUNT(*) AS sales, SUM(total) AS amount FROM sales s WHERE ${scope} GROUP BY payment_method ORDER BY amount DESC`,
    ...p,
  );
  const hours = db.all(
    `SELECT CAST(strftime('%H', s.created_at, ${EAT}) AS INTEGER) AS hour, COUNT(*) AS sales FROM sales s WHERE ${scope} GROUP BY hour ORDER BY hour`,
    ...p,
  );
  return { from, to, totals, series, top_products, categories, payments, hours };
}

export default function reportRoutes(db) {
  const r = Router();

  r.get('/dashboard', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const { from, to } = range(req);
    const m = salesMetrics(db, ph, from, to);
    const t = today();
    m.today = salesMetrics(db, ph, t, t).totals;
    if (ph) {
      const stock = stockSummary(db, ph);
      m.stock = {
        products_in_stock: stock.filter((s) => s.in_stock > 0).length,
        low_stock: stock.filter((s) => s.in_stock > 0 && s.in_stock <= s.reorder_level).length,
        out_of_stock: db.get(
          `SELECT COUNT(*) n FROM (SELECT product_id, SUM(CASE WHEN expiry_date >= ? THEN quantity ELSE 0 END) q
             FROM inventory_batches WHERE pharmacy_id = ? GROUP BY product_id) WHERE q = 0`,
          t, ph,
        ).n,
        expiring_90d: db.get(
          'SELECT COUNT(*) n FROM inventory_batches WHERE pharmacy_id = ? AND quantity > 0 AND expiry_date BETWEEN ? AND ?',
          ph, t, addDays(t, 90),
        ).n,
        value: stock.reduce((a, s) => a + s.stock_value, 0),
      };
      m.refills_due = dueRefills(db, ph).length;
    }
    res.json(m);
  });

  // HQ network view: districts, facility league table, program reach.
  r.get('/network', allow('admin'), (req, res) => {
    const { from, to } = range(req);
    const scope = `s.voided = 0 AND date(s.created_at, ${EAT}) BETWEEN ? AND ?`;
    res.json({
      ...salesMetrics(db, null, from, to),
      districts: db.all(
        `SELECT ph.district, COUNT(DISTINCT ph.id) AS facilities, COUNT(s.id) AS sales,
                COALESCE(SUM(s.subtotal - s.discount_total),0) AS revenue, COALESCE(SUM(s.subsidy_total),0) AS subsidy,
                COUNT(DISTINCT s.patient_id) AS patients
           FROM pharmacies ph LEFT JOIN sales s ON s.pharmacy_id = ph.id AND ${scope}
          WHERE ph.status = 'active' GROUP BY ph.district ORDER BY revenue DESC`,
        from, to,
      ),
      facilities: db.all(
        `SELECT ph.id, ph.name, ph.type, ph.district, ph.status, COUNT(s.id) AS sales,
                COALESCE(SUM(s.subtotal - s.discount_total),0) AS revenue, COALESCE(SUM(s.subsidy_total),0) AS subsidy,
                MAX(s.created_at) AS last_sale
           FROM pharmacies ph LEFT JOIN sales s ON s.pharmacy_id = ph.id AND ${scope}
          GROUP BY ph.id ORDER BY revenue DESC`,
        from, to,
      ),
      programs: db.all(
        `SELECT pr.id, pr.name, pr.code,
                (SELECT COUNT(*) FROM enrollments e WHERE e.program_id = pr.id AND e.status = 'active') AS enrolled,
                COUNT(s.id) AS visits, COALESCE(SUM(s.subsidy_total),0) AS subsidy
           FROM programs pr LEFT JOIN sales s ON s.program_id = pr.id AND ${scope}
          GROUP BY pr.id ORDER BY subsidy DESC`,
        from, to,
      ),
      // Network-wide stock-outs of essential medicines (facilities with zero sellable stock).
      stockouts: db.all(
        `SELECT p.id, p.name, p.strength,
                SUM(CASE WHEN COALESCE((SELECT SUM(b.quantity) FROM inventory_batches b
                     WHERE b.product_id = p.id AND b.pharmacy_id = ph.id AND b.expiry_date >= ?),0) = 0 THEN 1 ELSE 0 END) AS facilities_out
           FROM products p CROSS JOIN pharmacies ph
          WHERE p.is_essential = 1 AND p.active = 1 AND ph.status = 'active'
          GROUP BY p.id HAVING facilities_out > 0 ORDER BY facilities_out DESC LIMIT 15`,
        today(),
      ),
    });
  });

  // CSV export of sales lines for accounting / donors.
  r.get('/sales.csv', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const { from, to } = range(req);
    const rows = db.all(
      `SELECT s.receipt_no, datetime(s.created_at, ${EAT}) AS time_eat, ph.name AS pharmacy, ph.district, p.name AS product,
              si.quantity, si.unit_price, si.line_total, si.subsidy, s.payment_method, pr.code AS program, s.voided
         FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN pharmacies ph ON ph.id = s.pharmacy_id
         JOIN products p ON p.id = si.product_id LEFT JOIN programs pr ON pr.id = s.program_id
        WHERE (? IS NULL OR s.pharmacy_id = ?) AND date(s.created_at, ${EAT}) BETWEEN ? AND ?
        ORDER BY s.created_at`,
      ph, ph, from, to,
    );
    const cols = ['receipt_no', 'time_eat', 'pharmacy', 'district', 'product', 'quantity', 'unit_price', 'line_total', 'subsidy', 'payment_method', 'program', 'voided'];
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="firstmeds-sales-${from}-to-${to}.csv"`);
    res.send(csv);
  });

  return r;
}
