import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, KeyRound, Power } from 'lucide-react';
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
import { SelectField, CheckboxField } from '../../components/common/Fields';
import { PageLoader } from '../../components/common/Spinner';
import useFetch from '../../hooks/useFetch';
import useForm from '../../hooks/useForm';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/formatters';

const EMPTY = { full_name: '', email: '', username: '', phone: '', password: '', role: 'hostel_admin', status: 'active', hostel_ids: [], permission_codes: [] };
const strongEnough = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/** Create / edit administrator incl. hostel assignment and permissions. */
function AdminFormModal({ open, admin, onClose, onSaved }) {
  const toast = useToast();
  const form = useForm(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const { data: perms } = useFetch('/permissions', {}, { enabled: open });
  const { data: hostels } = useFetch('/hostels/options', {}, { enabled: open });

  useEffect(() => {
    if (!open) return;
    if (!admin) {
      form.reset(EMPTY);
      return;
    }
    setLoadingDetail(true);
    api.get(`/users/${admin.id}`).then(({ data }) => {
      const u = data.data;
      form.reset({ ...EMPTY, full_name: u.full_name, email: u.email, username: u.username || '', phone: u.phone || '', role: u.role, status: u.status,
        hostel_ids: u.hostels.map((h) => h.id), permission_codes: u.permissions });
    }).finally(() => setLoadingDetail(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, admin]);

  // New admins start with the default Hostel Admin permissions
  useEffect(() => {
    if (open && !admin && perms) form.setValue('permission_codes', perms.hostelAdminDefaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, admin, perms]);

  const v = form.values;
  const toggleIn = (key, val) => form.setValue(key, v[key].includes(val) ? v[key].filter((x) => x !== val) : [...v[key], val]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!v.full_name.trim()) errs.full_name = 'Full name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.email = 'Valid email is required';
    if (!admin && !strongEnough(v.password)) errs.password = 'At least 8 characters with letters and numbers';
    if (Object.keys(errs).length) return form.setErrors(errs);
    setSaving(true);
    try {
      const profile = { full_name: v.full_name, email: v.email, username: v.username, phone: v.phone, status: v.status };
      if (!admin) {
        const { data } = await api.post('/users', { ...profile, password: v.password, role: v.role, hostel_ids: v.hostel_ids, permission_codes: v.role === 'hostel_admin' ? v.permission_codes : undefined });
        toast.success(data.message);
      } else {
        await api.put(`/users/${admin.id}`, profile);
        if (v.role === 'hostel_admin') {
          await api.put(`/users/${admin.id}/hostels`, { hostel_ids: v.hostel_ids });
          await api.put(`/users/${admin.id}/permissions`, { permission_codes: v.permission_codes });
        }
        toast.success('Administrator updated');
      }
      onSaved();
    } catch (error) {
      form.applyServerErrors(error);
      toast.error(error.userMessage);
    } finally {
      setSaving(false);
    }
  };

  const groups = (perms?.permissions || []).reduce((acc, p) => ({ ...acc, [p.module]: [...(acc[p.module] || []), p] }), {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={admin ? `Edit ${admin.full_name}` : 'Create administrator'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="admin-form" loading={saving}>{admin ? 'Save changes' : 'Create administrator'}</Button></>}
    >
      {loadingDetail ? <PageLoader /> : (
        <form id="admin-form" onSubmit={submit} noValidate className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Full name" required {...form.field('full_name')} />
            <FormField label="Email" type="email" required {...form.field('email')} />
            <FormField label="Username" hint="Optional - can be used to log in" {...form.field('username')} />
            <FormField label="Phone" placeholder="0300-1234567" {...form.field('phone')} />
            {!admin && <FormField label="Password" type="password" autoComplete="new-password" required hint="At least 8 characters with letters and numbers" {...form.field('password')} />}
            {!admin && (
              <SelectField label="Role" placeholder={null} options={[{ value: 'hostel_admin', label: 'Hostel Admin' }, { value: 'super_admin', label: 'Super Admin' }]} {...form.field('role')} />
            )}
            <SelectField label="Account status" placeholder={null} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'suspended', label: 'Suspended' }]} {...form.field('status')} />
          </div>

          {v.role === 'hostel_admin' ? (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-slate-800">Assigned hostels</legend>
                <p className="mb-3 text-xs text-slate-500">The administrator can only see and manage data of these hostels.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(hostels || []).map((h) => (
                    <CheckboxField key={h.id} checked={v.hostel_ids.includes(h.id)} onChange={() => toggleIn('hostel_ids', h.id)} label={`${h.name} (${h.city})`} hint={h.status !== 'active' ? 'Inactive hostel' : undefined} />
                  ))}
                  {hostels?.length === 0 && <p className="text-sm text-slate-500">No hostels yet.</p>}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-slate-800">Permissions</legend>
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {Object.entries(groups).flatMap(([, list]) => list).map((p) => (
                    <CheckboxField key={p.code} checked={v.permission_codes.includes(p.code)} onChange={() => toggleIn('permission_codes', p.code)} label={p.name} hint={p.description} />
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Super Admins have full access to every hostel and module.</p>
          )}
        </form>
      )}
    </Modal>
  );
}

function ResetPasswordModal({ admin, onClose }) {
  const toast = useToast();
  const form = useForm({ new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!strongEnough(form.values.new_password)) return form.setErrors({ new_password: 'At least 8 characters with letters and numbers' });
    if (form.values.new_password !== form.values.confirm) return form.setErrors({ confirm: 'Passwords do not match' });
    setSaving(true);
    try {
      const { data } = await api.post(`/users/${admin.id}/reset-password`, { new_password: form.values.new_password });
      toast.success(data.message);
      onClose();
    } catch (error) {
      form.applyServerErrors(error);
      toast.error(error.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={Boolean(admin)} onClose={onClose} size="sm" title={`Reset password: ${admin?.full_name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="reset-form" loading={saving}>Reset password</Button></>}>
      <form id="reset-form" onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-500">The administrator will be signed out everywhere and must use the new password.</p>
        <FormField label="New password" type="password" autoComplete="new-password" required {...form.field('new_password')} />
        <FormField label="Confirm password" type="password" autoComplete="new-password" required {...form.field('confirm')} />
      </form>
    </Modal>
  );
}

export default function AdministratorsPage() {
  useDocumentTitle('Administrators');
  const toast = useToast();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', status: '', role: '', hostel_id: '', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/users', filters);
  const { data: hostelOptions } = useFetch('/hostels/options');
  const [modal, setModal] = useState({ open: params.get('new') === '1', admin: null });
  const [resetFor, setResetFor] = useState(null);
  const [toggle, setToggle] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') setParams({}, { replace: true });
  }, [params, setParams]);
  const set = (k) => (val) => setFilters((f) => ({ ...f, [k]: val, page: 1 }));

  const changeStatus = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.patch(`/users/${toggle.id}/status`, { status: toggle.status === 'active' ? 'inactive' : 'active' });
      toast.success(res.message);
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
        title="Administrators"
        description="Create administrators, assign hostels and control what each one can do."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Administrators' }]}
        actions={<Button icon={Plus} onClick={() => setModal({ open: true, admin: null })}>Create administrator</Button>}
      />
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchInput className="sm:w-72" placeholder="Search name, email, phone..." value={filters.search} onChange={set('search')} />
          <FilterSelect value={filters.role} onChange={set('role')} placeholder="All roles" options={[{ value: 'hostel_admin', label: 'Hostel Admin' }, { value: 'super_admin', label: 'Super Admin' }]} />
          <FilterSelect value={filters.hostel_id} onChange={set('hostel_id')} placeholder="All hostels" options={(hostelOptions || []).map((h) => ({ value: String(h.id), label: h.name }))} />
          <FilterSelect value={filters.status} onChange={set('status')} placeholder="All statuses" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'suspended', label: 'Suspended' }]} />
        </Toolbar>
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No administrators found"
          columns={[
            { key: 'full_name', header: 'Name', render: (r) => <div><div className="font-medium text-slate-800">{r.full_name}</div><div className="text-xs text-slate-500">{r.email}</div></div> },
            { key: 'phone', header: 'Phone' },
            { key: 'role', header: 'Role', render: (r) => <StatusBadge status={r.role} /> },
            { key: 'hostel_names', header: 'Hostels', className: 'max-w-[240px] truncate', render: (r) => (r.role === 'super_admin' ? <span className="text-slate-500">All hostels</span> : r.hostel_names || <span className="text-amber-600">Not assigned</span>) },
            { key: 'permission_count', header: 'Permissions', align: 'right', render: (r) => (r.role === 'super_admin' ? 'All' : r.permission_count) },
            { key: 'last_login_at', header: 'Last login', render: (r) => formatDateTime(r.last_login_at) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: '', align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-1">
                  <IconButton icon={Pencil} label="Edit, hostels & permissions" tone="brand" onClick={() => setModal({ open: true, admin: r })} />
                  <IconButton icon={KeyRound} label="Reset password" onClick={() => setResetFor(r)} />
                  {r.id !== user.id && <IconButton icon={Power} label={r.status === 'active' ? 'Deactivate' : 'Activate'} tone={r.status === 'active' ? 'red' : 'brand'} onClick={() => setToggle(r)} />}
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>

      <AdminFormModal open={modal.open} admin={modal.admin} onClose={() => setModal({ open: false, admin: null })} onSaved={() => { setModal({ open: false, admin: null }); reload(); }} />
      <ResetPasswordModal admin={resetFor} onClose={() => setResetFor(null)} />
      <ConfirmDialog
        open={Boolean(toggle)}
        title={toggle?.status === 'active' ? 'Deactivate administrator?' : 'Activate administrator?'}
        message={toggle?.status === 'active' ? `${toggle?.full_name} will be signed out immediately and will not be able to log in.` : `${toggle?.full_name} will be able to log in again.`}
        confirmLabel={toggle?.status === 'active' ? 'Deactivate' : 'Activate'}
        variant={toggle?.status === 'active' ? 'danger' : 'primary'}
        loading={busy}
        onCancel={() => setToggle(null)}
        onConfirm={changeStatus}
      />
    </div>
  );
}
