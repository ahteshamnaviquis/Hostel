import { Outlet } from 'react-router-dom';
import { Hotel, ShieldCheck, BedDouble, Wallet } from 'lucide-react';
import { APP_NAME } from '../utils/constants';

const HIGHLIGHTS = [
  { icon: BedDouble, text: 'Rooms, beds and admissions in one place' },
  { icon: Wallet, text: 'Fee collection in PKR with printable receipts' },
  { icon: ShieldCheck, text: 'Secure, role-based access for every hostel' },
];

/** Split-screen layout for login and other public pages. */
export default function AuthLayout() {
  return (
    <div className="flex min-h-full">
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-700/40" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-800/60" aria-hidden="true" />

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            <Hotel className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Run your hostels with clarity and control.</h2>
          <p className="mt-3 text-brand-100/80">
            Built for hostels across Pakistan - from a single building to multi-city operations.
          </p>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-brand-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-100/60">© {new Date().getFullYear()} {APP_NAME}</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-4 py-10 sm:px-8">
        <Outlet />
      </div>
    </div>
  );
}
