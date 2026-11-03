import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import useDocumentTitle from '../../hooks/useDocumentTitle';

export default function ForbiddenPage() {
  useDocumentTitle('Access denied');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <ShieldX className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Access denied</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">You do not have permission to open this page. Contact your Super Admin if you need access.</p>
      <Link to="/" className="mt-6 text-sm font-medium text-brand-700 hover:text-brand-800">
        Go to home
      </Link>
    </div>
  );
}
