import { Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import ProtectedRoute, { Guard } from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/common/Spinner';
import { firstAllowedPath } from '../utils/navigation';
import { ROLES } from '../utils/constants';

import LoginPage from '../pages/auth/LoginPage';
import DashboardPage from '../pages/dashboard/DashboardPage';
import ProfilePage from '../pages/ProfilePage';
import NotificationsPage from '../pages/NotificationsPage';
import HostelsPage from '../pages/hostels/HostelsPage';
import HostelDetailPage from '../pages/hostels/HostelDetailPage';
import AdministratorsPage from '../pages/users/AdministratorsPage';
import BuildingsPage from '../pages/property/BuildingsPage';
import FloorsPage from '../pages/property/FloorsPage';
import RoomsPage from '../pages/property/RoomsPage';
import RoomDetailPage from '../pages/property/RoomDetailPage';
import ResidentsPage from '../pages/residents/ResidentsPage';
import ResidentFormPage from '../pages/residents/ResidentFormPage';
import ResidentDetailPage from '../pages/residents/ResidentDetailPage';
import AdmissionsPage from '../pages/admissions/AdmissionsPage';
import NewAdmissionPage from '../pages/admissions/NewAdmissionPage';
import AdmissionDetailPage from '../pages/admissions/AdmissionDetailPage';
import AllocationsPage from '../pages/admissions/AllocationsPage';
import CheckInOutPage from '../pages/admissions/CheckInOutPage';
import FeesPage from '../pages/fees/FeesPage';
import ReceiptPage from '../pages/print/ReceiptPage';
import ExpensesPage from '../pages/expenses/ExpensesPage';
import FinancePage from '../pages/finance/FinancePage';
import AttendancePage from '../pages/operations/AttendancePage';
import VisitorsPage from '../pages/operations/VisitorsPage';
import ComplaintsPage from '../pages/operations/ComplaintsPage';
import ReportsPage from '../pages/reports/ReportsPage';
import AuditLogsPage from '../pages/system/AuditLogsPage';
import SettingsPage from '../pages/system/SettingsPage';
import NotFoundPage from '../pages/errors/NotFoundPage';

const SA = [ROLES.SUPER_ADMIN];

function HomeRedirect() {
  const { status, user } = useAuth();
  if (status === 'loading') return <PageLoader message="Loading..." />;
  return <Navigate to={status === 'authenticated' ? firstAllowedPath(user) : '/login'} replace />;
}

/**
 * Application routes. Every page is protected by login and, where needed, by role / permission.
 * The backend enforces the same rules - this only controls what is shown.
 */
export default function AppRoutes() {
  const g = (element, rule) => <Guard {...rule}>{element}</Guard>;
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute permission="payments.manage" />}>
        <Route path="/print/receipt/:id" element={<ReceiptPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={g(<DashboardPage />, { permission: 'dashboard.view' })} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />

          <Route path="/hostels" element={g(<HostelsPage />, { roles: SA })} />
          <Route path="/hostels/:id" element={g(<HostelDetailPage />, { roles: SA })} />
          <Route path="/administrators" element={g(<AdministratorsPage />, { roles: SA })} />
          <Route path="/audit-logs" element={g(<AuditLogsPage />, { roles: SA })} />
          <Route path="/settings" element={g(<SettingsPage />, { roles: SA })} />

          <Route path="/buildings" element={g(<BuildingsPage />, { permission: 'buildings.manage' })} />
          <Route path="/floors" element={g(<FloorsPage />, { permission: 'buildings.manage' })} />
          <Route path="/rooms" element={g(<RoomsPage />, { permission: ['rooms.manage', 'buildings.manage'] })} />
          <Route path="/rooms/:id" element={g(<RoomDetailPage />, { permission: ['rooms.manage', 'buildings.manage', 'admissions.manage'] })} />

          <Route path="/residents" element={g(<ResidentsPage />, { permission: 'residents.manage' })} />
          <Route path="/residents/new" element={g(<ResidentFormPage />, { permission: 'residents.manage' })} />
          <Route path="/residents/:id" element={g(<ResidentDetailPage />, { permission: ['residents.manage', 'admissions.manage', 'payments.manage'] })} />
          <Route path="/residents/:id/edit" element={g(<ResidentFormPage />, { permission: 'residents.manage' })} />

          <Route path="/admissions" element={g(<AdmissionsPage />, { permission: 'admissions.manage' })} />
          <Route path="/admissions/new" element={g(<NewAdmissionPage />, { permission: 'admissions.manage' })} />
          <Route path="/admissions/:id" element={g(<AdmissionDetailPage />, { permission: 'admissions.manage' })} />
          <Route path="/allocations" element={g(<AllocationsPage />, { permission: 'admissions.manage' })} />
          <Route path="/check-in-out" element={g(<CheckInOutPage />, { permission: 'admissions.manage' })} />

          <Route path="/fees" element={g(<FeesPage />, { permission: 'payments.manage' })} />
          <Route path="/expenses" element={g(<ExpensesPage />, { permission: 'expenses.manage' })} />
          <Route path="/finance" element={g(<FinancePage />, { permission: ['expenses.manage', 'payments.manage', 'reports.view'] })} />

          <Route path="/attendance" element={g(<AttendancePage />, { permission: 'attendance.manage' })} />
          <Route path="/visitors" element={g(<VisitorsPage />, { permission: 'visitors.manage' })} />
          <Route path="/complaints" element={g(<ComplaintsPage />, { permission: 'complaints.manage' })} />
          <Route path="/reports" element={g(<ReportsPage />, { permission: 'reports.view' })} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
