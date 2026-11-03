import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { HostelProvider } from './context/HostelContext';
import { ToastProvider } from './context/ToastContext';

/** Root component: global providers + routes. */
export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider>
          <HostelProvider>
            <AppRoutes />
          </HostelProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
