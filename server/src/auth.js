import jwt from 'jsonwebtoken';
import { HttpError, forbidden, bad } from './util.js';

const DEV_SECRET = 'firstmeds-dev-secret-change-me';

export function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
    return DEV_SECRET;
  }
  return s;
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, ph: user.pharmacy_id }, jwtSecret(), { expiresIn: '12h' });
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, active: !!rest.active, must_change_password: !!rest.must_change_password };
}

/** Middleware: require a valid bearer token; loads req.user fresh from the DB. */
export function requireAuth(db) {
  return (req, _res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Please sign in'));
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret());
    } catch {
      return next(new HttpError(401, 'Your session has expired. Please sign in again.'));
    }
    const user = db.get(
      `SELECT u.*, p.name AS pharmacy_name, p.status AS pharmacy_status
         FROM users u LEFT JOIN pharmacies p ON p.id = u.pharmacy_id WHERE u.id = ?`,
      payload.sub,
    );
    if (!user || !user.active) return next(new HttpError(401, 'Account disabled'));
    if (user.role !== 'admin' && user.pharmacy_status === 'suspended') {
      return next(new HttpError(403, 'This pharmacy is suspended from the FirstMeds network. Contact support.'));
    }
    req.user = user;
    next();
  };
}

/** Middleware: allow only the listed roles. */
export const allow = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden());

/**
 * Resolve which pharmacy a request operates on.
 * Staff are always pinned to their own pharmacy. Admins may pass ?pharmacy_id= (or body.pharmacy_id);
 * if `required` and none is given, admins get a 400.
 */
export function pharmacyScope(req, { required = true } = {}) {
  if (req.user.role !== 'admin') return req.user.pharmacy_id;
  const raw = req.query.pharmacy_id ?? req.body?.pharmacy_id;
  if (raw === undefined || raw === '' || raw === null || raw === 'all') {
    if (required) throw bad('pharmacy_id is required for HQ admins');
    return null;
  }
  const id = Number(raw);
  if (!Number.isInteger(id)) throw bad('pharmacy_id must be a number');
  return id;
}
