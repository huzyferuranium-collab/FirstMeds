import { Router } from 'express';
import { pharmacyScope } from '../auth.js';
import { bad, notFound, forbidden, str, EAT, today, addDays } from '../util.js';
import { sendSms } from '../services/sms.js';

/**
 * Patients due for a refill: their latest purchase of a product with a days_supply runs out
 * between 14 days ago and 3 days from now, and nobody has followed up on that purchase yet.
 */
export function dueRefills(db, pharmacyId) {
  const t = today();
  return db.all(
    `WITH latest AS (
        SELECT si.id AS sale_item_id, s.patient_id, si.product_id, si.days_supply, s.created_at,
               date(s.created_at, ${EAT}, '+' || si.days_supply || ' days') AS due_date,
               ROW_NUMBER() OVER (PARTITION BY s.patient_id, si.product_id ORDER BY s.created_at DESC, si.id DESC) AS rn
          FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.pharmacy_id = ? AND s.voided = 0 AND s.patient_id IS NOT NULL
      )
      SELECT l.*, pt.name AS patient_name, pt.phone, pt.sms_consent, p.name AS product_name, p.strength,
             (SELECT MAX(created_at) FROM reminder_logs r WHERE r.sale_item_id = l.sale_item_id) AS last_contact
        FROM latest l JOIN patients pt ON pt.id = l.patient_id JOIN products p ON p.id = l.product_id
       WHERE l.rn = 1 AND l.days_supply > 0 AND l.due_date BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM reminder_logs r WHERE r.sale_item_id = l.sale_item_id AND r.status != 'failed')
       ORDER BY l.due_date`,
    pharmacyId, addDays(t, -14), addDays(t, 3),
  );
}

export default function reminderRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => res.json(dueRefills(db, pharmacyScope(req))));

  r.get('/log', (req, res) => {
    const ph = pharmacyScope(req);
    res.json(db.all(
      `SELECT r.*, pt.name AS patient_name, p.name AS product_name, u.name AS user_name
         FROM reminder_logs r JOIN patients pt ON pt.id = r.patient_id
         JOIN sale_items si ON si.id = r.sale_item_id JOIN products p ON p.id = si.product_id
         LEFT JOIN users u ON u.id = r.user_id
        WHERE pt.pharmacy_id = ? ORDER BY r.id DESC LIMIT 200`,
      ph,
    ));
  });

  r.post('/', async (req, res) => {
    const item = db.get(
      `SELECT si.id, si.product_id, s.patient_id, s.pharmacy_id, pt.name AS patient_name, pt.phone, pt.sms_consent,
              p.name AS product_name, ph.name AS pharmacy_name, ph.phone AS pharmacy_phone
         FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN patients pt ON pt.id = s.patient_id
         JOIN products p ON p.id = si.product_id JOIN pharmacies ph ON ph.id = s.pharmacy_id
        WHERE si.id = ?`,
      Number(req.body.sale_item_id),
    );
    if (!item) throw notFound('Purchase');
    if (req.user.role !== 'admin' && item.pharmacy_id !== req.user.pharmacy_id) throw forbidden();
    const channel = ['sms', 'call', 'in_person'].includes(req.body.channel) ? req.body.channel : 'sms';
    let status = 'contacted';
    let note = str(req.body, 'note', { required: false, max: 500 });
    if (channel === 'sms') {
      if (!item.phone) throw bad('Patient has no phone number');
      if (!item.sms_consent) throw bad('Patient has not agreed to receive SMS');
      const first = item.patient_name.split(' ')[0];
      const msg = `Hello ${first}, it is time to refill your ${item.product_name}. Visit ${item.pharmacy_name}` +
        `${item.pharmacy_phone ? ` or call ${item.pharmacy_phone}` : ''}. Stay healthy! - FirstMeds`;
      const out = await sendSms(item.phone, msg);
      status = out.status;
      note = note || out.detail || null;
    }
    const { id } = db.run(
      'INSERT INTO reminder_logs (sale_item_id, patient_id, channel, status, note, user_id) VALUES (?,?,?,?,?,?)',
      item.id, item.patient_id, channel, status, note, req.user.id,
    );
    res.status(201).json(db.get('SELECT * FROM reminder_logs WHERE id = ?', id));
  });

  return r;
}
