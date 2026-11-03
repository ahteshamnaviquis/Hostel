import { AlertTriangle } from 'lucide-react';
import Button from './Button';

/** Shown when a page / list fails to load. */
export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800">Could not load data</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
