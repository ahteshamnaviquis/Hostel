import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, UserCircle, Building2 } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useHostel } from '../../context/HostelContext';
import { getInitials } from '../../utils/formatters';

/** Hostel switcher: filters every page by the selected hostel. */
function HostelSwitcher() {
  const { hostels, hostelId, setHostelId } = useHostel();
  if (hostels.length === 0) return null;
  if (hostels.length === 1) {
    return (
      <span className="hidden items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 md:inline-flex">
        <Building2 className="h-3.5 w-3.5" /> {hostels[0].name}
      </span>
    );
  }
  return (
    <label className="relative hidden md:block">
      <span className="sr-only">Select hostel</span>
      <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        value={hostelId}
        onChange={(e) => setHostelId(e.target.value)}
        className="h-9 max-w-[220px] rounded-lg border border-slate-300 bg-white pl-8 pr-8 text-sm text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <option value="">All hostels</option>
        {hostels.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
            {h.status !== 'active' ? ' (inactive)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Top navigation bar: menu toggle (mobile), page title, hostel switcher, notifications, user menu. */
export default function Topbar({ title, user, onMenuClick, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenuClick} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-800">{title}</h1>

      <HostelSwitcher />
      <NotificationBell />

      <div className="relative" ref={ref}>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100" aria-expanded={open} aria-haspopup="menu">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{getInitials(user?.fullName)}</span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[160px] truncate text-sm font-medium leading-tight text-slate-800">{user?.fullName}</span>
            <span className="block text-xs leading-tight text-slate-500">{user?.roleLabel}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
        </button>
        {open && (
          <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
            <div className="border-b border-slate-100 px-4 pb-2.5 pt-1">
              <p className="truncate text-sm font-medium text-slate-800">{user?.fullName}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <UserCircle className="h-4 w-4" /> My Profile & Password
            </Link>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
