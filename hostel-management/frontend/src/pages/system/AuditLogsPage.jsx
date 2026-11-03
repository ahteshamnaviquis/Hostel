import { useState } from 'react';
import { Eye } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterDate, FilterSelect } from '../../components/common/Toolbar';
import IconButton from '../../components/common/IconButton';
import Modal from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { InfoGrid } from '../../components/common/Fields';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDateTime, humanize } from '../../utils/formatters';

const parse = (v) => {
  if (!v) return null;
  try {
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return v;
  }
};

export default function AuditLogsPage() {
  useDocumentTitle('Audit Logs');
  const [filters, setFilters] = useState({ search: '', action: '', user_id: '', hostel_id: '', from: '', to: '', page: 1, limit: 25 });
  const { data, meta, loading, error, reload } = useFetch('/audit-logs', filters);
  const { data: users } = useFetch('/users', { limit: 200 });
  const { data: hostels } = useFetch('/hostels/options');
  const [view, setView] = useState(null);
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Audit Logs" description="Who did what and when: logins, admissions, allocations, transfers, payments, refunds, expenses, checkouts and changes." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Audit Logs' }]} />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchInput className="sm:w-64" placeholder="Search description or user..." value={filters.search} onChange={set('search')} />
          <FilterSelect value={filters.action} onChange={set('action')} placeholder="All modules" options={(meta?.modules || []).map((m) => ({ value: m, label: humanize(m) }))} />
          <FilterSelect value={filters.user_id} onChange={set('user_id')} placeholder="All users" options={(users || []).map((u) => ({ value: String(u.id), label: u.full_name }))} />
          <FilterSelect value={filters.hostel_id} onChange={set('hostel_id')} placeholder="All hostels" options={(hostels || []).map((h) => ({ value: String(h.id), label: h.name }))} />
          <FilterDate label="From" value={filters.from} onChange={set('from')} />
          <FilterDate label="To" value={filters.to} onChange={set('to')} />
        </Toolbar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} dense emptyTitle="No audit entries" columns={[
          { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
          { key: 'user_name', header: 'User', render: (r) => r.user_name || <span className="text-slate-400">System</span> },
          { key: 'action', header: 'Action', render: (r) => <Badge tone={r.action.includes('failed') ? 'red' : r.action.startsWith('auth') ? 'slate' : 'blue'}>{r.action}</Badge> },
          { key: 'description', header: 'Description', className: 'max-w-[420px] truncate' },
          { key: 'hostel_name', header: 'Hostel' },
          { key: 'ip_address', header: 'IP', className: 'font-mono text-xs' },
          { key: 'view', header: '', align: 'right', render: (r) => <IconButton icon={Eye} label="Details" onClick={() => setView(r)} /> },
        ]} />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
      <Modal open={Boolean(view)} onClose={() => setView(null)} size="lg" title="Audit entry">
        {view && (
          <div className="space-y-4">
            <InfoGrid cols={2} items={[
              { label: 'When', value: formatDateTime(view.created_at) }, { label: 'User', value: view.user_name ? `${view.user_name} (${view.user_email})` : 'System' },
              { label: 'Action', value: view.action }, { label: 'Entity', value: view.entity_type ? `${view.entity_type} #${view.entity_id}` : '-' },
              { label: 'Hostel', value: view.hostel_name }, { label: 'IP address', value: view.ip_address },
            ]} />
            <p className="text-sm text-slate-700">{view.description}</p>
            {['old_values', 'new_values'].map((k) => parse(view[k]) && (
              <div key={k}>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{k === 'old_values' ? 'Before' : 'After'}</p>
                <pre className="max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(parse(view[k]), null, 2)}</pre>
              </div>
            ))}
            <p className="break-all text-xs text-slate-400">{view.user_agent}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
