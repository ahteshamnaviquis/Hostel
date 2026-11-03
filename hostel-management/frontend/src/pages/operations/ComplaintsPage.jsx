import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterSelect } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs from '../../components/common/Tabs';
import Modal from '../../components/common/Modal';
import FormField from '../../components/common/FormField';
import ResidentPicker from '../../components/common/ResidentPicker';
import { SelectField, TextAreaField, InfoGrid } from '../../components/common/Fields';
import { HostelField } from '../../components/common/HostelSelect';
import { PageLoader } from '../../components/common/Spinner';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { COMPLAINT_CATEGORIES, PRIORITIES, labelOf } from '../../utils/constants';
import { formatDate, formatDateTime } from '../../utils/formatters';
import { statusLabel } from '../../utils/status';

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'rejected'].map((s) => ({ value: s, label: statusLabel(s) }));

function NewComplaintModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const { defaultHostelId } = useHostel();
  const [form, setForm] = useState({});
  const [resident, setResident] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ hostel_id: defaultHostelId, category: '', subject: '', description: '', priority: 'medium', assigned_to: '' });
      setResident(null);
      setErrors({});
    }
  }, [open, defaultHostelId]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.hostel_id) errs.hostel_id = 'Select a hostel';
    if (!form.category) errs.category = 'Select a category';
    if (!form.subject.trim()) errs.subject = 'Subject is required';
    if (Object.keys(errs).length) return setErrors(errs);
    setSaving(true);
    try {
      const { data } = await api.post('/complaints', { ...form, resident_id: resident?.id });
      toast.success(`${data.data.complaint_no} registered`);
      onSaved();
    } catch (err) {
      setErrors(err.fieldErrors);
      toast.error(err.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Register complaint" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="complaint-form" loading={saving}>Register</Button></>}>
      <form id="complaint-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HostelField value={form.hostel_id || ''} onChange={(e) => { set('hostel_id')(e); setResident(null); }} error={errors.hostel_id} />
        <div><ResidentPicker hostelId={form.hostel_id} value={resident} onSelect={setResident} label="Resident (optional)" /></div>
        <SelectField label="Category" required options={COMPLAINT_CATEGORIES} name="category" value={form.category || ''} onChange={set('category')} error={errors.category} />
        <SelectField label="Priority" placeholder={null} options={PRIORITIES} name="priority" value={form.priority || 'medium'} onChange={set('priority')} />
        <FormField label="Subject" required className="sm:col-span-2" name="subject" value={form.subject || ''} onChange={set('subject')} error={errors.subject} />
        <TextAreaField label="Description" className="sm:col-span-2" name="description" value={form.description || ''} onChange={set('description')} />
        <FormField label="Assign to" name="assigned_to" placeholder="e.g. Plumber Aslam" value={form.assigned_to || ''} onChange={set('assigned_to')} />
      </form>
    </Modal>
  );
}

function ComplaintDetailModal({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data: c, loading, reload } = useFetch(id ? `/complaints/${id}` : null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (c) setForm({ status: c.status, priority: c.priority, assigned_to: c.assigned_to || '', remarks: '', resolution_remarks: c.resolution_remarks || '' });
  }, [c]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const closing = ['resolved', 'rejected'].includes(form.status);
  const submit = async (e) => {
    e.preventDefault();
    if (closing && !form.resolution_remarks.trim()) return setErrors({ resolution_remarks: 'Please describe how it was resolved / why rejected' });
    setSaving(true);
    try {
      await api.put(`/complaints/${id}`, form);
      toast.success('Complaint updated');
      reload();
      onChanged();
    } catch (err) {
      setErrors(err.fieldErrors);
      toast.error(err.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={Boolean(id)} onClose={onClose} size="xl" title={c ? `${c.complaint_no}: ${c.subject}` : 'Complaint'}>
      {loading || !c ? <PageLoader /> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-3">
            <InfoGrid cols={2} items={[
              { label: 'Status', value: <StatusBadge status={c.status} /> }, { label: 'Priority', value: <StatusBadge status={c.priority} /> },
              { label: 'Category', value: labelOf(COMPLAINT_CATEGORIES, c.category) }, { label: 'Hostel', value: c.hostel_name },
              { label: 'Resident', value: c.resident_name ? `${c.resident_name} (${c.registration_no})` : '-' }, { label: 'Room', value: c.room_number },
              { label: 'Registered', value: `${formatDateTime(c.created_at)} by ${c.created_by_name || '-'}` }, { label: 'Resolved on', value: formatDate(c.resolution_date) },
            ]} />
            {c.description && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{c.description}</p>}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">History</h4>
              <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                {c.updates.map((u) => (
                  <li key={u.id} className="text-sm">
                    <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
                    <div className="flex flex-wrap items-center gap-2">
                      {u.status_from && <><StatusBadge status={u.status_from} /><span className="text-slate-400">→</span></>}<StatusBadge status={u.status_to} />
                      <span className="text-xs text-slate-500">{formatDateTime(u.created_at)} · {u.updated_by_name || '-'}</span>
                    </div>
                    {u.assigned_to && <div className="text-xs text-slate-500">Assigned to {u.assigned_to}</div>}
                    {u.remarks && <div className="text-slate-700">{u.remarks}</div>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 p-4 lg:col-span-2">
            <h4 className="text-sm font-semibold text-slate-800">Update complaint</h4>
            <SelectField label="Status" placeholder={null} options={STATUS_OPTIONS} name="status" value={form.status || ''} onChange={set('status')} />
            <SelectField label="Priority" placeholder={null} options={PRIORITIES} name="priority" value={form.priority || ''} onChange={set('priority')} />
            <FormField label="Assigned to" name="assigned_to" value={form.assigned_to || ''} onChange={set('assigned_to')} />
            {closing && <TextAreaField label="Resolution remarks" required name="resolution_remarks" rows={2} value={form.resolution_remarks || ''} onChange={set('resolution_remarks')} error={errors.resolution_remarks} />}
            <TextAreaField label="Update note" name="remarks" rows={2} value={form.remarks || ''} onChange={set('remarks')} />
            <Button type="submit" fullWidth loading={saving}>Save update</Button>
          </form>
        </div>
      )}
    </Modal>
  );
}

export default function ComplaintsPage() {
  useDocumentTitle('Complaints');
  const { hostelId } = useHostel();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', status: params.get('status') || 'pending', category: '', priority: '', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/complaints', { ...filters, hostel_id: hostelId });
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(params.get('open'));
  useEffect(() => { if (params.get('open') || params.get('status')) setParams({}, { replace: true }); }, [params, setParams]);
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  const counts = meta?.counts || {};

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Complaints & Maintenance" description="Register, assign and resolve resident complaints." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Complaints' }]} actions={<Button icon={Plus} onClick={() => setCreating(true)}>Register complaint</Button>} />
      <Card bodyClassName="p-0">
        <div className="px-4">
          <Tabs active={filters.status} onChange={set('status')} tabs={[
            { key: 'pending', label: 'Pending', count: (counts.open || 0) + (counts.in_progress || 0) },
            { key: 'open', label: 'Open', count: counts.open || 0 }, { key: 'in_progress', label: 'In progress', count: counts.in_progress || 0 },
            { key: 'resolved', label: 'Resolved', count: counts.resolved || 0 }, { key: 'rejected', label: 'Rejected', count: counts.rejected || 0 }, { key: '', label: 'All' },
          ]} />
        </div>
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder="Complaint no, subject, resident, assignee..." value={filters.search} onChange={set('search')} />
          <FilterSelect value={filters.category} onChange={set('category')} placeholder="All categories" options={COMPLAINT_CATEGORIES} />
          <FilterSelect value={filters.priority} onChange={set('priority')} placeholder="All priorities" options={PRIORITIES} />
        </Toolbar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No complaints" onRowClick={(r) => setOpenId(r.id)} columns={[
          { key: 'complaint_no', header: 'No', className: 'font-mono text-xs' },
          { key: 'subject', header: 'Subject', render: (r) => <div><div className="max-w-[260px] truncate font-medium text-slate-800">{r.subject}</div><div className="text-xs text-slate-500">{labelOf(COMPLAINT_CATEGORIES, r.category)}</div></div> },
          { key: 'resident_name', header: 'Resident / Room', render: (r) => <div><div>{r.resident_name || '-'}</div><div className="text-xs text-slate-500">{r.room_number ? `Room ${r.room_number}` : ''} {r.hostel_name}</div></div> },
          { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
          { key: 'assigned_to', header: 'Assigned to' },
          { key: 'created_at', header: 'Registered', render: (r) => formatDate(r.created_at) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]} />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
      <NewComplaintModal open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      <ComplaintDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={reload} />
    </div>
  );
}
