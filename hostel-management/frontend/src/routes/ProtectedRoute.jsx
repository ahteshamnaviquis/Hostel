import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/common/Spinner';
import { canAccess } from '../utils/navigation';
import ForbiddenPage from '../pages/errors/ForbiddenPage';

/** Requires login. Optional roles / permission check for the nested routes. */
export default function ProtectedRoute({ roles, permission }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader message="Loading your account..." />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if ((roles || permission) && !canAccess(user, { roles, permission })) return <ForbiddenPage />;
  return <Outlet />;
}

/** Wraps a single page element with a role/permission check. */
export function Guard({ roles, permission, children }) {
  const { user } = useAuth();
  if (!canAccess(user, { roles, permission })) return <ForbiddenPage />;
  return children;
}
