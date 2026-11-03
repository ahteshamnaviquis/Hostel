import { Link } from 'react-router-dom';
import useDocumentTitle from '../../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The page you are looking for does not exist or has been moved.</p>
      <Link
        to="/"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
      >
        Go to home
      </Link>
    </div>
  );
}
