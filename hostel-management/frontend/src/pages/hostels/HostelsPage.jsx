import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Eye, Pencil, Power } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterSelect } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import IconButton from '../../components/common/IconButton';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import HostelFormModal from '../../components/hostels/HostelFormModal';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { HOSTEL_TYPES, PAKISTAN_PROVINCES, toOptions } from '../../utils/constants';
import { formatNumber, humanize } from '../../utils/formatters';

export default function HostelsPage() {
  useDocumentTitle('Hostels');
  const toast = useToast();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', status: '', hostel_type: '', province: '', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/hostels', filters);
  const [modal, setModal] = useState({ open: params.get('new') === '1', hostel: null });
  const [toggle, setToggle] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') setParams({}, { replace: true });
  }, [params, setParams]);

  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  const changeStatus = async () => {
    setBusy(true);
    try {
      const next = toggle.status === 'active' ? 'inactive' : 'active';
      const { data: res } = await api.patch(`/hostels/${toggle.id}/status`, { status: next });
      toast.success(res.message);
      await refresh();
      reload();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setBusy(false);
      setToggle(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Hostels"
        description="Create and manage all hostels on the platform."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Hostels' }]}
        actions={<Button icon={Plus} onClick={() => setModal({ open: true, hostel: null })}>Add hostel</Button>}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder="Search name, code, city, warden..." value={filters.search} onChange={set('search')} />
          <FilterSelect value={filters.hostel_type} onChange={set('hostel_type')} placeholder="All types" options={HOSTEL_TYPES} />
          <FilterSelect value={filters.province} onChange={set('province')} placeholder="All provinces" options={toOptions(PAKISTAN_PROVINCES)} />
          <FilterSelect value={filters.status} onChange={set('status')} placeholder="All statuses" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </Toolbar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No hostels found"
          emptyMessage="Add your first hostel to start managing rooms and residents."
          onRowClick={(r) => navigate(`/hostels/${r.id}`)}
          columns={[
            {
              key: 'name', header: 'Hostel',
              render: (r) => (
                <div>
                  <Link to={`/hostels/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 hover:text-brand-700">{r.name}</Link>
                  <div className="text-xs text-slate-500">{r.code} · {humanize(r.hostel_type)}</div>
                </div>
              ),
            },
            { key: 'city', header: 'Location', render: (r) => <div><div>{r.city}</div><div className="text-xs text-slate-500">{r.province}</div></div> },
            { key: 'warden_name', header: 'Warden', render: (r) => <div><div>{r.warden_name || '-'}</div><div className="text-xs text-slate-500">{r.warden_contact || r.contact_number}</div></div> },
            { key: 'rooms_count', header: 'Rooms', align: 'right', render: (r) => formatNumber(r.rooms_count) },
            { key: 'beds', header: 'Beds (occ./total)', align: 'right', render: (r) => `${r.occupied_beds} / ${r.total_beds}` },
            { key: 'active_residents', header: 'Residents', align: 'right' },
            { key: 'admins_count', header: 'Admins', align: 'right' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: '', align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <IconButton icon={Eye} label="View details" onClick={() => navigate(`/hostels/${r.id}`)} />
                  <IconButton icon={Pencil} label="Edit" tone="brand" onClick={() => setModal({ open: true, hostel: r })} />
                  <IconButton icon={Power} label={r.status === 'active' ? 'Deactivate' : 'Activate'} tone={r.status === 'active' ? 'red' : 'brand'} onClick={() => setToggle(r)} />
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>

      <HostelFormModal
        open={modal.open}
        hostel={modal.hostel}
        onClose={() => setModal({ open: false, hostel: null })}
        onSaved={(h) => {
          setModal({ open: false, hostel: null });
          if (!modal.hostel) navigate(`/hostels/${h.id}`);
          else reload();
        }}
      />
      <ConfirmDialog
        open={Boolean(toggle)}
        title={toggle?.status === 'active' ? 'Deactivate hostel?' : 'Activate hostel?'}
        message={
          toggle?.status === 'active'
            ? `${toggle?.name} will be hidden from administrators' work areas and no new admissions can be made. Existing records are kept.`
            : `${toggle?.name} will become available again.`
        }
        confirmLabel={toggle?.status === 'active' ? 'Deactivate' : 'Activate'}
        variant={toggle?.status === 'active' ? 'danger' : 'primary'}
        loading={busy}
        onCancel={() => setToggle(null)}
        onConfirm={changeStatus}
      />
    </div>
  );
}
