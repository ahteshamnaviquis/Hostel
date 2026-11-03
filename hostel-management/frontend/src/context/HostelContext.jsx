import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

const HostelContext = createContext(null);
const KEY = 'hms_hostel';

/**
 * The hostel currently selected in the top bar.
 * hostelId === '' means "all hostels I can access".
 * Admins with a single hostel are locked to it.
 */
export function HostelProvider({ children }) {
  const { user } = useAuth();
  const hostels = useMemo(() => user?.hostels || [], [user]);
  const [hostelId, setHostelIdState] = useState(() => {
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  });

  // Keep the selection valid for the current user
  useEffect(() => {
    if (!user) return;
    if (hostels.length === 1) setHostelIdState(String(hostels[0].id));
    else if (hostelId && !hostels.some((h) => String(h.id) === String(hostelId))) setHostelIdState('');
  }, [user, hostels, hostelId]);

  const setHostelId = (id) => {
    setHostelIdState(String(id || ''));
    try {
      localStorage.setItem(KEY, String(id || ''));
    } catch {
      /* ignore */
    }
  };

  const value = useMemo(() => {
    const selected = hostels.find((h) => String(h.id) === String(hostelId)) || null;
    return {
      hostels,
      activeHostels: hostels.filter((h) => h.status === 'active'),
      hostelId,
      selectedHostel: selected,
      setHostelId,
      /** A concrete hostel id for actions that need one (selected or the only one). */
      defaultHostelId: hostelId || (hostels.length === 1 ? String(hostels[0].id) : ''),
    };
  }, [hostels, hostelId]);

  return <HostelContext.Provider value={value}>{children}</HostelContext.Provider>;
}

export const useHostel = () => useContext(HostelContext);
