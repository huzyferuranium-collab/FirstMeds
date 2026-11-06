import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { allow } from '../auth.js';
import { publicUser } from '../auth.js';
import { str, bool, bad, notFound, forbidden, conflict, normalizePhone, UGANDA_DISTRICTS } from '../util.js';

const tempPassword = () => `FM-${randomBytes(4).toString('hex')}`;
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 80);

export default function adminRoutes(db) {
  const r = Router();
  const admin = allow('admin');

  /* ---------- Pharmacies ---------- */
  const pharmacyFields = (b) => {
    const district = str(b, 'district', { max: 60 });
    if (!UGANDA_DISTRICTS.includes(district)) throw bad('Unknown district');
    const type = ['pharmacy', 'drug_shop', 'clinic'].includes(b.type) ? b.type : 'pharmacy';
    return [
      str(b, 'name', { max: 120 }), type, district, str(b, 'town', { required: false, max: 120 }),
      str(b, 'address', { required: false, max: 200 }), normalizePhone(b.phone) || str(b, 'phone', { required: false, max: 30 }),
      str(b, 'email', { required: false, max: 200 }), str(b, 'nda_license', { required: false, max: 60 }),
      str(b, 'tin', { required: false, max: 20 }), str(b, 'owner_name', { required: false, max: 120 }),
    ];
  };

  r.get('/pharmacies', admin, (_req, res) => {
    res.json(db.all(
      `SELECT ph.*, (SELECT COUNT(*) FROM users u WHERE u.pharmacy_id = ph.id) AS staff,
              (SELECT MAX(created_at) FROM sales s WHERE s.pharmacy_id = ph.id) AS last_sale
         FROM pharmacies ph ORDER BY ph.name`,
    ));
  });

  r.post('/pharmacies', admin, (req, res) => {
    const { id } = db.run(
      'INSERT INTO pharmacies (name, type, district, town, address, phone, email, nda_license, tin, owner_name) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ...pharmacyFields(req.body),
    );
    res.status(201).json(db.get('SELECT * FROM pharmacies WHERE id = ?', id));
  });

  // Owners may view/update their own pharmacy profile; admins any.
  r.get('/pharmacies/:id', (req, res) => {
    const id = Number(req.params.id);
    if (req.user.role !== 'admin' && req.user.pharmacy_id !== id) throw forbidden();
    const ph = db.get('SELECT * FROM pharmacies WHERE id = ?', id);
    if (!ph) throw notFound('Pharmacy');
    res.json(ph);
  });

  r.put('/pharmacies/:id', allow('admin', 'owner'), (req, res) => {
    const id = Number(req.params.id);
    if (req.user.role !== 'admin' && req.user.pharmacy_id !== id) throw forbidden();
    if (!db.get('SELECT 1 FROM pharmacies WHERE id = ?', id)) throw notFound('Pharmacy');
    db.run(
      'UPDATE pharmacies SET name=?, type=?, district=?, town=?, address=?, phone=?, email=?, nda_license=?, tin=?, owner_name=? WHERE id = ?',
      ...pharmacyFields(req.body), id,
    );
    if (req.user.role === 'admin' && ['active', 'suspended'].includes(req.body.status)) {
      db.run('UPDATE pharmacies SET status = ? WHERE id = ?', req.body.status, id);
    }
    res.json(db.get('SELECT * FROM pharmacies WHERE id = ?', id));
  });

  /* ---------- Users ---------- */
  r.get('/users', allow('admin', 'owner'), (req, res) => {
    const ph = req.user.role === 'admin' ? (req.query.pharmacy_id ? Number(req.query.pharmacy_id) : null) : req.user.pharmacy_id;
    res.json(db.all(
      `SELECT u.*, p.name AS pharmacy_name FROM users u LEFT JOIN pharmacies p ON p.id = u.pharmacy_id
        WHERE (? IS NULL OR u.pharmacy_id = ?) ORDER BY u.role, u.name`,
      ph, ph,
    ).map(publicUser));
  });

  const checkRoleAssignment = (req, role, pharmacyId) => {
    if (!['admin', 'owner', 'pharmacist', 'cashier'].includes(role)) throw bad('Invalid role');
    if (req.user.role === 'owner') {
      if (role === 'admin' || role === 'owner') throw forbidden('Owners can add pharmacists and cashiers only');
      if (pharmacyId !== req.user.pharmacy_id) throw forbidden();
    }
    if (role !== 'admin' && !pharmacyId) throw bad('Staff must belong to a pharmacy');
    if (pharmacyId && !db.get('SELECT 1 FROM pharmacies WHERE id = ?', pharmacyId)) throw notFound('Pharmacy');
  };

  r.post('/users', allow('admin', 'owner'), (req, res) => {
    const b = req.body;
    const role = b.role;
    const pharmacyId = role === 'admin' ? null : req.user.role === 'owner' ? req.user.pharmacy_id : Number(b.pharmacy_id) || null;
    checkRoleAssignment(req, role, pharmacyId);
    const email = str(b, 'email', { max: 200 });
    if (db.get('SELECT 1 FROM users WHERE email = ?', email)) throw conflict('That email is already in use');
    const password = b.password ? String(b.password) : tempPassword();
    if (password.length < 8) throw bad('Password must be at least 8 characters');
    const { id } = db.run(
      'INSERT INTO users (name, email, phone, password_hash, role, pharmacy_id, must_change_password) VALUES (?,?,?,?,?,?,1)',
      str(b, 'name', { max: 120 }), email, normalizePhone(b.phone), bcrypt.hashSync(password, 10), role, pharmacyId,
    );
    res.status(201).json({ user: publicUser(db.get('SELECT * FROM users WHERE id = ?', id)), temporary_password: password });
  });

  r.put('/users/:id', allow('admin', 'owner'), (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!u) throw notFound('User');
    if (req.user.role === 'owner' && (u.pharmacy_id !== req.user.pharmacy_id || u.role === 'owner' || u.role === 'admin')) throw forbidden();
    if (u.id === req.user.id && req.body.active === false) throw bad('You cannot disable your own account');
    const role = req.body.role || u.role;
    checkRoleAssignment(req, role, role === 'admin' ? null : u.pharmacy_id);
    db.run(
      'UPDATE users SET name = ?, phone = ?, role = ?, active = ? WHERE id = ?',
      str(req.body, 'name', { max: 120 }), normalizePhone(req.body.phone), role,
      req.body.active === undefined ? u.active : bool(req.body.active), u.id,
    );
    let temporary_password;
    if (req.body.reset_password) {
      temporary_password = tempPassword();
      db.run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', bcrypt.hashSync(temporary_password, 10), u.id);
    }
    res.json({ user: publicUser(db.get('SELECT * FROM users WHERE id = ?', u.id)), temporary_password });
  });

  /* ---------- Network applications (from the website) ---------- */
  r.get('/applications', admin, (_req, res) => {
    res.json(db.all('SELECT * FROM applications ORDER BY (status = \'new\') DESC, created_at DESC'));
  });

  r.post('/applications/:id/approve', admin, (req, res) => {
    const a = db.get('SELECT * FROM applications WHERE id = ?', Number(req.params.id));
    if (!a) throw notFound('Application');
    if (a.status !== 'new') throw conflict(`Application already ${a.status}`);
    const email = a.email || str(req.body, 'email', { max: 200 });
    if (db.get('SELECT 1 FROM users WHERE email = ?', email)) throw conflict('An account with this email already exists');
    const password = tempPassword();
    const out = db.tx(() => {
      const ph = db.run(
        'INSERT INTO pharmacies (name, type, district, town, phone, email, nda_license, owner_name) VALUES (?,?,?,?,?,?,?,?)',
        a.facility_name, a.type, a.district, a.town, a.phone, email, a.nda_license, a.owner_name,
      );
      const u = db.run(
        "INSERT INTO users (name, email, phone, password_hash, role, pharmacy_id, must_change_password) VALUES (?,?,?,?,'owner',?,1)",
        a.owner_name, email, a.phone, bcrypt.hashSync(password, 10), ph.id,
      );
      db.run("UPDATE applications SET status = 'approved', pharmacy_id = ? WHERE id = ?", ph.id, a.id);
      return { pharmacy_id: ph.id, user_id: u.id };
    });
    res.json({ ...out, login_email: email, temporary_password: password });
  });

  r.post('/applications/:id/reject', admin, (req, res) => {
    const { changes } = db.run("UPDATE applications SET status = 'rejected' WHERE id = ? AND status = 'new'", Number(req.params.id));
    if (!changes) throw notFound('Open application');
    res.json({ ok: true });
  });

  /* ---------- Website content ---------- */
  r.get('/news', admin, (_req, res) => res.json(db.all('SELECT * FROM news_posts ORDER BY published_at DESC')));
  r.post('/news', admin, (req, res) => {
    const title = str(req.body, 'title', { max: 200 });
    let slug = slugify(req.body.slug || title) || `post-${Date.now()}`;
    if (db.get('SELECT 1 FROM news_posts WHERE slug = ?', slug)) slug = `${slug}-${Date.now().toString(36)}`;
    const { id } = db.run(
      'INSERT INTO news_posts (slug, title, excerpt, body, category, published) VALUES (?,?,?,?,?,?)',
      slug, title, str(req.body, 'excerpt', { required: false, max: 400 }), str(req.body, 'body', { max: 50000 }),
      str(req.body, 'category', { required: false, max: 40 }) || 'Update', req.body.published === undefined ? 1 : bool(req.body.published),
    );
    res.status(201).json(db.get('SELECT * FROM news_posts WHERE id = ?', id));
  });
  r.put('/news/:id', admin, (req, res) => {
    const id = Number(req.params.id);
    const { changes } = db.run(
      'UPDATE news_posts SET title=?, excerpt=?, body=?, category=?, published=? WHERE id = ?',
      str(req.body, 'title', { max: 200 }), str(req.body, 'excerpt', { required: false, max: 400 }), str(req.body, 'body', { max: 50000 }),
      str(req.body, 'category', { required: false, max: 40 }) || 'Update', bool(req.body.published), id,
    );
    if (!changes) throw notFound('Article');
    res.json(db.get('SELECT * FROM news_posts WHERE id = ?', id));
  });
  r.delete('/news/:id', admin, (req, res) => {
    db.run('DELETE FROM news_posts WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  });

  r.get('/jobs', admin, (_req, res) => res.json(db.all('SELECT * FROM jobs ORDER BY created_at DESC')));
  const jobFields = (b) => [
    str(b, 'title', { max: 160 }), str(b, 'department', { required: false, max: 80 }), str(b, 'location', { required: false, max: 80 }) || 'Kampala',
    str(b, 'employment_type', { required: false, max: 40 }) || 'Full-time', str(b, 'description', { max: 20000 }),
    str(b, 'apply_email', { required: false, max: 200 }), b.published === undefined ? 1 : bool(b.published),
  ];
  r.post('/jobs', admin, (req, res) => {
    const { id } = db.run(
      'INSERT INTO jobs (title, department, location, employment_type, description, apply_email, published) VALUES (?,?,?,?,?,?,?)',
      ...jobFields(req.body),
    );
    res.status(201).json(db.get('SELECT * FROM jobs WHERE id = ?', id));
  });
  r.put('/jobs/:id', admin, (req, res) => {
    const id = Number(req.params.id);
    const { changes } = db.run(
      'UPDATE jobs SET title=?, department=?, location=?, employment_type=?, description=?, apply_email=?, published=? WHERE id = ?',
      ...jobFields(req.body), id,
    );
    if (!changes) throw notFound('Job');
    res.json(db.get('SELECT * FROM jobs WHERE id = ?', id));
  });
  r.delete('/jobs/:id', admin, (req, res) => {
    db.run('DELETE FROM jobs WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  });

  r.get('/messages', admin, (_req, res) => res.json(db.all('SELECT * FROM contact_messages ORDER BY handled, created_at DESC')));
  r.post('/messages/:id/handled', admin, (req, res) => {
    db.run('UPDATE contact_messages SET handled = 1 WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  });

  return r;
}
