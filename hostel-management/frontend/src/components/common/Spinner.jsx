const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' };

/** Circular loading indicator. */
export default function Spinner({ size = 'md', className = 'text-brand-700', label = 'Loading' }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full border-current border-r-transparent ${SIZES[size]} ${className}`}
    />
  );
}

/** Full-area loader for pages and cards. */
export function PageLoader({ message = 'Loading...' }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner size="lg" />
      {message}
    </div>
  );
}
