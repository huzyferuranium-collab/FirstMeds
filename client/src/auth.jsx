import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, tokenStore, pharmacyStore, setUnauthorizedHandler } from './api.js';

// Keep the signed-in user locally so the app still opens without internet.
const USER_KEY = 'firstmeds.user';
const cachedUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } };
const saveUser = (u) => { try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch { /* ignore */ } };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() => (tokenStore.get() ? cachedUser() : null));
  const setUser = useCallback((u) => { saveUser(u); setUserState(u); }, []);
  const [loading, setLoading] = useState(!!tokenStore.get() && !cachedUser());
  const [pharmacyId, setPharmacyIdState] = useState(pharmacyStore.get());

  const logout = useCallback(() => {
    tokenStore.set(null);
    saveUser(null);
    pharmacyStore.set('');
    setPharmacyIdState('');
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api.get('/auth/me', { scoped: false })
      .then((r) => setUser(r.user))
      // Only a real "not signed in" answer logs out; no internet keeps the cached session.
      .catch((e) => { if (e instanceof ApiError && e.status === 401) logout(); })
      .finally(() => setLoading(false));
  }, [logout, setUser]);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    tokenStore.set(r.token);
    if (r.user.role !== 'admin') pharmacyStore.set('');
    setPharmacyIdState(pharmacyStore.get());
    setUser(r.user);
    return r.user;
  }, [setUser]);

  const setPharmacyId = useCallback((id) => {
    pharmacyStore.set(id);
    setPharmacyIdState(id ? String(id) : '');
  }, []);

  const value = useMemo(() => {
    const isAdmin = user?.role === 'admin';
    // The pharmacy the UI is working on: staff's own, or the one an admin picked.
    const activePharmacy = isAdmin ? (pharmacyId ? Number(pharmacyId) : null) : user?.pharmacy_id ?? null;
    return {
      user, loading, login, logout, setUser, isAdmin, activePharmacy, setPharmacyId,
      can: (...roles) => !!user && roles.includes(user.role),
    };
  }, [user, loading, login, logout, pharmacyId, setPharmacyId, setUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
