import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi, Spinner } from '../components/UI.jsx';
import Logo from '../components/Logo.jsx';
import { ROLE_LABELS } from '../format.js';

function PharmacyPicker() {
  const { activePharmacy, setPharmacyId } = useAuth();
  const { data } = useApi('/admin/pharmacies', []);
  return (
    <div style={{ padding: '4px 4px 8px' }}>
      <label className="small" style={{ color: '#7fa392', fontWeight: 700, display: 'block', margin: '0 8px 6px' }}>WORKING AS</label>
      <select
        value={activePharmacy || ''}
        onChange={(e) => { setPharmacyId(e.target.value); window.location.reload(); }}
        style={{ background: '#123a29', color: '#fff', borderColor: '#24493a' }}
        aria-label="Choose pharmacy"
      >
        <option value="">🌍 Whole network (HQ)</option>
        {data?.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.district}</option>)}
      </select>
    </div>
  );
}

export default function AppLayout() {
  const { user, loading, logout, isAdmin, activePharmacy, can } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [pathname]);
  const reminders = useApi(user && activePharmacy ? '/reminders' : null, [activePharmacy]);

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/app/login" replace state={{ from: pathname }} />;
  if (user.must_change_password && pathname !== '/app/settings') return <Navigate to="/app/settings" replace />;

  const facility = !!activePharmacy;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Logo to="/app" light />
        {isAdmin && <PharmacyPicker />}
        <NavLink to="/app" end>🏠 Dashboard</NavLink>
        {facility && <>
          <div className="nav-label">Counter</div>
          <NavLink to="/app/pos">🧾 New sale</NavLink>
          <NavLink to="/app/sales">📜 Sales</NavLink>
          <NavLink to="/app/patients">👥 Patients</NavLink>
          <NavLink to="/app/reminders">🔔 Refill reminders {reminders.data?.length ? <span className="count">{reminders.data.length}</span> : null}</NavLink>
          <div className="nav-label">Stock</div>
          <NavLink to="/app/inventory">📦 Inventory</NavLink>
          {can('admin', 'owner', 'pharmacist') && <NavLink to="/app/receive">📥 Receive stock</NavLink>}
        </>}
        <div className="nav-label">Programmes</div>
        <NavLink to="/app/programmes">💚 Programmes</NavLink>
        {(can('admin', 'owner')) && <NavLink to="/app/claims">💵 Subsidy claims</NavLink>}
        {(can('admin', 'owner')) && <NavLink to="/app/reports">📊 Reports</NavLink>}
        {isAdmin && <>
          <div className="nav-label">HQ</div>
          <NavLink to="/app/hq/network">🌍 Network</NavLink>
          <NavLink to="/app/hq/pharmacies">🏥 Facilities</NavLink>
          <NavLink to="/app/hq/applications">📝 Applications</NavLink>
          <NavLink to="/app/hq/catalogue">💊 Catalogue</NavLink>
          <NavLink to="/app/hq/website">🌐 Website</NavLink>
        </>}
        <div className="nav-label">Account</div>
        {can('admin', 'owner') && facility && <NavLink to="/app/team">🧑‍⚕️ Team</NavLink>}
        <NavLink to="/app/settings">⚙️ Settings</NavLink>
        <div className="who">
          <strong>{user.name}</strong>
          <span>{ROLE_LABELS[user.role]}{user.pharmacy_name ? ` · ${user.pharmacy_name}` : ''}</span>
          <div className="row" style={{ marginTop: 10 }}>
            <Link to="/" style={{ padding: 0, color: '#a8c7b6' }}>Website</Link>
            <button className="btn sm secondary" onClick={() => { logout(); nav('/app/login', { replace: true }); }}>Sign out</button>
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar no-print">
          <button className="btn secondary sm" onClick={() => setOpen(true)} aria-label="Open menu">☰ Menu</button>
          <Logo to="/app" />
          <Link className="btn sm" to="/app/pos">+ Sale</Link>
        </div>
        {user.must_change_password && (
          <div className="alert warn no-print" style={{ margin: '16px 32px 0', borderRadius: 10 }}>
            You are using a temporary password. <Link to="/app/settings">Change it now</Link>.
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}

/** For pages that work on a single facility: prompts HQ admins to pick one first. */
export function NeedPharmacy({ children }) {
  const { activePharmacy } = useAuth();
  if (activePharmacy) return children;
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 560 }}>
        <h3>Choose a facility</h3>
        <p className="muted">This page works on one facility at a time. Pick one in the “Working as” menu on the left.</p>
      </div>
    </div>
  );
}
