import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from '../components/Logo.jsx';

const NAV = [
  ['/point-of-sale', 'Point of Sale'],
  ['/programmes', 'Patient Programmes'],
  ['/data', 'Data Insights'],
  ['/about', 'About'],
  ['/news', 'News'],
  ['/careers', 'Careers'],
];

export default function SiteLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Logo />
          <nav className={`site-nav ${open ? 'open' : ''}`} aria-label="Main">
            {NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
            <NavLink to="/app" className="hide-desktop">Sign in</NavLink>
          </nav>
          <div className="spacer" />
          <div className="row header-cta">
            <Link to="/app" className="btn ghost">Sign in</Link>
            <Link to="/join" className="btn">Join the network</Link>
          </div>
          <button className="btn secondary sm menu-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="site-footer">
        <div className="container">
          <div className="cols">
            <div>
              <Logo light />
              <p style={{ marginTop: 16, maxWidth: 340 }}>
                Quality, affordable medicines — first — for every Ugandan. A digital network of neighbourhood pharmacies, drug shops and clinics.
              </p>
              <p className="small">Kampala, Uganda · <a href="mailto:hello@firstmeds.ug" style={{ display: 'inline' }}>hello@firstmeds.ug</a></p>
            </div>
            <div>
              <h4>Solutions</h4>
              <Link to="/point-of-sale">Point of Sale</Link>
              <Link to="/programmes">Patient Programmes</Link>
              <Link to="/data">Data Insights</Link>
              <Link to="/join">Join the network</Link>
            </div>
            <div>
              <h4>Company</h4>
              <Link to="/about">About us</Link>
              <Link to="/careers">Careers</Link>
              <Link to="/news">Newsroom</Link>
              <Link to="/contact">Contact</Link>
            </div>
            <div>
              <h4>For partners</h4>
              <Link to="/app">Pharmacy sign in</Link>
              <Link to="/contact?subject=Partnership">Fund a programme</Link>
              <Link to="/data">Request data</Link>
            </div>
          </div>
          <div className="bottom">
            <span>© {new Date().getFullYear()} FirstMeds. All rights reserved.</span>
            <span>Proudly built for Uganda 🇺🇬</span>
          </div>
        </div>
      </footer>
    </>
  );
}
