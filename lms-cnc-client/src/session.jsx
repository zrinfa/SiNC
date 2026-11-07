// =============================================================
// session.jsx - state sesi login Firebase: Auth + Firestore Profil
// =============================================================
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { setToken } from './api.js';
import {
  fbLogin,
  fbRegister,
  fbLoginGoogle,
  fbLogout,
  seedInitialDataIfEmpty
} from './firebaseApi.js';

const Ctx = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [checking, setChecking] = useState(true);

  // Inisialisasi seed dan sinkronisasi status login Firebase Auth
  useEffect(() => {
    seedInitialDataIfEmpty().catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const uDoc = await getDoc(doc(db, 'users', fbUser.uid));
          let userData;
          if (uDoc.exists()) {
            userData = { id: uDoc.id, ...uDoc.data() };
          } else {
            userData = {
              id: fbUser.uid,
              uid: fbUser.uid,
              email: fbUser.email,
              nama: fbUser.displayName || fbUser.email.split('@')[0],
              role: fbUser.email.includes('admin') ? 'admin' : fbUser.email.includes('guru') ? 'guru' : 'siswa',
              status: 'aktif'
            };
          }
          const token = await fbUser.getIdToken();
          setToken(token);
          localStorage.setItem('user', JSON.stringify(userData));
          setUser(userData);
        } catch (err) {
          console.warn('Gagal membaca profil pengguna:', err);
        }
      } else {
        const local = localStorage.getItem('user');
        if (!local) {
          setToken(null);
          setUser(null);
        }
      }
      setChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await fbLogin(email, password);
    setToken(r.token);
    localStorage.setItem('user', JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  }, []);

  const loginGoogle = useCallback(async () => {
    const r = await fbLoginGoogle();
    setToken(r.token);
    localStorage.setItem('user', JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  }, []);

  const daftar = useCallback(async (body) => {
    const r = await fbRegister(body);
    setToken(r.token);
    localStorage.setItem('user', JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  }, []);

  const keluar = useCallback(async () => {
    await fbLogout().catch(() => {});
    setToken(null);
    localStorage.removeItem('user');
    setUser(null);
    window.location.hash = '';
  }, []);

  const perbarui = useCallback(async (patch) => {
    if (user && user.id) {
      await updateDoc(doc(db, 'users', user.id), patch);
      const updated = { ...user, ...patch };
      localStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
      return updated;
    }
    return user;
  }, [user]);

  return (
    <Ctx.Provider value={{ user, setUser, checking, login, loginGoogle, daftar, keluar, perbarui }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);
