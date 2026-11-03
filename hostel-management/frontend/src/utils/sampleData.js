/**
 * ==================================================================
 *  SAMPLE DATA - FOR UI LAYOUT ONLY (CHUNK 1)
 *  This file is used only to preview the dashboard design.
 *  It will be replaced by real database data in CHUNK 3 and must
 *  never be used by completed modules.
 * ==================================================================
 */

export const SAMPLE_USER = {
  id: 0,
  fullName: 'Demo Super Admin',
  email: 'superadmin@example.pk',
  role: 'super_admin',
  roleLabel: 'Super Admin',
  permissions: [],
};

export const sampleStats = {
  totalHostels: 4,
  totalAdministrators: 6,
  totalBuildings: 9,
  totalRooms: 186,
  totalCapacity: 520,
  totalResidents: 437,
  occupiedBeds: 437,
  availableBeds: 83,
  occupancyPercent: 84.0,
  feeCollected: 5245000,
  pendingFees: 812500,
  totalExpenses: 1930000,
  monthlyRevenue: 5245000,
};

export const sampleHostelOccupancy = [
  { hostel: 'Gulberg Boys', occupied: 142, available: 18 },
  { hostel: 'Johar Town Girls', occupied: 118, available: 22 },
  { hostel: 'G-11 Islamabad', occupied: 96, available: 24 },
  { hostel: 'Saddar Karachi', occupied: 81, available: 19 },
];

export const sampleMonthlyFinance = [
  { month: 'Jun', collected: 4380000, expenses: 1710000 },
  { month: 'Jul', collected: 4520000, expenses: 1795000 },
  { month: 'Aug', collected: 4610000, expenses: 1820000 },
  { month: 'Sep', collected: 4985000, expenses: 1860000 },
  { month: 'Oct', collected: 5110000, expenses: 1905000 },
  { month: 'Nov', collected: 5245000, expenses: 1930000 },
];

export const sampleHostelRevenue = [
  { hostel: 'Gulberg Boys', revenue: 1820000 },
  { hostel: 'Johar Town Girls', revenue: 1460000 },
  { hostel: 'G-11 Islamabad', revenue: 1155000 },
  { hostel: 'Saddar Karachi', revenue: 810000 },
];

export const sampleRecentAdmissions = [
  { id: 1, name: 'Muhammad Usman', hostel: 'Gulberg Boys', room: 'A-204 / B2', date: '2026-11-02' },
  { id: 2, name: 'Ayesha Siddiqui', hostel: 'Johar Town Girls', room: 'B-101 / B1', date: '2026-11-01' },
  { id: 3, name: 'Hamza Tariq', hostel: 'G-11 Islamabad', room: 'C-305 / B3', date: '2026-10-30' },
  { id: 4, name: 'Bilal Ahmed', hostel: 'Saddar Karachi', room: 'A-012 / B1', date: '2026-10-29' },
];

export const sampleRecentPayments = [
  { id: 1, name: 'Fatima Noor', receipt: 'RCP-000921', amount: 18500, method: 'JazzCash', date: '2026-11-03' },
  { id: 2, name: 'Ali Raza', receipt: 'RCP-000920', amount: 22000, method: 'Cash', date: '2026-11-03' },
  { id: 3, name: 'Zainab Khan', receipt: 'RCP-000919', amount: 15000, method: 'Bank Transfer', date: '2026-11-02' },
  { id: 4, name: 'Umar Farooq', receipt: 'RCP-000918', amount: 9500, method: 'Easypaisa', date: '2026-11-02' },
];

export const sampleRecentActivities = [
  { id: 1, text: 'Room transfer: Hamza Tariq moved from C-301 to C-305', time: '2 hours ago', type: 'transfer' },
  { id: 2, text: 'Complaint #CMP-0142 (Water) marked resolved', time: '4 hours ago', type: 'complaint' },
  { id: 3, text: 'Monthly fees generated for November 2026', time: 'Yesterday', type: 'fee' },
  { id: 4, text: 'Check-out completed: Saad Malik (Gulberg Boys)', time: 'Yesterday', type: 'checkout' },
];
