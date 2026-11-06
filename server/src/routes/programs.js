import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { str, int, bool, bad, notFound, isDate } from '../util.js';

export default function programRoutes(db) {
  const r = Router();

  const withProducts = (p) => ({
    ...p,
    products: db.all(
      `SELECT pr.id, pr.name, pr.strength, pr.form FROM program_products pp JOIN products pr ON pr.id = pp.product_id
        WHERE pp.program_id = ? ORDER BY pr.name`,
      p.id,
    ),
  });

  r.get('/', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const rows = db.all(
      `SELECT p.*,
              (SELECT COUNT(*) FROM enrollments e JOIN patients pt ON pt.id = e.patient_id
                WHERE e.program_id = p.id AND e.status = 'active' AND (? IS NULL OR pt.pharmacy_id = ?)) AS enrolled,
              (SELECT COALESCE(SUM(subsidy_total),0) FROM sales s
                WHERE s.program_id = p.id AND s.voided = 0 AND (? IS NULL OR s.pharmacy_id = ?)) AS subsidy_total,
              (SELECT COUNT(*) FROM sales s
                WHERE s.program_id = p.id AND s.voided = 0 AND (? IS NULL OR s.pharmacy_id = ?)) AS visits
         FROM programs p ${req.query.active ? 'WHERE p.active = 1' : ''} ORDER BY p.active DESC, p.name`,
      ph, ph, ph, ph, ph, ph,
    );
    res.json(rows.map(withProducts));
  });

  const fields = (b) => {
    const start = b.start_date || null;
    const end = b.end_date || null;
    if ((start && !isDate(start)) || (end && !isDate(end))) throw bad('Dates must be YYYY-MM-DD');
    if (start && end && end < start) throw bad('End date is before start date');
    return [
      str(b, 'code', { max: 20 }).toUpperCase(), str(b, 'name', { max: 120 }), str(b, 'description', { required: false, max: 2000 }),
      str(b, 'sponsor', { required: false, max: 120 }), int(b, 'discount_percent', { min: 0, max: 100 }),
      int(b, 'max_subsidy_per_visit', { required: false, min: 0 }) ?? 0,
      b.requires_enrollment === undefined ? 1 : bool(b.requires_enrollment), b.active === undefined ? 1 : bool(b.active), start, end,
    ];
  };

  const setProducts = (id, ids) => {
    if (!Array.isArray(ids)) return;
    db.run('DELETE FROM program_products WHERE program_id = ?', id);
    for (const pid of ids) db.run('INSERT OR IGNORE INTO program_products (program_id, product_id) VALUES (?,?)', id, Number(pid));
  };

  r.post('/', allow('admin'), (req, res) => {
    const id = db.tx(() => {
      const { id } = db.run(
        `INSERT INTO programs (code, name, description, sponsor, discount_percent, max_subsidy_per_visit, requires_enrollment, active, start_date, end_date)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ...fields(req.body),
      );
      setProducts(id, req.body.product_ids);
      return id;
    });
    res.status(201).json(withProducts(db.get('SELECT * FROM programs WHERE id = ?', id)));
  });

  r.put('/:id', allow('admin'), (req, res) => {
    const id = Number(req.params.id);
    if (!db.get('SELECT 1 FROM programs WHERE id = ?', id)) throw notFound('Program');
    db.tx(() => {
      db.run(
        `UPDATE programs SET code=?, name=?, description=?, sponsor=?, discount_percent=?, max_subsidy_per_visit=?,
                requires_enrollment=?, active=?, start_date=?, end_date=? WHERE id = ?`,
        ...fields(req.body), id,
      );
      setProducts(id, req.body.product_ids);
    });
    res.json(withProducts(db.get('SELECT * FROM programs WHERE id = ?', id)));
  });

  return r;
}
