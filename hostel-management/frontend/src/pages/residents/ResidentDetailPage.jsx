import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, UserPlus, Camera, Upload, Download, Trash2, Ban, CheckCircle2, XCircle, FileText, CreditCard } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/common/DataTable';
import Tabs from '../../components/common/Tabs';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import IconButton from '../../components/common/IconButton';
import AuthImage from '../../components/common/AuthImage';
import ErrorState from '../../components/common/ErrorState';
import FormField from '../../components/common/FormField';
import { PageLoader } from '../../components/common/Spinner';
import { InfoGrid, SelectField } from '../../components/common/Fields';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api, { downloadFile } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DOCUMENT_TYPES, labelOf } from '../../utils/constants';
import { formatDate, formatDateTime, formatPKR, humanize } from '../../utils/formatters';

function UploadDocumentModal({ open, residentId, onClose, onSaved }) {
  const toast = useToast();
  const [type, setType] = useState('cnic');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please choose a file');
    if (file.size > 5 * 1024 * 1024) return setError('File is too large (max 5 MB)');
    const form = new FormData();
    form.append('document_type', type);
    form.append('title', title);
    form.append('file', file);
    setSaving(true);
    try {
      const { data } = await api.post(`/residents/${residentId}/documents`, form);
      toast.success(data.message);
      setFile(null);
      setTitle('');
      onSaved();
    } catch (err) {
      setError(err.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Upload document" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="doc-form" loading={saving}>Upload</Button></>}>
      <form id="doc-form" onSubmit={submit} className="space-y-4">
        <SelectField label="Document type" placeholder={null} options={DOCUMENT_TYPES} value={type} onChange={(e) => setType(e.target.value)} />
        <FormField label="Title" name="title" placeholder="Optional, e.g. CNIC front side" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="doc-file">File <span className="text-red-600">*</span></label>
          <input id="doc-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => { setFile(e.target.files[0] || null); setError(''); }} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800" />
          <p className={`mt-1 text-xs ${error ? 'text-red-600' : 'text-slate-500'}`}>{error || 'JPG, PNG, WEBP or PDF up to 5 MB. Documents are private and only visible to authorised staff.'}</p>
        </div>
      </form>
    </Modal>
  );
}

export default function ResidentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const { data: r, loading, error, reload } = useFetch(`/residents/${id}`);
  const [tab, setTab] = useState('overview');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [photoKey, setPhotoKey] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef(null);
  const { data: invoices, loading: invLoading } = useFetch('/invoices', { resident_id: id, limit: 100 }, { enabled: tab === 'fees' && hasPermission('payments.manage') });
  const { data: attendance, loading: attLoading } = useFetch('/attendance/history', { resident_id: id, limit: 60 }, { enabled: tab === 'attendance' && hasPermission('attendance.manage') });
  useDocumentTitle(r?.full_name || 'Resident');

  if (loading && !r) return <PageLoader />;
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  const canManage = hasPermission('residents.manage');

  const uploadPhoto = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      await api.post(`/residents/${id}/photo`, form);
      toast.success('Profile picture updated');
      setPhotoKey((k) => k + 1);
      reload();
    } catch (err) {
      toast.error(err.userMessage);
    }
  };

  const runConfirm = async () => {
    setBusy(true);
    try {
      const res = await confirm.action();
      toast.success(res.data.message);
      reload();
    } catch (err) {
      toast.error(err.userMessage);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const tabs = [
    { key: 'overview', label: 'Profile' },
    { key: 'stay', label: 'Stay & Allocation', count: r.allocations.length },
    hasPermission('payments.manage') && { key: 'fees', label: 'Fees' },
    { key: 'documents', label: 'Documents', count: r.documents.length },
    hasPermission('attendance.manage') && { key: 'attendance', label: 'Attendance' },
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={r.full_name}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Residents', to: '/residents' }, { label: r.full_name }]}
        actions={
          <>
            {['pending', 'checked_out'].includes(r.status) && !r.admission_id && hasPermission('admissions.manage') && (
              <Button icon={UserPlus} onClick={() => navigate(`/admissions/new?resident=${r.id}`)}>Admit & allocate bed</Button>
            )}
            {r.admission_id && hasPermission('admissions.manage') && <Button variant="secondary" onClick={() => navigate(`/admissions/${r.admission_id}`)}>Open admission</Button>}
            {r.admission_id && hasPermission('payments.manage') && <Button variant="secondary" icon={CreditCard} onClick={() => navigate(`/fees?collect=${r.admission_id}`)}>Collect fee</Button>}
            {canManage && <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/residents/${r.id}/edit`)}>Edit</Button>}
          </>
        }
      />

      <Card className="mb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <AuthImage src={r.has_photo ? `/residents/${r.id}/photo` : null} name={r.full_name} className="h-20 w-20" reloadKey={photoKey} />
            {canManage && (
              <>
                <button onClick={() => photoInput.current.click()} className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-brand-700 p-1.5 text-white hover:bg-brand-800" aria-label="Change profile picture">
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input ref={photoInput} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={uploadPhoto} />
              </>
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{r.full_name}</h2>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-sm text-slate-500">{r.registration_no} · {r.hostel_name}{r.room_number ? ` · Room ${r.room_number} / ${r.bed_number}` : ''}</p>
            <p className="text-sm text-slate-500">{r.mobile}{r.institution ? ` · ${r.institution}` : ''}</p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {r.status === 'active' && <Button size="sm" variant="secondary" icon={Ban} onClick={() => setConfirm({ title: 'Suspend resident?', message: 'Suspended residents keep their bed but are flagged. You can re-activate later.', label: 'Suspend', action: () => api.patch(`/residents/${r.id}/status`, { status: 'suspended' }) })}>Suspend</Button>}
              {r.status === 'suspended' && <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => setConfirm({ title: 'Re-activate resident?', message: 'The resident will be marked active again.', label: 'Activate', variant: 'primary', action: () => api.patch(`/residents/${r.id}/status`, { status: 'active' }) })}>Re-activate</Button>}
              {r.status === 'pending' && !r.admission_id && <Button size="sm" variant="secondary" icon={XCircle} onClick={() => setConfirm({ title: 'Cancel registration?', message: 'The registration will be marked cancelled. Records are kept.', label: 'Cancel registration', action: () => api.patch(`/residents/${r.id}/status`, { status: 'cancelled' }) })}>Cancel registration</Button>}
            </div>
          )}
        </div>
      </Card>

      {hasPermission('payments.manage') && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total billed" value={formatPKR(r.finance.invoiced)} icon={FileText} tone="slate" />
          <StatCard label="Paid" value={formatPKR(r.finance.paid)} icon={CreditCard} tone="brand" />
          <StatCard label="Outstanding" value={formatPKR(r.finance.outstanding)} icon={FileText} tone={r.finance.outstanding > 0 ? 'red' : 'slate'} />
          <StatCard label="Advance credit" value={formatPKR(r.finance.advance)} icon={CreditCard} tone="violet" />
        </div>
      )}

      <Card bodyClassName="p-0">
        <div className="px-4"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>
        <div className="p-5">
          {tab === 'overview' && (
            <div className="space-y-8">
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Personal information</h3>
                <InfoGrid items={[
                  { label: 'Father name', value: r.father_name }, { label: 'CNIC / B-Form', value: r.cnic }, { label: 'Date of birth', value: formatDate(r.date_of_birth) },
                  { label: 'Gender', value: humanize(r.gender) }, { label: 'Mobile', value: r.mobile }, { label: 'WhatsApp', value: r.whatsapp }, { label: 'Email', value: r.email },
                  { label: 'Address', value: r.permanent_address }, { label: 'City / Province', value: [r.city, r.province].filter(Boolean).join(', ') },
                ]} />
              </section>
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Education / employment</h3>
                <InfoGrid items={[
                  { label: 'Institution', value: r.institution }, { label: 'Department', value: r.department }, { label: 'Class / Degree / Designation', value: r.class_designation },
                  { label: 'Student / Employee ID', value: r.student_employee_id },
                ]} />
              </section>
              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Emergency contact</h3>
                <InfoGrid items={[
                  { label: 'Guardian', value: r.guardian_name }, { label: 'Relationship', value: r.guardian_relationship }, { label: 'Guardian CNIC', value: r.guardian_cnic },
                  { label: 'Guardian phone', value: r.guardian_phone }, { label: 'Guardian address', value: r.guardian_address },
                ]} />
              </section>
              <p className="text-xs text-slate-400">Registered {formatDateTime(r.created_at)} by {r.created_by_name || '-'}</p>
            </div>
          )}

          {tab === 'stay' && (
            <div className="space-y-6">
              <InfoGrid cols={4} items={[
                { label: 'Current admission', value: r.admission_no ? <Link className="text-brand-700" to={`/admissions/${r.admission_id}`}>{r.admission_no}</Link> : 'None' },
                { label: 'Room / Bed', value: r.room_number ? `${r.room_number} / ${r.bed_number}` : '-' },
                { label: 'Admission date', value: formatDate(r.admission_date) },
                { label: 'Expected leaving', value: formatDate(r.expected_leaving_date) },
                { label: 'Monthly rent', value: r.admission_rent ? formatPKR(r.admission_rent) : '-' },
                { label: 'Security deposit', value: r.admission_deposit ? formatPKR(r.admission_deposit) : '-' },
              ]} />
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Allocation history</h3>
                <div className="rounded-lg border border-slate-200">
                  <DataTable rows={r.allocations} emptyTitle="No allocations yet" columns={[
                    { key: 'room', header: 'Room / Bed', render: (a) => `${a.building_name} · ${a.room_number} / ${a.bed_number}` },
                    { key: 'start_date', header: 'From', render: (a) => formatDate(a.start_date) },
                    { key: 'end_date', header: 'To', render: (a) => formatDate(a.end_date) },
                    { key: 'monthly_rent', header: 'Rent', align: 'right', render: (a) => formatPKR(a.monthly_rent) },
                    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
                    { key: 'release_reason', header: 'Notes', className: 'max-w-[240px] truncate text-xs text-slate-500' },
                  ]} />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Admissions</h3>
                <div className="rounded-lg border border-slate-200">
                  <DataTable rows={r.admissions} emptyTitle="No admissions" onRowClick={(a) => navigate(`/admissions/${a.id}`)} columns={[
                    { key: 'admission_no', header: 'Admission', className: 'font-medium text-slate-800' },
                    { key: 'admission_date', header: 'Admitted', render: (a) => formatDate(a.admission_date) },
                    { key: 'check_in_date', header: 'Checked in', render: (a) => formatDate(a.check_in_date) },
                    { key: 'checkout_date', header: 'Checked out', render: (a) => formatDate(a.checkout_date) },
                    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
                  ]} />
                </div>
              </div>
            </div>
          )}

          {tab === 'fees' && (
            <div className="rounded-lg border border-slate-200">
              <DataTable rows={invoices} loading={invLoading} emptyTitle="No invoices" columns={[
                { key: 'invoice_no', header: 'Invoice', className: 'font-mono text-xs' },
                { key: 'invoice_type', header: 'Type', render: (i) => humanize(i.invoice_type) },
                { key: 'billing_month', header: 'Month' },
                { key: 'due_date', header: 'Due', render: (i) => formatDate(i.due_date) },
                { key: 'total_amount', header: 'Total', align: 'right', render: (i) => formatPKR(i.total_amount) },
                { key: 'paid_amount', header: 'Paid', align: 'right', render: (i) => formatPKR(i.paid_amount) },
                { key: 'balance', header: 'Balance', align: 'right', render: (i) => formatPKR(i.balance) },
                { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.is_overdue ? 'overdue' : i.status} /> },
              ]} />
            </div>
          )}

          {tab === 'documents' && (
            <div>
              {canManage && <div className="mb-4 flex justify-end"><Button size="sm" icon={Upload} onClick={() => setUploadOpen(true)}>Upload document</Button></div>}
              <div className="rounded-lg border border-slate-200">
                <DataTable rows={r.documents} emptyTitle="No documents uploaded" emptyMessage="Upload CNIC / B-Form copy, student card, photo and other documents." columns={[
                  { key: 'document_type', header: 'Type', render: (d) => labelOf(DOCUMENT_TYPES, d.document_type) },
                  { key: 'title', header: 'Title / File', render: (d) => <div><div>{d.title || '-'}</div><div className="text-xs text-slate-500">{d.original_name}</div></div> },
                  { key: 'file_size', header: 'Size', align: 'right', render: (d) => `${Math.ceil(d.file_size / 1024)} KB` },
                  { key: 'created_at', header: 'Uploaded', render: (d) => <div><div>{formatDate(d.created_at)}</div><div className="text-xs text-slate-500">{d.uploaded_by_name}</div></div> },
                  {
                    key: 'actions', header: '', align: 'right',
                    render: (d) => (
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Download} label="Download" tone="brand" onClick={() => downloadFile(`/residents/${r.id}/documents/${d.id}/download`, {}, d.original_name).catch((e) => toast.error(e.userMessage))} />
                        {canManage && <IconButton icon={Trash2} label="Remove" tone="red" onClick={() => setConfirm({ title: 'Remove document?', message: `Remove ${d.original_name}?`, label: 'Remove', action: () => api.delete(`/residents/${r.id}/documents/${d.id}`) })} />}
                      </div>
                    ),
                  },
                ]} />
              </div>
            </div>
          )}

          {tab === 'attendance' && (
            <div className="rounded-lg border border-slate-200">
              <DataTable rows={attendance} loading={attLoading} emptyTitle="No attendance records" columns={[
                { key: 'attendance_date', header: 'Date', render: (a) => formatDate(a.attendance_date) },
                { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
                { key: 'entry_time', header: 'Entry time', render: (a) => a.entry_time?.slice(0, 5) || '-' },
                { key: 'remarks', header: 'Remarks' },
                { key: 'marked_by_name', header: 'Marked by' },
              ]} />
            </div>
          )}
        </div>
      </Card>

      <UploadDocumentModal open={uploadOpen} residentId={r.id} onClose={() => setUploadOpen(false)} onSaved={() => { setUploadOpen(false); reload(); }} />
      <ConfirmDialog open={Boolean(confirm)} title={confirm?.title} message={confirm?.message} confirmLabel={confirm?.label} variant={confirm?.variant || 'danger'} loading={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
    </div>
  );
}
