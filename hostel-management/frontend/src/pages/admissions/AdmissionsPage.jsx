import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
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

export default function AdmissionsPage() {
  useDocumentTitle('Admissions');
  const navigate = useNavigate();
  const { hostelId } = useHostel();
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/admissions', { ...filters, hostel_id: hostelId });
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Admissions"
        description="Admit residents, allocate beds and manage their stay."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Admissions' }]}
        actions={<Button icon={Plus} onClick={() => navigate('/admissions/new')}>New admission</Button>}
      />
      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs
            tabs={[{ key: '', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'pending', label: 'Pending check-in' }, { key: 'checked_out', label: 'Checked out' }, { key: 'cancelled', label: 'Cancelled' }]}
            active={filters.status}
            onChange={set('status')}
          />
        </div>
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder="Name, reg. no, admission no, room..." value={filters.search} onChange={set('search')} />
          <FilterDate label="From" value={filters.from} onChange={set('from')} />
          <FilterDate label="To" value={filters.to} onChange={set('to')} />
        </Toolbar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No admissions found"
          onRowClick={(r) => navigate(`/admissions/${r.id}`)}
          columns={[
            { key: 'admission_no', header: 'Admission', render: (r) => <Link to={`/admissions/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs font-medium text-brand-700">{r.admission_no}</Link> },
            { key: 'full_name', header: 'Resident', render: (r) => <div><div className="font-medium text-slate-800">{r.full_name}</div><div className="text-xs text-slate-500">{r.registration_no}</div></div> },
            { key: 'hostel_name', header: 'Hostel' },
            { key: 'room', header: 'Room / Bed', render: (r) => (r.room_number ? `${r.room_number} / ${r.bed_number}` : '-') },
            { key: 'admission_date', header: 'Admitted', render: (r) => formatDate(r.admission_date) },
            { key: 'expected_leaving_date', header: 'Expected leaving', render: (r) => formatDate(r.expected_leaving_date) },
            { key: 'monthly_rent', header: 'Rent', align: 'right', render: (r) => formatPKR(r.monthly_rent) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
    </div>
  );
}
