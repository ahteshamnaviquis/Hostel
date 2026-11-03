import { Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import LoginPage from '../pages/auth/LoginPage';
import DashboardPage from '../pages/dashboard/DashboardPage';
import ComingSoonPage from '../pages/ComingSoonPage';
import NotFoundPage from '../pages/errors/NotFoundPage';
import { ALL_NAV_ITEMS } from '../utils/navigation';

/**
 * Application routes.
 * CHUNK 2 will wrap the DashboardLayout routes in a <ProtectedRoute> (JWT + role/permission checks).
 */
export default function AppRoutes() {
  const placeholderItems = ALL_NAV_ITEMS.filter((item) => item.path !== '/dashboard');

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        {placeholderItems.map((item) => (
          <Route
            key={item.path}
            path={`${item.path}/*`}
            element={<ComingSoonPage title={item.label} chunk={item.chunk} icon={item.icon} />}
          />
        ))}
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
