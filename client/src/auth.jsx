import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, pharmacyStore, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const [pharmacyId, setPharmacyIdState] = useState(pharmacyStore.get());

  const logout = useCallback(() => {
    tokenStore.set(null);
    pharmacyStore.set('');
    setPharmacyIdState('');
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api.get('/auth/me')
      .then((r) => setUser(r.user))
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    tokenStore.set(r.token);
    if (r.user.role !== 'admin') pharmacyStore.set('');
    setPharmacyIdState(pharmacyStore.get());
    setUser(r.user);
    return r.user;
  }, []);

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
  }, [user, loading, login, logout, pharmacyId, setPharmacyId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
