import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Eye } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterSelect } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import IconButton from '../../components/common/IconButton';
import Tabs from '../../components/common/Tabs';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useHostel } from '../../context/HostelContext';
import { useAuth } from '../../context/AuthContext';
import { GENDERS } from '../../utils/constants';
import { formatDate, formatPKR } from '../../utils/formatters';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'checked_out', label: 'Checked Out' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function ResidentsPage() {
  useDocumentTitle('Residents');
  const navigate = useNavigate();
  const { hostelId } = useHostel();
  const { hasPermission } = useAuth();
  const [filters, setFilters] = useState({ search: '', status: '', gender: '', institution: '', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/residents', { ...filters, hostel_id: hostelId });
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Residents"
        description="Students and working residents registered in your hostels."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Residents' }]}
        actions={hasPermission('residents.manage') && <Button icon={UserPlus} onClick={() => navigate('/residents/new')}>Register resident</Button>}
      />
      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs tabs={STATUS_TABS} active={filters.status} onChange={set('status')} />
        </div>
        <Toolbar>
          <SearchInput className="sm:w-80" placeholder="Name, CNIC, mobile, reg. no, student ID..." value={filters.search} onChange={set('search')} />
          <FilterSelect value={filters.gender} onChange={set('gender')} placeholder="All genders" options={GENDERS} />
          <SearchInput className="sm:w-56" placeholder="Institution / company" value={filters.institution} onChange={set('institution')} />
        </Toolbar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No residents found"
          emptyMessage="Register a resident, then admit them to a room."
          onRowClick={(r) => navigate(`/residents/${r.id}`)}
          columns={[
            { key: 'full_name', header: 'Resident', render: (r) => <div><Link to={`/residents/${r.id}`} className="font-medium text-slate-800 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>{r.full_name}</Link><div className="text-xs text-slate-500">{r.registration_no}{r.father_name ? ` · s/o ${r.father_name}` : ''}</div></div> },
            { key: 'cnic', header: 'CNIC / B-Form' },
            { key: 'mobile', header: 'Mobile' },
            { key: 'institution', header: 'Institution', className: 'max-w-[180px] truncate' },
            { key: 'room', header: 'Room / Bed', render: (r) => (r.room_number ? `${r.room_number} / ${r.bed_number}` : '-') },
            { key: 'hostel_name', header: 'Hostel' },
            { key: 'admission_date', header: 'Admitted', render: (r) => formatDate(r.admission_date) },
            { key: 'outstanding', header: 'Dues', align: 'right', render: (r) => (r.outstanding > 0 ? <span className="font-medium text-red-600">{formatPKR(r.outstanding)}</span> : '-') },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'actions', header: '', align: 'right', render: (r) => <IconButton icon={Eye} label="View profile" onClick={(e) => { e.stopPropagation(); navigate(`/residents/${r.id}`); }} /> },
          ]}
        />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
    </div>
  );
}
