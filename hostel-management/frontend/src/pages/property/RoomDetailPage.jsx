import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Wrench, Power, Trash2, BedSingle, UserPlus, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorState from '../../components/common/ErrorState';
import { PageLoader } from '../../components/common/Spinner';
import { InfoGrid } from '../../components/common/Fields';
import RoomFormModal from '../../components/rooms/RoomFormModal';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { ROOM_TYPES, labelOf } from '../../utils/constants';
import { formatDate, formatPKR, humanize } from '../../utils/formatters';

const BED_STYLES = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  occupied: 'border-brand-200 bg-brand-50 text-brand-900',
  maintenance: 'border-amber-200 bg-amber-50 text-amber-800',
  inactive: 'border-slate-200 bg-slate-50 text-slate-400',
};

export default function RoomDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { data: room, loading, error, reload } = useFetch(`/rooms/${id}`);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle(room ? `Room ${room.room_number}` : 'Room');
  const canManage = hasPermission('rooms.manage');

  if (loading && !room) return <PageLoader />;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;

  const run = async (fn, success) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(res?.data?.message || success);
      if (confirm?.after) confirm.after();
      else reload();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const activeBeds = room.beds.filter((b) => b.status !== 'inactive');

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Room ${room.room_number}`}
        description={`${room.hostel_name} › ${room.building_name} › ${room.floor_name}`}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Rooms', to: '/rooms' }, { label: room.room_number }]}
        actions={
          canManage && (
            <>
              {room.status === 'maintenance' || room.status === 'inactive' ? (
                <Button variant="secondary" icon={CheckCircle2} onClick={() => setConfirm({ title: 'Make room available?', message: 'Beds will be available for allocation again.', label: 'Activate', variant: 'primary', action: () => api.patch(`/rooms/${room.id}/status`, { status: 'active' }) })}>
                  Make available
                </Button>
              ) : (
                <Button variant="secondary" icon={Wrench} onClick={() => setConfirm({ title: 'Put room under maintenance?', message: 'No new residents can be allocated while the room is under maintenance. Current residents are not affected.', label: 'Set maintenance', variant: 'primary', action: () => api.patch(`/rooms/${room.id}/status`, { status: 'maintenance' }) })}>
                  Maintenance
                </Button>
              )}
              {room.status !== 'inactive' && (
                <Button variant="secondary" icon={Power} onClick={() => setConfirm({ title: 'Deactivate room?', message: 'Inactive rooms are excluded from capacity. Only rooms without residents can be deactivated.', label: 'Deactivate', action: () => api.patch(`/rooms/${room.id}/status`, { status: 'inactive' }) })}>
                  Deactivate
                </Button>
              )}
              <Button variant="secondary" icon={Trash2} onClick={() => setConfirm({ title: 'Delete room?', message: 'The room will be removed. Allocation history is kept. Only rooms without residents can be deleted.', label: 'Delete', action: () => api.delete(`/rooms/${room.id}`), after: () => navigate('/rooms') })}>
                Delete
              </Button>
              <Button icon={Pencil} onClick={() => setEdit(true)}>Edit room</Button>
            </>
          )
        }
      />

      <Card className="mb-6">
        <InfoGrid
          cols={4}
          items={[
            { label: 'Status', value: <StatusBadge status={room.status} /> },
            { label: 'Room type', value: labelOf(ROOM_TYPES, room.room_type) },
            { label: 'Capacity', value: `${room.active_beds} bed(s)` },
            { label: 'Occupied / Available', value: `${room.occupied_beds} / ${room.available_beds}` },
            { label: 'Monthly rent (per bed)', value: formatPKR(room.monthly_rent) },
            { label: 'Security deposit', value: formatPKR(room.security_deposit) },
            { label: 'Facilities', value: room.facilities },
            { label: 'Hostel type', value: humanize(room.hostel_type) },
          ]}
        />
      </Card>

      <Card title="Beds" subtitle="Click a resident to open the admission" className="mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {activeBeds.map((bed) => (
            <div key={bed.id} className={`rounded-xl border p-4 ${BED_STYLES[bed.status]}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold"><BedSingle className="h-4 w-4" /> {bed.bed_number}</span>
                <StatusBadge status={bed.status} />
              </div>
              {bed.status === 'occupied' ? (
                <div className="mt-3 text-sm">
                  <Link to={`/admissions/${bed.admission_id}`} className="font-medium hover:underline">{bed.resident_name}</Link>
                  <div className="text-xs opacity-80">{bed.registration_no} · since {formatDate(bed.start_date)}</div>
                  <div className="text-xs opacity-80">Rent {formatPKR(bed.allocated_rent)}</div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {bed.status === 'available' && room.status !== 'maintenance' && room.status !== 'inactive' && hasPermission('admissions.manage') && (
                    <Link to={`/admissions/new?bed=${bed.id}&hostel=${room.hostel_id}`} className="inline-flex items-center gap-1 text-xs font-medium hover:underline">
                      <UserPlus className="h-3.5 w-3.5" /> Admit resident
                    </Link>
                  )}
                  {canManage && (
                    <button
                      className="text-xs font-medium hover:underline"
                      onClick={() => run(() => api.patch(`/rooms/${room.id}/beds/${bed.id}`, { status: bed.status === 'available' ? 'maintenance' : 'available' }), 'Bed updated')}
                      disabled={busy}
                    >
                      {bed.status === 'available' ? 'Mark maintenance' : 'Mark available'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Allocation history" bodyClassName="p-0">
        <DataTable
          rows={room.history}
          emptyTitle="No allocations yet"
          columns={[
            { key: 'resident_name', header: 'Resident', className: 'font-medium text-slate-800' },
            { key: 'bed_number', header: 'Bed' },
            { key: 'start_date', header: 'From', render: (r) => formatDate(r.start_date) },
            { key: 'end_date', header: 'To', render: (r) => formatDate(r.end_date) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'release_reason', header: 'Notes', className: 'max-w-[260px] truncate text-xs text-slate-500' },
          ]}
        />
      </Card>

      <RoomFormModal open={edit} room={room} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.label}
        variant={confirm?.variant || 'danger'}
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(confirm.action)}
      />
    </div>
  );
}
