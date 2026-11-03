import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { tokenStore } from '../services/api';
import { ROLES } from '../utils/constants';

const AuthContext = createContext(null);

/**
 * Holds the logged-in user (with permissions and assigned hostels).
 * The user is always re-loaded from the API (GET /auth/me) - never trusted from storage.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(tokenStore.get() ? 'loading' : 'guest'); // loading | authenticated | guest
  const [sessionMessage, setSessionMessage] = useState('');

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data);
      setStatus('authenticated');
    } catch {
      tokenStore.clear();
      setUser(null);
      setStatus('guest');
    }
  }, []);

  useEffect(() => {
    if (tokenStore.get()) loadMe();
  }, [loadMe]);

  // Any 401 from the API logs the user out (expired / deactivated / password changed)
  useEffect(() => {
    const handler = (event) => {
      if (!tokenStore.get()) return;
      tokenStore.clear();
      setUser(null);
      setStatus('guest');
      setSessionMessage(event.detail || 'Your session has ended. Please sign in again.');
    };
    window.addEventListener('hms:unauthorized', handler);
    return () => window.removeEventListener('hms:unauthorized', handler);
  }, []);

  const login = useCallback(async (identifier, password, remember) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    tokenStore.set(data.data.token, remember);
    setUser(data.data.user);
    setStatus('authenticated');
    setSessionMessage('');
    return data.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* token may already be invalid */
    }
    tokenStore.clear();
    setUser(null);
    setStatus('guest');
  }, []);

  /** Replace the stored token (after password change). */
  const replaceToken = useCallback((token) => {
    const remember = (() => {
      try {
        return Boolean(localStorage.getItem('hms_token'));
      } catch {
        return true;
      }
    })();
    tokenStore.set(token, remember);
  }, []);

  const value = useMemo(() => {
    const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
    const hasPermission = (...codes) => isSuperAdmin || codes.some((c) => user?.permissions?.includes(c));
    return { user, status, isSuperAdmin, hasPermission, login, logout, refresh: loadMe, setUser, replaceToken, sessionMessage };
  }, [user, status, login, logout, loadMe, replaceToken, sessionMessage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
