import { Router } from 'express';
import { pharmacyScope } from '../auth.js';
import { str, bad, notFound, forbidden, conflict, normalizePhone, isDate, bool } from '../util.js';

export default function patientRoutes(db) {
  const r = Router();

  const fields = (b) => {
    const phone = b.phone ? normalizePhone(b.phone) : null;
    if (b.phone && !phone) throw bad('Enter a valid Ugandan phone number, e.g. 0772 123456');
    const sex = b.sex === 'F' || b.sex === 'M' ? b.sex : null;
    const dob = b.dob ? String(b.dob) : null;
    if (dob && !isDate(dob)) throw bad('Date of birth must be YYYY-MM-DD');
    return [
      str(b, 'name', { max: 120 }), phone, sex, dob, str(b, 'district', { required: false, max: 60 }),
      str(b, 'village', { required: false, max: 120 }), str(b, 'nin', { required: false, max: 20 }),
      b.sms_consent === undefined ? 1 : bool(b.sms_consent),
    ];
  };

  const load = (req) => {
    const p = db.get('SELECT * FROM patients WHERE id = ?', Number(req.params.id));
    if (!p) throw notFound('Patient');
    if (req.user.role !== 'admin' && p.pharmacy_id !== req.user.pharmacy_id) throw forbidden();
    return p;
  };

  r.get('/', (req, res) => {
    const ph = pharmacyScope(req, { required: false });
    const q = (req.query.q || '').trim();
    const phone = normalizePhone(q);
    const like = `%${q}%`;
    res.json(db.all(
      `SELECT pt.*,
              (SELECT COUNT(*) FROM sales s WHERE s.patient_id = pt.id AND s.voided = 0) AS visits,
              (SELECT MAX(created_at) FROM sales s WHERE s.patient_id = pt.id AND s.voided = 0) AS last_visit,
              (SELECT GROUP_CONCAT(pr.code) FROM enrollments e JOIN programs pr ON pr.id = e.program_id
                WHERE e.patient_id = pt.id AND e.status = 'active') AS programs
         FROM patients pt
        WHERE (? IS NULL OR pt.pharmacy_id = ?)
          AND (pt.name LIKE ? OR pt.phone LIKE ? OR pt.phone = ? OR pt.nin LIKE ?)
        ORDER BY pt.name LIMIT 200`,
      ph, ph, like, like, phone, like,
    ));
  });

  r.post('/', (req, res) => {
    const ph = pharmacyScope(req);
    const f = fields(req.body);
    if (f[1] && db.get('SELECT 1 FROM patients WHERE pharmacy_id = ? AND phone = ? AND name = ? COLLATE NOCASE', ph, f[1], f[0])) {
      throw conflict('A patient with this name and phone is already registered');
    }
    const { id } = db.run(
      'INSERT INTO patients (pharmacy_id, name, phone, sex, dob, district, village, nin, sms_consent) VALUES (?,?,?,?,?,?,?,?,?)',
      ph, ...f,
    );
    res.status(201).json(db.get('SELECT * FROM patients WHERE id = ?', id));
  });

  r.get('/:id', (req, res) => {
    const p = load(req);
    p.enrollments = db.all(
      `SELECT e.*, pr.name AS program_name, pr.code, pr.discount_percent FROM enrollments e
         JOIN programs pr ON pr.id = e.program_id WHERE e.patient_id = ? ORDER BY e.enrolled_at DESC`,
      p.id,
    );
    p.sales = db.all(
      `SELECT s.id, s.receipt_no, s.created_at, s.total, s.subsidy_total, s.voided, pr.name AS program_name,
              (SELECT GROUP_CONCAT(pd.name || ' ×' || si.quantity, ', ') FROM sale_items si JOIN products pd ON pd.id = si.product_id WHERE si.sale_id = s.id) AS items
         FROM sales s LEFT JOIN programs pr ON pr.id = s.program_id
        WHERE s.patient_id = ? ORDER BY s.created_at DESC LIMIT 100`,
      p.id,
    );
    res.json(p);
  });

  r.put('/:id', (req, res) => {
    const p = load(req);
    db.run(
      'UPDATE patients SET name=?, phone=?, sex=?, dob=?, district=?, village=?, nin=?, sms_consent=? WHERE id = ?',
      ...fields(req.body), p.id,
    );
    res.json(db.get('SELECT * FROM patients WHERE id = ?', p.id));
  });

  r.post('/:id/enroll', (req, res) => {
    const p = load(req);
    const program = db.get('SELECT * FROM programs WHERE id = ? AND active = 1', Number(req.body.program_id));
    if (!program) throw notFound('Active program');
    db.run(
      `INSERT INTO enrollments (program_id, patient_id, enrolled_by) VALUES (?,?,?)
       ON CONFLICT(program_id, patient_id) DO UPDATE SET status = 'active', enrolled_at = datetime('now'), enrolled_by = excluded.enrolled_by`,
      program.id, p.id, req.user.id,
    );
    res.status(201).json({ ok: true });
  });

  r.post('/:id/unenroll', (req, res) => {
    const p = load(req);
    db.run("UPDATE enrollments SET status = 'ended' WHERE program_id = ? AND patient_id = ?", Number(req.body.program_id), p.id);
    res.json({ ok: true });
  });

  return r;
}
