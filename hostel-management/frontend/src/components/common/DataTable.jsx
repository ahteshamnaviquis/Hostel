import { PageLoader } from './Spinner';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';

/**
 * Responsive data table.
 * columns: [{ key, header, render?: (row) => node, align?: 'right' | 'center', className? }]
 */
export default function DataTable({
  columns, rows, rowKey = 'id', loading = false, error, onRetry, emptyTitle, emptyMessage, emptyAction, onRowClick, footer, dense = false,
}) {
  if (loading && !rows?.length) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows || rows.length === 0) return <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />;

  const keyOf = typeof rowKey === 'function' ? rowKey : (row, index) => row[rowKey] ?? index;
  const align = (col) => (col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left');
  return (
    <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${align(col)}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr
              key={keyOf(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`${onRowClick ? 'cursor-pointer' : ''} hover:bg-slate-50/70`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`whitespace-nowrap px-4 ${dense ? 'py-2' : 'py-3'} text-slate-700 ${align(col)} ${col.align === 'right' ? 'tabular-nums' : ''} ${col.className || ''}`}
                >
                  {col.render ? col.render(row, index) : row[col.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">{footer}</tfoot>}
      </table>
    </div>
  );
}
