import { PageLoader } from './Spinner';
import EmptyState from './EmptyState';

/**
 * Simple, responsive data table.
 * columns: [{ key: 'name', header: 'Name', render?: (row) => node, align?: 'right', className? }]
 */
export default function DataTable({ columns, rows, rowKey = 'id', loading = false, emptyTitle, emptyMessage }) {
  if (loading) return <PageLoader />;
  if (!rows || rows.length === 0) return <EmptyState title={emptyTitle} message={emptyMessage} />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500
                  ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr key={row[rowKey]} className="hover:bg-slate-50/70">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`whitespace-nowrap px-4 py-3 text-slate-700 ${col.align === 'right' ? 'text-right tabular-nums' : ''} ${col.className || ''}`}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
