import useApiHealth from '../../hooks/useApiHealth';

const DOTS = {
  checking: { color: 'bg-slate-400', label: 'Checking API...' },
  online: { color: 'bg-emerald-500', label: 'API & database connected' },
  degraded: { color: 'bg-amber-500', label: 'API online, database unavailable' },
  offline: { color: 'bg-red-500', label: 'API offline' },
};

/** Small indicator that shows whether the backend and MySQL are reachable. */
export default function ApiStatus({ className = '' }) {
  const { status, refresh } = useApiHealth();
  const { color, label } = DOTS[status];
  return (
    <button
      type="button"
      onClick={refresh}
      title="Click to re-check"
      className={`inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${color} ${status === 'checking' ? 'animate-pulse' : ''}`} />
      {label}
    </button>
  );
}
