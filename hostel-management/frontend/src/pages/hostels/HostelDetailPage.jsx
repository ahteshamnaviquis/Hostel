import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pencil, Users, BedDouble, DoorOpen, Building, Wallet, AlertCircle, Receipt, UserCog } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ErrorState from '../../components/common/ErrorState';
import { PageLoader } from '../../components/common/Spinner';
import { InfoGrid, CheckboxField } from '../../components/common/Fields';
import HostelFormModal from '../../components/hostels/HostelFormModal';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatNumber, formatPKR, formatPercent, humanize } from '../../utils/formatters';

/** Assign hostel admins to this hostel. */
function AssignAdminsModal({ open, hostel, onClose, onSaved }) {
  const toast = useToast();
  const { data: admins, loading } = useFetch('/users', { role: 'hostel_admin', limit: 200 }, { enabled: open });
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setSelected(hostel.admins.map((a) => a.id));
  }, [open, hostel]);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/hostels/${hostel.id}/admins`, { user_ids: selected });
      toast.success(data.message);
      onSaved();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Administrators of ${hostel.name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}>
      {loading ? <PageLoader /> : !admins?.length ? (
        <p className="text-sm text-slate-500">No hostel admins exist yet. <Link className="text-brand-700" to="/administrators?new=1">Create one</Link>.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Selected administrators can only access the hostels assigned to them.</p>
          {admins.map((a) => (
            <CheckboxField key={a.id} checked={selected.includes(a.id)} onChange={() => toggle(a.id)} label={`${a.full_name} (${a.email})`} hint={a.hostel_names ? `Currently: ${a.hostel_names}` : 'No hostels assigned'} disabled={a.status !== 'active'} />
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function HostelDetailPage() {
  const { id } = useParams();
  const { data: h, loading, error, reload } = useFetch(`/hostels/${id}`);
  const [edit, setEdit] = useState(false);
  const [assign, setAssign] = useState(false);
  useDocumentTitle(h?.name || 'Hostel');

  if (loading && !h) return <PageLoader />;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  const occupancy = h.total_beds ? (h.occupied_beds / h.total_beds) * 100 : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={h.name}
        description={`${h.code} · ${humanize(h.hostel_type)} hostel · ${h.city}, ${h.province}`}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Hostels', to: '/hostels' }, { label: h.name }]}
        actions={
          <>
            <Button variant="secondary" icon={UserCog} onClick={() => setAssign(true)}>Assign admins</Button>
            <Button icon={Pencil} onClick={() => setEdit(true)}>Edit hostel</Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Buildings / Rooms" value={`${h.buildings_count} / ${h.rooms_count}`} icon={Building} tone="slate" />
        <StatCard label="Beds occupied" value={`${h.occupied_beds} / ${h.total_beds}`} icon={BedDouble} tone="brand" hint={`${formatPercent(occupancy)} occupancy · ${h.available_beds} free`} />
        <StatCard label="Active residents" value={formatNumber(h.active_residents)} icon={Users} tone="violet" />
        <StatCard label="Administrators" value={formatNumber(h.admins_count)} icon={UserCog} tone="slate" />
        <StatCard label="Collected this month" value={formatPKR(h.finance.collected_this_month)} icon={Wallet} tone="brand" />
        <StatCard label="Pending fees" value={formatPKR(h.finance.pending_fees)} icon={AlertCircle} tone="red" />
        <StatCard label="Expenses this month" value={formatPKR(h.finance.expenses_this_month)} icon={Receipt} tone="amber" />
        <StatCard label="Status" value={<StatusBadge status={h.status} />} icon={DoorOpen} tone="slate" hint={`Created ${formatDate(h.created_at)}`} />
      </div>

      <Card title="Hostel information" className="mt-6">
        <InfoGrid
          items={[
            { label: 'Address', value: h.address },
            { label: 'City / Province', value: `${h.city}, ${h.province}` },
            { label: 'Contact', value: h.contact_number },
            { label: 'Email', value: h.email },
            { label: 'Warden', value: h.warden_name },
            { label: 'Warden contact', value: h.warden_contact },
            { label: 'Created by', value: h.created_by_name },
            { label: 'Description', value: h.description },
          ]}
        />
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Administrators" bodyClassName="p-0" action={<button className="text-xs font-medium text-brand-700" onClick={() => setAssign(true)}>Manage</button>}>
          <DataTable
            rows={h.admins}
            emptyTitle="No administrators assigned"
            columns={[
              { key: 'full_name', header: 'Name', className: 'font-medium text-slate-800' },
              { key: 'email', header: 'Email' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        </Card>
        <Card title="Buildings" bodyClassName="p-0" action={<Link to="/buildings" className="text-xs font-medium text-brand-700">Manage</Link>}>
          <DataTable
            rows={h.buildings}
            emptyTitle="No buildings yet"
            columns={[
              { key: 'name', header: 'Building', className: 'font-medium text-slate-800' },
              { key: 'floors_count', header: 'Floors', align: 'right' },
              { key: 'rooms_count', header: 'Rooms', align: 'right' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        </Card>
      </div>

      <HostelFormModal open={edit} hostel={h} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />
      {assign && <AssignAdminsModal open={assign} hostel={h} onClose={() => setAssign(false)} onSaved={() => { setAssign(false); reload(); }} />}
    </div>
  );
}
