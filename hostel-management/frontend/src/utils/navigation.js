import {
  LayoutDashboard, Building2, Building, Layers, DoorOpen, Users, ClipboardCheck, BedDouble, Wallet, Receipt, CalendarCheck,
  UserCheck, MessageSquareWarning, FileBarChart, ShieldCheck, Settings, LogOut, TrendingUp, History,
} from 'lucide-react';
import { ROLES } from './constants';

/**
 * Sidebar navigation definition.
 *  - roles:      which roles may see the item (omit = all roles)
 *  - permission: permission code(s) required for Hostel Admins (Super Admin sees everything)
 */
export const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, permission: 'dashboard.view' }],
  },
  {
    title: 'Property',
    items: [
      { label: 'Hostels', path: '/hostels', icon: Building2, roles: [ROLES.SUPER_ADMIN] },
      { label: 'Buildings', path: '/buildings', icon: Building, permission: 'buildings.manage' },
      { label: 'Floors', path: '/floors', icon: Layers, permission: 'buildings.manage' },
      { label: 'Rooms', path: '/rooms', icon: DoorOpen, permission: ['rooms.manage', 'buildings.manage'] },
    ],
  },
  {
    title: 'Residents',
    items: [
      { label: 'Residents', path: '/residents', icon: Users, permission: 'residents.manage' },
      { label: 'Admissions', path: '/admissions', icon: ClipboardCheck, permission: 'admissions.manage' },
      { label: 'Allocations', path: '/allocations', icon: BedDouble, permission: 'admissions.manage' },
      { label: 'Check-in / Check-out', path: '/check-in-out', icon: LogOut, permission: 'admissions.manage' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Fees & Payments', path: '/fees', icon: Wallet, permission: 'payments.manage' },
      { label: 'Expenses', path: '/expenses', icon: Receipt, permission: 'expenses.manage' },
      { label: 'Financial Summary', path: '/finance', icon: TrendingUp, permission: ['expenses.manage', 'payments.manage', 'reports.view'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Attendance', path: '/attendance', icon: CalendarCheck, permission: 'attendance.manage' },
      { label: 'Visitors', path: '/visitors', icon: UserCheck, permission: 'visitors.manage' },
      { label: 'Complaints', path: '/complaints', icon: MessageSquareWarning, permission: 'complaints.manage' },
      { label: 'Reports', path: '/reports', icon: FileBarChart, permission: 'reports.view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Administrators', path: '/administrators', icon: ShieldCheck, roles: [ROLES.SUPER_ADMIN] },
      { label: 'Audit Logs', path: '/audit-logs', icon: History, roles: [ROLES.SUPER_ADMIN] },
      { label: 'Settings', path: '/settings', icon: Settings, roles: [ROLES.SUPER_ADMIN] },
    ],
  },
];

/** True when the user may open a navigation item / route. */
export function canAccess(user, { roles, permission } = {}) {
  if (!user) return false;
  if (roles && !roles.includes(user.role)) return false;
  if (user.role === ROLES.SUPER_ADMIN || !permission) return true;
  const codes = Array.isArray(permission) ? permission : [permission];
  return codes.some((c) => user.permissions?.includes(c));
}

/** Returns the navigation filtered for a user ({ role, permissions[] }). */
export function getNavigationForUser(user) {
  return NAV_SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => canAccess(user, item)) })).filter(
    (section) => section.items.length > 0
  );
}

/** Flat list of every navigation item (used for page titles). */
export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

/** First page a user can open (used after login). */
export const firstAllowedPath = (user) => getNavigationForUser(user)[0]?.items[0]?.path || '/profile';
