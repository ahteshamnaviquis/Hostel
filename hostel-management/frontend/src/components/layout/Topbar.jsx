import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, UserCircle, KeyRound } from 'lucide-react';
import EmptyState from '../common/EmptyState';
import { getInitials } from '../../utils/formatters';

/** Closes a dropdown when clicking outside of it. */
function useClickOutside(onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

/**
 * Top navigation bar: menu toggle (mobile), page title, notifications, user menu.
 */
export default function Topbar({ title, user, onMenuClick, onLogout }) {
  const [openMenu, setOpenMenu] = useState(null); // 'notifications' | 'user' | null
  const close = () => setOpenMenu(null);
  const notificationsRef = useClickOutside(() => openMenu === 'notifications' && close());
  const userRef = useClickOutside(() => openMenu === 'user' && close());

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenuClick} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-800">{title}</h1>

      {/* Notifications (wired to real data in CHUNK 13) */}
      <div className="relative" ref={notificationsRef}>
        <button
          onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
          className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Notifications"
          aria-expanded={openMenu === 'notifications'}
        >
          <Bell className="h-5 w-5" />
        </button>
        {openMenu === 'notifications' && (
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Notifications</div>
            <EmptyState icon={Bell} title="You're all caught up" message="Fee, checkout and complaint alerts will appear here." />
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative" ref={userRef}>
        <button
          onClick={() => setOpenMenu(openMenu === 'user' ? null : 'user')}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
          aria-expanded={openMenu === 'user'}
          aria-haspopup="menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
            {getInitials(user?.fullName)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-slate-800">{user?.fullName}</span>
            <span className="block text-xs leading-tight text-slate-500">{user?.roleLabel}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
        </button>
        {openMenu === 'user' && (
          <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
            <div className="border-b border-slate-100 px-4 pb-2.5 pt-1">
              <p className="truncate text-sm font-medium text-slate-800">{user?.fullName}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <button role="menuitem" disabled className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-400" title="Available in CHUNK 2">
              <UserCircle className="h-4 w-4" /> My Profile
            </button>
            <button role="menuitem" disabled className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-400" title="Available in CHUNK 2">
              <KeyRound className="h-4 w-4" /> Change Password
            </button>
            <button
              role="menuitem"
              onClick={() => {
                close();
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
