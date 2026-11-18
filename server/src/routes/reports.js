import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { EAT, today, addDays, isDate } from '../util.js';
import { stockSummary } from './inventory.js';
import { dueRefills } from './reminders.js';
import { reorderSuggestions } from './purchasing.js';

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
          `SELECT COUNT(*) n FROM (SELECT product_id, SUM(CASE WHEN expiry_date >= ? AND quarantined = 0 THEN quantity ELSE 0 END) q
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

  /**
   * Pharmacy health check: one score per common problem area, for owners and for HQ field visits.
   * Each check returns status good | watch | act, a headline number and a short explanation.
   */
  r.get('/health', (req, res) => {
    const ph = pharmacyScope(req);
    const t = today();
    const d30 = addDays(t, -29);
    const one = (sql, ...p) => db.get(sql, ...p);
    const stock = stockSummary(db, ph);
    const carried = stock.filter((s) => s.in_stock > 0 || s.expired_qty > 0 || s.quarantined_qty > 0);
    const out = carried.filter((s) => s.in_stock === 0).length;
    const low = carried.filter((s) => s.in_stock > 0 && s.in_stock <= s.reorder_level).length;
    const expiring = one(
      `SELECT COUNT(*) n, COALESCE(SUM(quantity * cost_price),0) v FROM inventory_batches
        WHERE pharmacy_id = ? AND quantity > 0 AND quarantined = 0 AND expiry_date BETWEEN ? AND ?`, ph, t, addDays(t, 60));
    const expired = one(
      'SELECT COALESCE(SUM(quantity * cost_price),0) v FROM inventory_batches WHERE pharmacy_id = ? AND quantity > 0 AND quarantined = 0 AND expiry_date < ?', ph, t);
    const quarantine = one('SELECT COUNT(*) n, COALESCE(SUM(quantity),0) q FROM inventory_batches WHERE pharmacy_id = ? AND quantity > 0 AND quarantined = 1', ph);
    const reports = one("SELECT COUNT(*) n FROM quality_reports WHERE pharmacy_id = ? AND created_at >= datetime('now','-90 days')", ph).n;
    const m = salesMetrics(db, ph, d30, t).totals;
    const prevM = salesMetrics(db, ph, addDays(d30, -30), addDays(d30, -1)).totals;
    const margin = m.revenue ? Math.round((m.gross_margin / m.revenue) * 100) : 0;
    const subsidyClaimable = one(
      `SELECT COALESCE(SUM(s.subsidy_total),0) v FROM sales s WHERE s.pharmacy_id = ? AND s.voided = 0 AND s.subsidy_total > 0
          AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.pharmacy_id = s.pharmacy_id AND c.program_id = s.program_id
                           AND c.period = strftime('%Y-%m', s.created_at, ${EAT}) AND c.status != 'rejected')
          AND strftime('%Y-%m', s.created_at, ${EAT}) < strftime('%Y-%m', 'now', ${EAT})`, ph).v;
    const payables = one(
      "SELECT COALESCE(SUM(total - paid),0) v, COALESCE(SUM(CASE WHEN due_date < ? THEN total - paid END),0) overdue FROM purchase_orders WHERE pharmacy_id = ? AND status = 'received'", t, ph);
    const rxSales = one(
      `SELECT COUNT(DISTINCT s.id) n, COUNT(DISTINCT rx.sale_id) withrx FROM sales s
         JOIN sale_items si ON si.sale_id = s.id JOIN products p ON p.id = si.product_id AND p.requires_prescription = 1
         LEFT JOIN prescriptions rx ON rx.sale_id = s.id
        WHERE s.pharmacy_id = ? AND s.voided = 0 AND date(s.created_at, ${EAT}) >= ?`, ph, d30);
    const malaria = one(
      `SELECT COUNT(*) n, SUM(CASE WHEN malaria_test IN ('tested_here','tested_elsewhere') THEN 1 ELSE 0 END) tested FROM sales s
        WHERE s.pharmacy_id = ? AND s.voided = 0 AND date(s.created_at, ${EAT}) >= ?
          AND EXISTS (SELECT 1 FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id AND p.category = 'Antimalarial')`, ph, d30);
    const cash = one(
      `SELECT COUNT(*) n, COALESCE(SUM(ABS(variance)),0) absvar, COALESCE(SUM(variance),0) net,
              SUM(CASE WHEN ABS(variance) > 2000 THEN 1 ELSE 0 END) big
         FROM shifts WHERE pharmacy_id = ? AND status = 'closed' AND date(closed_at, ${EAT}) >= ?`, ph, d30);
    const momo = one(
      `SELECT COUNT(*) n, SUM(payment_verified) v, COALESCE(SUM(CASE WHEN payment_verified = 0 THEN total END),0) unv FROM sales
        WHERE pharmacy_id = ? AND voided = 0 AND payment_method IN ('mtn_momo','airtel_money') AND total > 0 AND date(created_at, ${EAT}) >= ?`, ph, d30);
    const voids = one(`SELECT COUNT(*) n FROM sales WHERE pharmacy_id = ? AND voided = 1 AND date(created_at, ${EAT}) >= ?`, ph, d30).n;
    const offline = one(`SELECT COUNT(*) n FROM sales WHERE pharmacy_id = ? AND offline = 1 AND date(created_at, ${EAT}) >= ?`, ph, d30).n;
    const reorder = reorderSuggestions(db, ph);
    const suppliers = db.all(
      `SELECT DISTINCT b.supplier FROM inventory_batches b WHERE b.pharmacy_id = ? AND b.received_at >= datetime('now','-90 days') AND b.supplier IS NOT NULL`, ph).length;
    const savings = db.all(
      `SELECT pi.product_id, pi.quantity, pi.received_qty, pi.unit_cost, (SELECT MIN(price) FROM supplier_prices sp JOIN suppliers su ON su.id = sp.supplier_id
               WHERE sp.product_id = pi.product_id AND su.active = 1 AND sp.in_stock = 1) AS best
         FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.pharmacy_id = ? AND po.status = 'received' AND po.received_at >= datetime('now','-90 days')`, ph)
      .reduce((a, x) => a + (x.best != null && x.unit_cost > x.best ? (x.unit_cost - x.best) * x.received_qty || (x.unit_cost - x.best) * x.quantity : 0), 0);
    const refills = dueRefills(db, ph).length;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 100);
    const status = (good, watch) => (good ? 'good' : watch ? 'watch' : 'act');

    const checks = [
      { key: 'quality', title: 'Fake & substandard medicines', status: status(!quarantine.n && !reports, !quarantine.n),
        value: quarantine.n ? `${quarantine.n} batch${quarantine.n > 1 ? 'es' : ''} quarantined` : 'No alerts',
        detail: `${reports} quality report(s) in 90 days. Batches flagged anywhere in the network are blocked from sale automatically.`, link: '/app/quality' },
      { key: 'stock', title: 'Stock-outs', status: status(out === 0 && low <= 2, out <= 2),
        value: `${out} out · ${low} low`, detail: `${reorder.filter((x) => x.urgent).length} item(s) need ordering now, based on how fast they sell.`, link: '/app/purchasing' },
      { key: 'expiry', title: 'Expiry losses', status: status(!expired.v && expiring.n <= 3, !expired.v),
        value: `${expiring.n} batch(es) expire in 60 days`, detail: `UGX ${expiring.v.toLocaleString('en-UG')} at risk; UGX ${expired.v.toLocaleString('en-UG')} already expired on the shelf.`, link: '/app/inventory?filter=expiring' },
      { key: 'affordability', title: 'Patient affordability', status: status(m.subsidy > 0 && subsidyClaimable === 0, m.subsidy > 0),
        value: `UGX ${m.subsidy.toLocaleString('en-UG')} subsidies (30d)`, detail: subsidyClaimable ? `UGX ${subsidyClaimable.toLocaleString('en-UG')} from past months not yet claimed. Claim it now.` : 'All past subsidies are claimed.', link: '/app/claims' },
      { key: 'cashflow', title: 'Cash flow & margins', status: status(margin >= 25 && !payables.overdue, margin >= 18),
        value: `${margin}% gross margin`, detail: `Revenue ${m.revenue >= prevM.revenue ? 'up' : 'down'} ${pct(Math.abs(m.revenue - prevM.revenue), prevM.revenue || 1)}% vs previous 30 days. Supplier balance UGX ${payables.v.toLocaleString('en-UG')} (${payables.overdue ? `UGX ${payables.overdue.toLocaleString('en-UG')} overdue` : 'none overdue'}).`, link: '/app/reports' },
      { key: 'compliance', title: 'Regulation & prescriptions', status: status(pct(rxSales.withrx, rxSales.n) >= 95, pct(rxSales.withrx, rxSales.n) >= 80),
        value: `${pct(rxSales.withrx, rxSales.n)}% of Rx sales documented`, detail: `${rxSales.withrx} of ${rxSales.n} prescription-only sales in 30 days have a prescription on file. Ready for an NDA inspection.`, link: '/app/prescriptions' },
      { key: 'dispensing', title: 'Good dispensing (test before treat)', status: status(pct(malaria.tested || 0, malaria.n) >= 80, pct(malaria.tested || 0, malaria.n) >= 60),
        value: `${pct(malaria.tested || 0, malaria.n)}% of malaria treatments tested`, detail: `${malaria.tested || 0} of ${malaria.n} antimalarial sales were backed by a malaria test.`, link: '/app/prescriptions?tab=dispensing' },
      { key: 'theft', title: 'Cash leakage & theft', status: status(!cash.big && momo.unv === 0 && voids <= 3, !cash.big || momo.unv < 50000),
        value: cash.n ? `Net till ${cash.net >= 0 ? '+' : ''}${cash.net.toLocaleString('en-UG')} over ${cash.n} shifts` : 'No shifts closed',
        detail: `${cash.big || 0} shift(s) off by more than UGX 2,000; ${momo.n - (momo.v || 0)} mobile money payment(s) (UGX ${momo.unv.toLocaleString('en-UG')}) not yet matched to the statement; ${voids} void(s).`, link: '/app/cash' },
      { key: 'offline', title: 'Internet & power cuts', status: 'good',
        value: offline ? `${offline} sale(s) made offline` : 'Offline-ready', detail: 'Sales keep working without internet and sync automatically when the connection returns.', link: '/app/pos' },
      { key: 'suppliers', title: 'Supplier prices & reliability', status: status(savings < 20000, savings < 100000),
        value: savings ? `UGX ${Math.round(savings).toLocaleString('en-UG')} could have been saved` : 'Buying at best prices',
        detail: `You bought from ${suppliers} supplier(s) in 90 days. Compare prices across wholesalers before each order.`, link: '/app/purchasing?tab=compare' },
      { key: 'retention', title: 'Patients returning for refills', status: status(refills <= 5, refills <= 15),
        value: `${refills} refill(s) due`, detail: 'Chronic patients whose medicine is running out. Send an SMS reminder in one tap.', link: '/app/reminders' },
    ];
    const score = Math.round((checks.reduce((a, c) => a + (c.status === 'good' ? 1 : c.status === 'watch' ? 0.5 : 0), 0) / checks.length) * 100);
    res.json({ score, checks, generated_at: new Date().toISOString() });
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
