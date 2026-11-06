export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (msg) => new HttpError(409, msg);

/** Uganda's districts (subset used for the launch phase plus all regional cities). */
export const UGANDA_DISTRICTS = [
  'Kampala', 'Wakiso', 'Mukono', 'Entebbe', 'Mpigi', 'Masaka', 'Mityana', 'Luwero', 'Mubende',
  'Jinja', 'Iganga', 'Mbale', 'Tororo', 'Busia', 'Soroti', 'Kamuli',
  'Gulu', 'Lira', 'Arua', 'Kitgum', 'Hoima', 'Masindi', 'Moroto', 'Nebbi', 'Adjumani',
  'Mbarara', 'Kabale', 'Fort Portal', 'Kasese', 'Bushenyi', 'Ntungamo', 'Rukungiri', 'Isingiro',
];

export const PAYMENT_METHODS = ['cash', 'mtn_momo', 'airtel_money', 'card', 'insurance', 'program'];

/** Required string field. */
export function str(body, key, { required = true, max = 500 } = {}) {
  const v = body?.[key];
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw bad(`${key} is required`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) throw bad(`${key} is too long (max ${max})`);
  return s;
}

export function int(body, key, { required = true, min = -Infinity, max = Infinity } = {}) {
  const v = body?.[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${key} is required`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${key} must be a whole number${min > -Infinity ? ` ≥ ${min}` : ''}`);
  return n;
}

export const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

export function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** Normalise a Ugandan phone number to +256XXXXXXXXX. Returns null if unparseable. */
export function normalizePhone(input) {
  if (!input) return null;
  let d = String(input).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('256')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^[347]\d{8}$/.test(d)) return null;
  return `+256${d}`;
}

/** Uganda is on East Africa Time (UTC+3, no daylight saving). DB timestamps are UTC. */
export const EAT = "'+3 hours'";
export const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
