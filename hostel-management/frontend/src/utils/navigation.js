import {
  LayoutDashboard,
  Building2,
  Building,
  Layers,
  DoorOpen,
  Users,
  ClipboardCheck,
  BedDouble,
  Wallet,
  Receipt,
  CalendarCheck,
  UserCheck,
  MessageSquareWarning,
  FileBarChart,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import { ROLES } from './constants';

/**
 * Sidebar navigation definition.
 *  - roles:      which roles may see the item (omit = all roles)
 *  - permission: permission code required for Hostel Admins (Super Admin sees everything)
 *  - chunk:      development chunk that delivers the module (shown on placeholder pages)
 */
export const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, permission: 'dashboard.view', chunk: 3 }],
  },
  {
    title: 'Property',
    items: [
      { label: 'Hostels', path: '/hostels', icon: Building2, roles: [ROLES.SUPER_ADMIN], chunk: 3 },
      { label: 'Buildings', path: '/buildings', icon: Building, permission: 'buildings.manage', chunk: 4 },
      { label: 'Floors', path: '/floors', icon: Layers, permission: 'buildings.manage', chunk: 4 },
      { label: 'Rooms', path: '/rooms', icon: DoorOpen, permission: 'rooms.manage', chunk: 4 },
    ],
  },
  {
    title: 'Residents',
    items: [
      { label: 'Residents', path: '/residents', icon: Users, permission: 'residents.manage', chunk: 5 },
      { label: 'Admissions', path: '/admissions', icon: ClipboardCheck, permission: 'admissions.manage', chunk: 6 },
      { label: 'Allocations', path: '/allocations', icon: BedDouble, permission: 'admissions.manage', chunk: 6 },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Fees & Payments', path: '/fees', icon: Wallet, permission: 'payments.manage', chunk: 7 },
      { label: 'Expenses', path: '/expenses', icon: Receipt, permission: 'expenses.manage', chunk: 8 },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Attendance', path: '/attendance', icon: CalendarCheck, permission: 'attendance.manage', chunk: 10 },
      { label: 'Visitors', path: '/visitors', icon: UserCheck, permission: 'visitors.manage', chunk: 11 },
      { label: 'Complaints', path: '/complaints', icon: MessageSquareWarning, permission: 'complaints.manage', chunk: 12 },
      { label: 'Reports', path: '/reports', icon: FileBarChart, permission: 'reports.view', chunk: 14 },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Administrators', path: '/administrators', icon: ShieldCheck, roles: [ROLES.SUPER_ADMIN], chunk: 2 },
      { label: 'Settings', path: '/settings', icon: Settings, roles: [ROLES.SUPER_ADMIN], chunk: 15 },
    ],
  },
];

/** Returns the navigation filtered for a user ({ role, permissions[] }). */
export function getNavigationForUser(user) {
  if (!user) return [];
  const isSuperAdmin = user.role === ROLES.SUPER_ADMIN;
  const permissions = new Set(user.permissions || []);

  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.roles && !item.roles.includes(user.role)) return false;
      if (isSuperAdmin || !item.permission) return true;
      return permissions.has(item.permission);
    }),
  })).filter((section) => section.items.length > 0);
}

/** Flat list of every navigation item (used for page titles and placeholder routes). */
export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);
