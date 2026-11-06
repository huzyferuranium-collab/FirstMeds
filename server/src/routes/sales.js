import { Router } from 'express';
import { allow, pharmacyScope } from '../auth.js';
import { str, notFound, forbidden, isDate, EAT } from '../util.js';
import { createSale, quoteSale, getSale, voidSale } from '../services/sales.js';

export default function salesRoutes(db) {
  const r = Router();

  r.post('/quote', (req, res) => {
    const ph = pharmacyScope(req);
    const q = quoteSale(db, ph, req.body);
    res.json({ ...q, program: q.program ? { id: q.program.id, name: q.program.name, discount_percent: q.program.discount_percent } : null });
  });

  r.post('/', (req, res) => {
    const ph = pharmacyScope(req);
    res.status(201).json(createSale(db, { pharmacyId: ph, user: req.user, body: req.body }));
  });

  r.get('/', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const where = [];
    const params = [];
    if (ph) { where.push('s.pharmacy_id = ?'); params.push(ph); }
    if (isDate(req.query.from)) { where.push(`date(s.created_at, ${EAT}) >= ?`); params.push(req.query.from); }
    if (isDate(req.query.to)) { where.push(`date(s.created_at, ${EAT}) <= ?`); params.push(req.query.to); }
    if (req.query.q) { where.push('(s.receipt_no LIKE ? OR pt.name LIKE ? OR s.payment_ref LIKE ?)'); const l = `%${req.query.q}%`; params.push(l, l, l); }
    if (req.query.patient_id) { where.push('s.patient_id = ?'); params.push(Number(req.query.patient_id)); }
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    res.json(db.all(
      `SELECT s.id, s.receipt_no, s.created_at, s.total, s.subtotal, s.subsidy_total, s.discount_total, s.payment_method,
              s.payment_ref, s.voided, s.pharmacy_id, ph.name AS pharmacy_name, u.name AS cashier_name,
              pt.name AS patient_name, pr.name AS program_name,
              (SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id) AS units
         FROM sales s JOIN pharmacies ph ON ph.id = s.pharmacy_id
         LEFT JOIN users u ON u.id = s.user_id LEFT JOIN patients pt ON pt.id = s.patient_id
         LEFT JOIN programs pr ON pr.id = s.program_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY s.created_at DESC, s.id DESC LIMIT ${limit}`,
      ...params,
    ));
  });

  const load = (req) => {
    const sale = getSale(db, Number(req.params.id));
    if (!sale) throw notFound('Sale');
    if (req.user.role !== 'admin' && sale.pharmacy_id !== req.user.pharmacy_id) throw forbidden();
    return sale;
  };

  r.get('/:id', (req, res) => res.json(load(req)));

  r.post('/:id/void', allow('admin', 'owner', 'pharmacist'), (req, res) => {
    const sale = load(req);
    res.json(voidSale(db, { sale, user: req.user, reason: str(req.body, 'reason', { max: 200 }) }));
  });

  return r;
}
