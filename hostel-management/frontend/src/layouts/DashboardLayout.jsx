import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { ALL_NAV_ITEMS } from '../utils/navigation';
import { SAMPLE_USER } from '../utils/sampleData';

/**
 * Authenticated application shell: sidebar + top bar + page content.
 * CHUNK 1: uses a sample user. CHUNK 2 replaces it with the logged-in user (AuthContext).
 */
export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = SAMPLE_USER;

  const current = ALL_NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));
  const title = current?.label || 'Hostel Management System';

  return (
    <div className="min-h-full">
      <Sidebar user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-full flex-col lg:pl-64">
        <Topbar title={title} user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={() => setConfirmLogout(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        message="You will need to sign in again to access the system."
        confirmLabel="Logout"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          navigate('/login');
        }}
      />
    </div>
  );
}
