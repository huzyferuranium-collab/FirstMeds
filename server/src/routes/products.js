import { Router } from 'express';
import { allow } from '../auth.js';
import { str, int, bool, notFound } from '../util.js';

export default function productRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => {
    const q = `%${(req.query.q || '').trim()}%`;
    const rows = db.all(
      `SELECT * FROM products
        WHERE (name LIKE ? OR generic_name LIKE ? OR category LIKE ?) ${req.query.all ? '' : 'AND active = 1'}
        ORDER BY name LIMIT 500`,
      q, q, q,
    );
    res.json(rows);
  });

  r.get('/categories', (_req, res) => {
    res.json(db.all('SELECT DISTINCT category FROM products ORDER BY category').map((x) => x.category));
  });

  const fields = (b) => [
    str(b, 'name', { max: 160 }), str(b, 'generic_name', { required: false, max: 160 }), str(b, 'strength', { required: false, max: 60 }),
    str(b, 'form', { required: false, max: 60 }), str(b, 'category', { required: false, max: 60 }) || 'General',
    str(b, 'unit', { required: false, max: 30 }) || 'unit', str(b, 'nda_reg_no', { required: false, max: 60 }),
    int(b, 'default_price', { min: 0 }), bool(b.is_essential), bool(b.requires_prescription),
  ];

  r.post('/', allow('admin'), (req, res) => {
    const { id } = db.run(
      `INSERT INTO products (name, generic_name, strength, form, category, unit, nda_reg_no, default_price, is_essential, requires_prescription)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ...fields(req.body),
    );
    res.status(201).json(db.get('SELECT * FROM products WHERE id = ?', id));
  });

  r.put('/:id', allow('admin'), (req, res) => {
    const id = Number(req.params.id);
    if (!db.get('SELECT 1 FROM products WHERE id = ?', id)) throw notFound('Product');
    db.run(
      `UPDATE products SET name=?, generic_name=?, strength=?, form=?, category=?, unit=?, nda_reg_no=?, default_price=?,
              is_essential=?, requires_prescription=?, active=? WHERE id = ?`,
      ...fields(req.body), req.body.active === undefined ? 1 : bool(req.body.active), id,
    );
    res.json(db.get('SELECT * FROM products WHERE id = ?', id));
  });

  return r;
}
