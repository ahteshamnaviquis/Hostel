import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Eye, DoorOpen, BedDouble, BedSingle, Gauge } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterSelect } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import IconButton from '../../components/common/IconButton';
import RoomFormModal from '../../components/rooms/RoomFormModal';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useHostel } from '../../context/HostelContext';
import { useAuth } from '../../context/AuthContext';
import { ROOM_TYPES, labelOf } from '../../utils/constants';
import { formatPKR, formatNumber, formatPercent } from '../../utils/formatters';

const STATUSES = ['available', 'partially_occupied', 'fully_occupied', 'maintenance', 'inactive'].map((s) => ({ value: s, label: s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }));

export default function RoomsPage() {
  useDocumentTitle('Rooms');
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { hostelId } = useHostel();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', status: params.get('status') || '', room_type: '', building_id: '', availability: '', page: 1 });
  const { data: buildings } = useFetch('/buildings', { hostel_id: hostelId, limit: 200 });
  const { data, meta, loading, error, reload } = useFetch('/rooms', { ...filters, hostel_id: hostelId });
  const [modal, setModal] = useState({ open: false, room: null });
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  const canManage = hasPermission('rooms.manage');
  const s = meta?.summary;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Rooms"
        description="Room capacity, pricing and live bed availability."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Rooms' }]}
        actions={canManage && <Button icon={Plus} onClick={() => setModal({ open: true, room: null })}>Add room</Button>}
      />
      {s && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Rooms" value={formatNumber(s.rooms)} icon={DoorOpen} tone="slate" />
          <StatCard label="Capacity" value={formatNumber(s.capacity)} icon={BedDouble} tone="blue" />
          <StatCard label="Available beds" value={formatNumber(s.available)} icon={BedSingle} tone="amber" />
          <StatCard label="Occupancy" value={formatPercent(s.capacity ? (s.occupied / s.capacity) * 100 : 0)} icon={Gauge} tone="brand" hint={`${s.occupied} occupied`} />
        </div>
      )}
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchInput className="sm:w-60" placeholder="Room no. or facility..." value={filters.search} onChange={set('search')} />
          <FilterSelect value={filters.building_id} onChange={set('building_id')} placeholder="All buildings" options={(buildings || []).map((b) => ({ value: String(b.id), label: `${b.name} (${b.hostel_name})` }))} />
          <FilterSelect value={filters.room_type} onChange={set('room_type')} placeholder="All types" options={ROOM_TYPES} />
          <FilterSelect value={filters.status} onChange={set('status')} placeholder="All statuses" options={STATUSES} />
          <FilterSelect value={filters.availability} onChange={set('availability')} placeholder="Any availability" options={[{ value: 'available', label: 'Has free beds' }]} />
        </Toolbar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No rooms found"
          emptyMessage="Create buildings and floors, then add rooms."
          onRowClick={(r) => navigate(`/rooms/${r.id}`)}
          columns={[
            { key: 'room_number', header: 'Room', render: (r) => <div><Link to={`/rooms/${r.id}`} className="font-medium text-slate-800 hover:text-brand-700">{r.room_number}</Link><div className="text-xs text-slate-500">{labelOf(ROOM_TYPES, r.room_type)}</div></div> },
            { key: 'location', header: 'Location', render: (r) => <div><div>{r.building_name} · {r.floor_name}</div><div className="text-xs text-slate-500">{r.hostel_name}</div></div> },
            {
              key: 'beds', header: 'Beds',
              render: (r) => (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full bg-brand-600" style={{ width: `${r.active_beds ? (r.occupied_beds / r.active_beds) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs text-slate-600">{r.occupied_beds}/{r.active_beds} · {r.available_beds} free</span>
                </div>
              ),
            },
            { key: 'monthly_rent', header: 'Rent / bed', align: 'right', render: (r) => formatPKR(r.monthly_rent) },
            { key: 'security_deposit', header: 'Deposit', align: 'right', render: (r) => formatPKR(r.security_deposit) },
            { key: 'facilities', header: 'Facilities', className: 'max-w-[180px] truncate text-xs text-slate-500' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: '', align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <IconButton icon={Eye} label="View beds" onClick={() => navigate(`/rooms/${r.id}`)} />
                  {canManage && <IconButton icon={Pencil} label="Edit" tone="brand" onClick={() => setModal({ open: true, room: r })} />}
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
      <RoomFormModal open={modal.open} room={modal.room} onClose={() => setModal({ open: false, room: null })} onSaved={(room) => { setModal({ open: false, room: null }); if (!modal.room) navigate(`/rooms/${room.id}`); else reload(); }} />
    </div>
  );
}
