import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import Toolbar, { FilterSelect } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import IconButton from '../../components/common/IconButton';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import FormField from '../../components/common/FormField';
import { SelectField } from '../../components/common/Fields';
import useFetch from '../../hooks/useFetch';
import useForm from '../../hooks/useForm';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';

const FLOOR_NAMES = { '-1': 'Basement', 0: 'Ground Floor', 1: 'First Floor', 2: 'Second Floor', 3: 'Third Floor', 4: 'Fourth Floor', 5: 'Fifth Floor' };

function FloorModal({ open, floor, buildings, onClose, onSaved }) {
  const toast = useToast();
  const form = useForm({});
  const [saving, setSaving] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    form.reset({ building_id: floor ? String(floor.building_id) : buildings[0] ? String(buildings[0].id) : '', floor_number: floor ? String(floor.floor_number) : '0', name: floor?.name || 'Ground Floor', status: floor?.status || 'active' });
    setLastOpen(true);
  } else if (!open && lastOpen) setLastOpen(false);

  const onNumber = (e) => {
    form.onChange(e);
    const name = FLOOR_NAMES[e.target.value];
    if (name) form.setValue('name', name);
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.values.building_id) errs.building_id = 'Select a building';
    if (form.values.floor_number === '') errs.floor_number = 'Floor number is required';
    if (!form.values.name?.trim()) errs.name = 'Floor name is required';
    if (Object.keys(errs).length) return form.setErrors(errs);
    setSaving(true);
    try {
      const { building_id: buildingId, ...rest } = form.values;
      const { data } = floor ? await api.put(`/floors/${floor.id}`, rest) : await api.post('/floors', { building_id: buildingId, ...rest });
      toast.success(data.message);
      onSaved();
    } catch (error) {
      form.applyServerErrors(error);
      toast.error(error.response?.status === 409 ? 'This floor number already exists in the building' : error.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={floor ? 'Edit floor' : 'Add floor'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="floor-form" loading={saving}>Save</Button></>}>
      <form id="floor-form" onSubmit={submit} noValidate className="space-y-4">
        <SelectField label="Building" required disabled={Boolean(floor)} options={buildings.map((b) => ({ value: String(b.id), label: `${b.name} — ${b.hostel_name}` }))} {...form.field('building_id')} />
        <FormField label="Floor number" type="number" required hint="0 = Ground floor, -1 = Basement" {...form.field('floor_number')} onChange={onNumber} />
        <FormField label="Floor name" required {...form.field('name')} />
        <SelectField label="Status" placeholder={null} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} {...form.field('status')} />
      </form>
    </Modal>
  );
}

export default function FloorsPage() {
  useDocumentTitle('Floors');
  const toast = useToast();
  const { hostelId } = useHostel();
  const [filters, setFilters] = useState({ building_id: '', page: 1 });
  const { data: buildings } = useFetch('/buildings', { hostel_id: hostelId, limit: 200 });
  const { data, meta, loading, error, reload } = useFetch('/floors', { ...filters, hostel_id: hostelId, limit: 50 });
  const [modal, setModal] = useState({ open: false, floor: null });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.delete(`/floors/${del.id}`);
      toast.success(res.message);
      reload();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setBusy(false);
      setDel(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Floors"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Floors' }]}
        actions={<Button icon={Plus} disabled={!buildings?.length} title={!buildings?.length ? 'Add a building first' : undefined} onClick={() => setModal({ open: true, floor: null })}>Add floor</Button>}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <FilterSelect value={filters.building_id} onChange={(v) => setFilters({ building_id: v, page: 1 })} placeholder="All buildings" options={(buildings || []).map((b) => ({ value: String(b.id), label: `${b.name} (${b.hostel_name})` }))} />
        </Toolbar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No floors yet"
          emptyMessage={buildings?.length ? 'Add floors to your buildings.' : 'Create a building first.'}
          columns={[
            { key: 'name', header: 'Floor', render: (r) => <div><div className="font-medium text-slate-800">{r.name}</div><div className="text-xs text-slate-500">Floor no. {r.floor_number}</div></div> },
            { key: 'building_name', header: 'Building' },
            { key: 'hostel_name', header: 'Hostel' },
            { key: 'rooms_count', header: 'Rooms', align: 'right' },
            { key: 'beds', header: 'Beds (occ./total)', align: 'right', render: (r) => `${r.occupied_beds} / ${r.beds_count}` },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: '', align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-1">
                  <IconButton icon={Pencil} label="Edit" tone="brand" onClick={() => setModal({ open: true, floor: r })} />
                  <IconButton icon={Trash2} label="Delete" tone="red" onClick={() => setDel(r)} />
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
      <FloorModal open={modal.open} floor={modal.floor} buildings={buildings || []} onClose={() => setModal({ open: false, floor: null })} onSaved={() => { setModal({ open: false, floor: null }); reload(); }} />
      <ConfirmDialog open={Boolean(del)} title="Delete floor?" message={`Delete ${del?.name} of ${del?.building_name}? Only floors without rooms can be deleted.`} confirmLabel="Delete" loading={busy} onCancel={() => setDel(null)} onConfirm={remove} />
    </div>
  );
}
