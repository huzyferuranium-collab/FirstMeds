const nf = new Intl.NumberFormat('en-UG');

export const ugx = (n) => `UGX ${nf.format(Math.round(Number(n) || 0))}`;
export const num = (n) => nf.format(Math.round(Number(n) || 0));
export const compact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e3)}K`;
  return nf.format(v);
};

/** DB timestamps are UTC "YYYY-MM-DD HH:MM:SS"; show them in East Africa Time. */
const toDate = (s) => (s instanceof Date ? s : new Date(String(s).includes('T') ? s : `${String(s).replace(' ', 'T')}Z`));
const tz = { timeZone: 'Africa/Kampala' };
export const dateTime = (s) => (s ? toDate(s).toLocaleString('en-GB', { ...tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const date = (s) => {
  if (!s) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return toDate(s).toLocaleDateString('en-GB', { ...tz, day: '2-digit', month: 'short', year: 'numeric' });
};
export const time = (s) => (s ? toDate(s).toLocaleTimeString('en-GB', { ...tz, hour: '2-digit', minute: '2-digit' }) : '');
export const shortDay = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const monthLabel = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const todayEAT = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
export const daysUntil = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayEAT()}T00:00:00Z`)) / 864e5);

export const PAYMENT_LABELS = {
  cash: 'Cash',
  mtn_momo: 'MTN MoMo',
  airtel_money: 'Airtel Money',
  card: 'Card',
  insurance: 'Insurance',
  program: 'Programme',
};
export const ROLE_LABELS = { admin: 'HQ Admin', owner: 'Owner', pharmacist: 'Pharmacist', cashier: 'Cashier' };
export const TYPE_LABELS = { pharmacy: 'Pharmacy', drug_shop: 'Drug shop', clinic: 'Clinic' };

export const age = (dob) => (dob ? Math.floor((Date.now() - Date.parse(dob)) / (365.25 * 864e5)) : null);
export const phone = (p) => (p ? p.replace(/^\+256(\d{3})(\d{3})(\d{3})$/, '0$1 $2 $3') : '—');
