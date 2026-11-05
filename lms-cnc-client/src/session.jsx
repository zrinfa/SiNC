// =============================================================
// session.jsx - state sesi login: token + profil user, tersimpan di
// localStorage dan diverifikasi ulang lewat GET /api/me.
// =============================================================
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken } from './api.js';

const Ctx = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [checking, setChecking] = useState(!!localStorage.getItem('token'));

  // verifikasi token saat aplikasi dibuka
  useEffect(() => {
    if (!localStorage.getItem('token')) { setChecking(false); return; }
    let alive = true;
    api('/api/me')
      .then((u) => { if (alive) { setUser(u); localStorage.setItem('user', JSON.stringify(u)); } })
      .catch(() => { if (alive) { setToken(null); localStorage.removeItem('user'); setUser(null); } })
      .finally(() => alive && setChecking(false));
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(r.token);
    localStorage.setItem('user', JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  }, []);

  const daftar = useCallback(async (body) => {
    const r = await api('/api/register', { method: 'POST', body: JSON.stringify(body) });
    setToken(r.token);
    localStorage.setItem('user', JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  }, []);

  const keluar = useCallback(() => {
    api('/api/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    localStorage.removeItem('user');
    setUser(null);
    window.location.hash = '';
  }, []);

  const perbarui = useCallback(async (patch) => {
    const u = await api('/api/me', { method: 'PUT', body: JSON.stringify(patch) });
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    return u;
  }, []);

  return <Ctx.Provider value={{ user, setUser, checking, login, daftar, keluar, perbarui }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
