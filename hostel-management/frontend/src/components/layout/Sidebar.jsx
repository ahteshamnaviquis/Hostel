import { NavLink } from 'react-router-dom';
import { Hotel, X } from 'lucide-react';
import { getNavigationForUser } from '../../utils/navigation';
import { APP_SHORT_NAME } from '../../utils/constants';

/**
 * Left navigation. Fixed on desktop (lg+), off-canvas drawer on mobile/tablet.
 * Menu items are filtered by the user's role and permissions.
 */
export default function Sidebar({ user, open, onClose }) {
  const sections = getNavigationForUser(user);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-slate-900/50 transition-opacity lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform duration-200
          lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <NavLink to="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Hotel className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight text-white">{APP_SHORT_NAME}</span>
          </NavLink>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
              <ul className="space-y-0.5">
                {section.items.map(({ label, path, icon: Icon }) => (
                  <li key={path}>
                    <NavLink
                      to={path}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive ? 'bg-brand-700 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-500">v0.1.0 · Made for Pakistan</div>
      </aside>
    </>
  );
}
