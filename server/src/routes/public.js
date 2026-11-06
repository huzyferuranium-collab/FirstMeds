import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { str, bad, notFound, normalizePhone, UGANDA_DISTRICTS } from '../util.js';

export default function publicRoutes(db) {
  const r = Router();
  const formLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 1000 : 10, standardHeaders: true, legacyHeaders: false });

  r.get('/districts', (_req, res) => res.json(UGANDA_DISTRICTS));

  // Live network numbers for the website.
  r.get('/stats', (_req, res) => {
    const one = (sql) => db.get(sql).n;
    res.json({
      facilities: one("SELECT COUNT(*) n FROM pharmacies WHERE status = 'active'"),
      districts: one("SELECT COUNT(DISTINCT district) n FROM pharmacies WHERE status = 'active'"),
      patient_visits: one('SELECT COUNT(*) n FROM sales WHERE voided = 0'),
      patients: one('SELECT COUNT(*) n FROM patients'),
      enrolled: one("SELECT COUNT(DISTINCT patient_id) n FROM enrollments WHERE status = 'active'"),
      subsidy_ugx: one('SELECT COALESCE(SUM(subsidy_total),0) n FROM sales WHERE voided = 0'),
      by_district: db.all(
        `SELECT p.district, COUNT(DISTINCT p.id) AS facilities, COUNT(s.id) AS visits
           FROM pharmacies p LEFT JOIN sales s ON s.pharmacy_id = p.id AND s.voided = 0
          WHERE p.status = 'active' GROUP BY p.district ORDER BY visits DESC`,
      ),
      top_categories: db.all(
        `SELECT pr.category, SUM(si.quantity) AS units FROM sale_items si
           JOIN sales s ON s.id = si.sale_id AND s.voided = 0 JOIN products pr ON pr.id = si.product_id
          GROUP BY pr.category ORDER BY units DESC LIMIT 6`,
      ),
    });
  });

  r.get('/programs', (_req, res) => {
    res.json(db.all(
      `SELECT p.id, p.code, p.name, p.description, p.sponsor, p.discount_percent,
              (SELECT COUNT(*) FROM enrollments e WHERE e.program_id = p.id AND e.status = 'active') AS enrolled
         FROM programs p WHERE p.active = 1 ORDER BY p.id`,
    ));
  });

  r.get('/news', (_req, res) => {
    res.json(db.all('SELECT id, slug, title, excerpt, category, published_at FROM news_posts WHERE published = 1 ORDER BY published_at DESC'));
  });

  r.get('/news/:slug', (req, res) => {
    const post = db.get('SELECT * FROM news_posts WHERE slug = ? AND published = 1', req.params.slug);
    if (!post) throw notFound('Article');
    res.json(post);
  });

  r.get('/jobs', (_req, res) => {
    res.json(db.all('SELECT * FROM jobs WHERE published = 1 ORDER BY created_at DESC'));
  });

  r.post('/applications', formLimiter, (req, res) => {
    const b = req.body || {};
    const phone = normalizePhone(b.phone);
    if (!phone) throw bad('Enter a valid Ugandan phone number, e.g. 0772 123456');
    const district = str(b, 'district', { max: 60 });
    if (!UGANDA_DISTRICTS.includes(district)) throw bad('Choose a district from the list');
    const type = ['pharmacy', 'drug_shop', 'clinic'].includes(b.type) ? b.type : 'pharmacy';
    const { id } = db.run(
      `INSERT INTO applications (facility_name, type, owner_name, phone, email, district, town, nda_license, message)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      str(b, 'facility_name', { max: 120 }), type, str(b, 'owner_name', { max: 120 }), phone,
      str(b, 'email', { required: false, max: 200 }), district, str(b, 'town', { required: false, max: 120 }),
      str(b, 'nda_license', { required: false, max: 60 }), str(b, 'message', { required: false, max: 2000 }),
    );
    res.status(201).json({ id, ok: true });
  });

  r.post('/contact', formLimiter, (req, res) => {
    const b = req.body || {};
    if (!b.email && !b.phone) throw bad('Give us an email or phone number so we can reply');
    const { id } = db.run(
      'INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)',
      str(b, 'name', { max: 120 }), str(b, 'email', { required: false, max: 200 }), str(b, 'phone', { required: false, max: 30 }),
      str(b, 'subject', { required: false, max: 200 }), str(b, 'message', { max: 4000 }),
    );
    res.status(201).json({ id, ok: true });
  });

  return r;
}
