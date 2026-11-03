import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Page navigation for list responses with meta { page, totalPages, total, limit }. */
export default function Pagination({ meta, onPageChange }) {
  if (!meta || !meta.total) return null;
  const { page, totalPages, total, limit } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row">
      <span>
        Showing <b>{from}</b>–<b>{to}</b> of <b>{total}</b>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <span className="px-2">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 hover:bg-slate-50 disabled:opacity-40"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
