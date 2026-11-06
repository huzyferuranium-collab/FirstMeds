import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useForm, Field, ErrorBox } from '../components/UI.jsx';
import Logo from '../components/Logo.jsx';

const DEMO = [
  ['HQ admin', 'admin@firstmeds.ug'],
  ['Pharmacy owner', 'owner1@demo.firstmeds.ug'],
  ['Pharmacist', 'pharmacist1@demo.firstmeds.ug'],
  ['Cashier', 'cashier1@demo.firstmeds.ug'],
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const f = useForm({ email: '', password: '' });
  if (user) return <Navigate to={loc.state?.from || '/app'} replace />;
  const go = f.submit(async (v) => { await login(v.email.trim(), v.password); nav(loc.state?.from || '/app', { replace: true }); });

  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <Logo light />
        <div>
          <h2>Welcome back.</h2>
          <p>Sell, stock and serve your patients — all in one place. Built for Uganda's pharmacies, drug shops and clinics.</p>
        </div>
        <p className="small">Need an account? Ask your pharmacy owner, or <a href="/join" style={{ color: '#fff' }}>apply to join the network</a>.</p>
      </div>
      <div className="auth-form">
        <form className="card stack" onSubmit={go}>
          <div className="hide-wide"><Logo /></div>
          <div>
            <h2 style={{ marginBottom: 4 }}>Sign in</h2>
            <p className="muted small" style={{ margin: 0 }}>Use the email and password from your pharmacy owner or FirstMeds.</p>
          </div>
          <ErrorBox error={f.error} />
          <Field label="Email"><input type="email" autoComplete="username" required value={f.values.email} onChange={f.set('email')} /></Field>
          <Field label="Password"><input type="password" autoComplete="current-password" required value={f.values.password} onChange={f.set('password')} /></Field>
          <button className="btn lg block" disabled={f.busy}>{f.busy ? 'Signing in…' : 'Sign in'}</button>
          {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === '1') && (
            <div className="alert info small">
              <strong>Demo accounts</strong> (password <code>demo1234</code>):
              <div className="row" style={{ marginTop: 8 }}>
                {DEMO.map(([label, email]) => (
                  <button type="button" key={email} className="btn sm secondary" onClick={() => f.setValues({ email, password: 'demo1234' })}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
