import { useEffect, useState } from 'react';
import { Plus, LogOut, Pencil } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterDate, FilterSelect } from '../../components/common/Toolbar';
import IconButton from '../../components/common/IconButton';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import FormField from '../../components/common/FormField';
import ResidentPicker from '../../components/common/ResidentPicker';
import { SelectField } from '../../components/common/Fields';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { RELATIONSHIPS, toOptions } from '../../utils/constants';
import { formatDate, formatTime, todayISO, nowTime } from '../../utils/formatters';

const EMPTY = { visitor_name: '', cnic: '', contact_number: '', relationship: '', visit_date: todayISO(), entry_time: nowTime(), exit_time: '', purpose: '', remarks: '' };

function VisitorModal({ open, visitor, onClose, onSaved }) {
  const toast = useToast();
  const { hostelId } = useHostel();
  const [resident, setResident] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (visitor) {
      setResident({ id: visitor.resident_id, full_name: visitor.resident_name, registration_no: visitor.registration_no });
      setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, k.endsWith('_time') && visitor[k] ? visitor[k].slice(0, 5) : visitor[k] || ''])));
    } else {
      setResident(null);
      setForm({ ...EMPTY, visit_date: todayISO(), entry_time: nowTime() });
    }
  }, [open, visitor]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!resident) errs.resident_id = 'Choose the resident being visited';
    if (!form.visitor_name.trim()) errs.visitor_name = 'Visitor name is required';
    if (form.cnic && !/^\d{5}-?\d{7}-?\d$/.test(form.cnic)) errs.cnic = 'Format: 12345-1234567-1';
    if (!form.entry_time) errs.entry_time = 'Entry time is required';
    if (Object.keys(errs).length) return setErrors(errs);
    setSaving(true);
    try {
      const payload = { ...form };
      if (!visitor) delete payload.exit_time;
      const { data } = visitor ? await api.put(`/visitors/${visitor.id}`, payload) : await api.post('/visitors', { resident_id: resident.id, ...payload });
      toast.success(data.message);
      onSaved();
    } catch (err) {
      setErrors(err.fieldErrors);
      toast.error(err.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={visitor ? 'Edit visitor record' : 'Visitor entry'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="visitor-form" loading={saving}>Save</Button></>}>
      <form id="visitor-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {visitor ? <p className="text-sm">Visiting: <b>{resident?.full_name}</b></p> : <ResidentPicker hostelId={hostelId} value={resident} onSelect={setResident} required error={errors.resident_id} label="Resident being visited" />}
        </div>
        <FormField label="Visitor name" required name="visitor_name" value={form.visitor_name} onChange={set('visitor_name')} error={errors.visitor_name} />
        <FormField label="Visitor CNIC" name="cnic" placeholder="12345-1234567-1" value={form.cnic} onChange={set('cnic')} error={errors.cnic} />
        <FormField label="Contact number" name="contact_number" placeholder="0300-1234567" value={form.contact_number} onChange={set('contact_number')} error={errors.contact_number} />
        <SelectField label="Relationship" options={toOptions(RELATIONSHIPS)} name="relationship" value={form.relationship} onChange={set('relationship')} />
        <FormField label="Visit date" type="date" required name="visit_date" value={form.visit_date} onChange={set('visit_date')} error={errors.visit_date} />
        <FormField label="Entry time" type="time" required name="entry_time" value={form.entry_time} onChange={set('entry_time')} error={errors.entry_time} />
        {visitor && <FormField label="Exit time" type="time" name="exit_time" value={form.exit_time} onChange={set('exit_time')} error={errors.exit_time} />}
        <FormField label="Purpose" name="purpose" value={form.purpose} onChange={set('purpose')} />
        <FormField label="Remarks" className="sm:col-span-2" name="remarks" value={form.remarks} onChange={set('remarks')} />
      </form>
    </Modal>
  );
}

export default function VisitorsPage() {
  useDocumentTitle('Visitors');
  const toast = useToast();
  const { hostelId } = useHostel();
  const [filters, setFilters] = useState({ search: '', from: todayISO(), to: todayISO(), inside: '', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/visitors', { ...filters, inside: filters.inside === 'yes', hostel_id: hostelId });
  const [modal, setModal] = useState({ open: false, visitor: null });
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  const exit = async (v) => {
    try {
      await api.post(`/visitors/${v.id}/exit`, { exit_time: nowTime() < v.entry_time.slice(0, 5) ? v.entry_time.slice(0, 5) : nowTime() });
      toast.success(`Exit recorded for ${v.visitor_name}`);
      reload();
    } catch (e) {
      toast.error(e.userMessage);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Visitors" description="Visitor entry, exit and history." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Visitors' }]} actions={<Button icon={Plus} onClick={() => setModal({ open: true, visitor: null })}>Visitor entry</Button>} />
      {meta?.counts && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Visitors today" value={meta.counts.today || 0} tone="brand" />
          <StatCard label="Currently inside" value={meta.counts.inside || 0} tone={meta.counts.inside ? 'amber' : 'slate'} hint="Exit not recorded" />
        </div>
      )}
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder="Visitor, CNIC, phone or resident..." value={filters.search} onChange={set('search')} />
          <FilterDate label="From" value={filters.from} onChange={set('from')} />
          <FilterDate label="To" value={filters.to} onChange={set('to')} />
          <FilterSelect value={filters.inside} onChange={set('inside')} placeholder="All visitors" options={[{ value: 'yes', label: 'Currently inside' }]} />
        </Toolbar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No visitors for the selected dates" columns={[
          { key: 'visit_date', header: 'Date', render: (r) => formatDate(r.visit_date) },
          { key: 'visitor_name', header: 'Visitor', render: (r) => <div><div className="font-medium text-slate-800">{r.visitor_name}</div><div className="text-xs text-slate-500">{[r.cnic, r.contact_number].filter(Boolean).join(' · ')}</div></div> },
          { key: 'resident_name', header: 'Visiting', render: (r) => <div><div>{r.resident_name}</div><div className="text-xs text-slate-500">{r.relationship || '-'}</div></div> },
          { key: 'purpose', header: 'Purpose', className: 'max-w-[180px] truncate' },
          { key: 'entry_time', header: 'Entry', render: (r) => formatTime(r.entry_time) },
          { key: 'exit_time', header: 'Exit', render: (r) => (r.exit_time ? formatTime(r.exit_time) : <Badge tone="amber">Inside</Badge>) },
          {
            key: 'actions', header: '', align: 'right',
            render: (r) => (
              <div className="flex justify-end gap-1">
                {!r.exit_time && <Button size="sm" variant="secondary" icon={LogOut} onClick={() => exit(r)}>Exit</Button>}
                <IconButton icon={Pencil} label="Edit" tone="brand" onClick={() => setModal({ open: true, visitor: r })} />
              </div>
            ),
          },
        ]} />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
      <VisitorModal open={modal.open} visitor={modal.visitor} onClose={() => setModal({ open: false, visitor: null })} onSaved={() => { setModal({ open: false, visitor: null }); reload(); }} />
    </div>
  );
}
