import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { bad, notFound, conflict, str, EAT, today } from '../util.js';

/** Subsidy owed to a pharmacy per program for a month, from non-voided sales. */
function claimable(db, pharmacyId, period) {
  return db.all(
    `SELECT pr.id AS program_id, pr.name AS program_name, pr.sponsor, COUNT(s.id) AS sales_count,
            COALESCE(SUM(s.subsidy_total), 0) AS amount,
            (SELECT c.status FROM claims c WHERE c.pharmacy_id = ? AND c.program_id = pr.id AND c.period = ? AND c.status != 'rejected') AS claim_status
       FROM sales s JOIN programs pr ON pr.id = s.program_id
      WHERE s.pharmacy_id = ? AND s.voided = 0 AND s.subsidy_total > 0 AND strftime('%Y-%m', s.created_at, ${EAT}) = ?
      GROUP BY pr.id ORDER BY pr.name`,
    pharmacyId, period, pharmacyId, period,
  );
}

const validPeriod = (p) => typeof p === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

export default function claimRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const status = req.query.status;
    res.json(db.all(
      `SELECT c.*, pr.name AS program_name, pr.sponsor, ph.name AS pharmacy_name, ph.district, u.name AS submitted_by_name
         FROM claims c JOIN programs pr ON pr.id = c.program_id JOIN pharmacies ph ON ph.id = c.pharmacy_id
         LEFT JOIN users u ON u.id = c.submitted_by
        WHERE (? IS NULL OR c.pharmacy_id = ?) AND (? IS NULL OR c.status = ?)
        ORDER BY c.submitted_at DESC LIMIT 500`,
      ph, ph, status || null, status || null,
    ));
  });

  r.get('/preview', (req, res) => {
    const ph = pharmacyScope(req);
    const period = req.query.period || today().slice(0, 7);
    if (!validPeriod(period)) throw bad('period must be YYYY-MM');
    res.json({ period, programs: claimable(db, ph, period) });
  });

  r.post('/', allow('admin', 'owner'), (req, res) => {
    const ph = pharmacyScope(req);
    const period = req.body.period;
    if (!validPeriod(period)) throw bad('period must be YYYY-MM');
    if (period > today().slice(0, 7)) throw bad('Cannot claim for a future month');
    const rows = claimable(db, ph, period).filter((x) => x.amount > 0 && !x.claim_status);
    const only = req.body.program_id ? Number(req.body.program_id) : null;
    const toClaim = only ? rows.filter((x) => x.program_id === only) : rows;
    if (!toClaim.length) throw conflict('Nothing left to claim for this period');
    const created = db.tx(() => toClaim.map((x) => db.run(
      'INSERT INTO claims (pharmacy_id, program_id, period, amount, sales_count, submitted_by) VALUES (?,?,?,?,?,?)',
      ph, x.program_id, period, x.amount, x.sales_count, req.user.id,
    ).id));
    res.status(201).json({ created });
  });

  r.put('/:id/status', allow('admin'), (req, res) => {
    const claim = db.get('SELECT * FROM claims WHERE id = ?', Number(req.params.id));
    if (!claim) throw notFound('Claim');
    const status = req.body.status;
    const flow = { submitted: ['approved', 'rejected'], approved: ['paid', 'rejected'], paid: [], rejected: [] };
    if (!flow[claim.status].includes(status)) throw bad(`Cannot move a ${claim.status} claim to ${status}`);
    db.run(
      "UPDATE claims SET status = ?, note = COALESCE(?, note), decided_at = datetime('now') WHERE id = ?",
      status, str(req.body, 'note', { required: false, max: 500 }), claim.id,
    );
    res.json(db.get('SELECT * FROM claims WHERE id = ?', claim.id));
  });

  return r;
}
