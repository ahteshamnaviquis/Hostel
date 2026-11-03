import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterSelect } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import IconButton from '../../components/common/IconButton';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import FormField from '../../components/common/FormField';
import { SelectField } from '../../components/common/Fields';
import { HostelField } from '../../components/common/HostelSelect';
import useFetch from '../../hooks/useFetch';
import useForm from '../../hooks/useForm';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';

const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];

function BuildingModal({ open, building, onClose, onSaved }) {
  const toast = useToast();
  const { defaultHostelId } = useHostel();
  const form = useForm({});
  const [saving, setSaving] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    form.reset({ hostel_id: building ? String(building.hostel_id) : defaultHostelId, name: building?.name || '', code: building?.code || '', description: building?.description || '', status: building?.status || 'active' });
    setLastOpen(true);
  } else if (!open && lastOpen) setLastOpen(false);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.values.hostel_id) errs.hostel_id = 'Select a hostel';
    if (!form.values.name?.trim()) errs.name = 'Building name is required';
    if (Object.keys(errs).length) return form.setErrors(errs);
    setSaving(true);
    try {
      const { hostel_id: hostelId, ...rest } = form.values;
      const { data } = building ? await api.put(`/buildings/${building.id}`, rest) : await api.post('/buildings', { hostel_id: hostelId, ...rest });
      toast.success(data.message);
      onSaved();
    } catch (error) {
      form.applyServerErrors(error);
      toast.error(error.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={building ? 'Edit building' : 'Add building'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="building-form" loading={saving}>Save</Button></>}>
      <form id="building-form" onSubmit={submit} noValidate className="space-y-4">
        <HostelField {...form.field('hostel_id')} disabled={Boolean(building)} />
        <FormField label="Building name" required placeholder="e.g. Block A / Main Building" {...form.field('name')} />
        <FormField label="Code" placeholder="Optional short code" {...form.field('code')} />
        <FormField label="Description" {...form.field('description')} />
        <SelectField label="Status" placeholder={null} options={STATUS_OPTIONS} {...form.field('status')} />
      </form>
    </Modal>
  );
}

export default function BuildingsPage() {
  useDocumentTitle('Buildings');
  const toast = useToast();
  const { hostelId } = useHostel();
  const [filters, setFilters] = useState({ search: '', status: '', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/buildings', { ...filters, hostel_id: hostelId });
  const [modal, setModal] = useState({ open: false, building: null });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  const remove = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.delete(`/buildings/${del.id}`);
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
      <PageHeader title="Buildings" description="Hostel → Building → Floor → Room → Bed" breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Buildings' }]} actions={<Button icon={Plus} onClick={() => setModal({ open: true, building: null })}>Add building</Button>} />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder="Search buildings..." value={filters.search} onChange={set('search')} />
          <FilterSelect value={filters.status} onChange={set('status')} placeholder="All statuses" options={STATUS_OPTIONS} />
        </Toolbar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No buildings yet"
          emptyMessage="Add a building, then create floors and rooms inside it."
          columns={[
            { key: 'name', header: 'Building', render: (r) => <div><div className="font-medium text-slate-800">{r.name}</div>{r.code && <div className="text-xs text-slate-500">{r.code}</div>}</div> },
            { key: 'hostel_name', header: 'Hostel' },
            { key: 'floors_count', header: 'Floors', align: 'right' },
            { key: 'rooms_count', header: 'Rooms', align: 'right' },
            { key: 'beds', header: 'Beds (occ./total)', align: 'right', render: (r) => `${r.occupied_beds} / ${r.beds_count}` },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: '', align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-1">
                  <IconButton icon={Pencil} label="Edit" tone="brand" onClick={() => setModal({ open: true, building: r })} />
                  <IconButton icon={Trash2} label="Delete" tone="red" onClick={() => setDel(r)} />
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
      <BuildingModal open={modal.open} building={modal.building} onClose={() => setModal({ open: false, building: null })} onSaved={() => { setModal({ open: false, building: null }); reload(); }} />
      <ConfirmDialog open={Boolean(del)} title="Delete building?" message={`Delete ${del?.name}? Only empty buildings (no floors) can be deleted.`} confirmLabel="Delete" loading={busy} onCancel={() => setDel(null)} onConfirm={remove} />
    </div>
  );
}
