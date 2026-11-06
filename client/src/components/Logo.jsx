import { Link } from 'react-router-dom';

export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0E7C4A" />
      <path d="M27 14h10v15h15v10H37v15H27V39H12V29h15z" fill="#fff" />
      <circle cx="48" cy="16" r="6" fill="#F5B400" />
    </svg>
  );
}

export default function Logo({ to = '/', light = false }) {
  return (
    <Link to={to} className={`logo ${light ? 'light' : ''}`} aria-label="FirstMeds home">
      <LogoMark />
      <span>First<span className="meds">Meds</span></span>
    </Link>
  );
}
