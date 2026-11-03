import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterDate } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs from '../../components/common/Tabs';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useHostel } from '../../context/HostelContext';
import { formatDate, formatPKR } from '../../utils/formatters';

/** Room allocations (current + history) and room transfers. */
export default function AllocationsPage() {
  useDocumentTitle('Allocations');
  const { hostelId } = useHostel();
  const [tab, setTab] = useState('active');
  const [filters, setFilters] = useState({ search: '', from: '', to: '', page: 1 });
  const isTransfers = tab === 'transfers';
  const { data, meta, loading, error, reload } = useFetch(isTransfers ? '/transfers' : '/allocations', {
    ...filters, hostel_id: hostelId, status: isTransfers || tab === 'all' ? '' : tab,
  });
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Allocations" description="Who is in which bed, and the complete allocation and transfer history." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Allocations' }]} />
      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs active={tab} onChange={(t) => { setTab(t); setFilters((f) => ({ ...f, page: 1 })); }} tabs={[
            { key: 'active', label: 'Current allocations' }, { key: 'all', label: 'All history' }, { key: 'transferred', label: 'Transferred' },
            { key: 'released', label: 'Released' }, { key: 'transfers', label: 'Room transfers' },
          ]} />
        </div>
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder={isTransfers ? 'Resident name / reg. no...' : 'Resident or room number...'} value={filters.search} onChange={set('search')} />
          {isTransfers && <><FilterDate label="From" value={filters.from} onChange={set('from')} /><FilterDate label="To" value={filters.to} onChange={set('to')} /></>}
        </Toolbar>
        {isTransfers ? (
          <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No transfers" columns={[
            { key: 'transfer_date', header: 'Date', render: (r) => formatDate(r.transfer_date) },
            { key: 'full_name', header: 'Resident', render: (r) => <Link to={`/admissions/${r.admission_id}`} className="font-medium text-slate-800 hover:text-brand-700">{r.full_name}</Link> },
            { key: 'hostel_name', header: 'Hostel' },
            { key: 'from_bed', header: 'From' },
            { key: 'to_bed', header: 'To' },
            { key: 'rent', header: 'Rent change', align: 'right', render: (r) => (r.from_rent === r.to_rent ? formatPKR(r.to_rent) : `${formatPKR(r.from_rent)} → ${formatPKR(r.to_rent)}`) },
            { key: 'reason', header: 'Reason', className: 'max-w-[220px] truncate' },
            { key: 'transferred_by_name', header: 'By' },
          ]} />
        ) : (
          <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No allocations" columns={[
            { key: 'full_name', header: 'Resident', render: (r) => <div><Link to={`/admissions/${r.admission_id}`} className="font-medium text-slate-800 hover:text-brand-700">{r.full_name}</Link><div className="text-xs text-slate-500">{r.registration_no} · {r.admission_no}</div></div> },
            { key: 'bed', header: 'Room / Bed', render: (r) => <div><div>{r.room_number} / {r.bed_number}</div><div className="text-xs text-slate-500">{r.building_name} · {r.hostel_name}</div></div> },
            { key: 'start_date', header: 'From', render: (r) => formatDate(r.start_date) },
            { key: 'end_date', header: 'To', render: (r) => formatDate(r.end_date) },
            { key: 'monthly_rent', header: 'Rent', align: 'right', render: (r) => formatPKR(r.monthly_rent) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'release_reason', header: 'Notes', className: 'max-w-[200px] truncate text-xs text-slate-500' },
          ]} />
        )}
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
    </div>
  );
}
