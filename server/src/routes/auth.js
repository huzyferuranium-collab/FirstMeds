import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { signToken, publicUser, requireAuth } from '../auth.js';
import { HttpError, str, bad } from '../util.js';

export default function authRoutes(db) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 1000 : 20, standardHeaders: true, legacyHeaders: false });

  r.post('/login', limiter, (req, res) => {
    const email = str(req.body, 'email', { max: 200 });
    const password = str(req.body, 'password', { max: 200 });
    const user = db.get(
      `SELECT u.*, p.name AS pharmacy_name, p.status AS pharmacy_status FROM users u
         LEFT JOIN pharmacies p ON p.id = u.pharmacy_id WHERE u.email = ?`,
      email,
    );
    if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new HttpError(401, 'Wrong email or password');
    if (!user.active) throw new HttpError(403, 'This account has been disabled');
    if (user.role !== 'admin' && user.pharmacy_status === 'suspended') throw new HttpError(403, 'This pharmacy is suspended from the network');
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  r.get('/me', requireAuth(db), (req, res) => res.json({ user: publicUser(req.user) }));

  r.post('/change-password', requireAuth(db), (req, res) => {
    const current = str(req.body, 'current_password', { max: 200 });
    const next = str(req.body, 'new_password', { max: 200 });
    if (next.length < 8) throw bad('New password must be at least 8 characters');
    if (!bcrypt.compareSync(current, req.user.password_hash)) throw bad('Current password is wrong');
    db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', bcrypt.hashSync(next, 10), req.user.id);
    res.json({ ok: true });
  });

  return r;
}
