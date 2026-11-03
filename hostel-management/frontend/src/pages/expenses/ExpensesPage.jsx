import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Ban, Paperclip } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import SearchInput from '../../components/common/SearchInput';
import Toolbar, { FilterSelect, FilterDate } from '../../components/common/Toolbar';
import StatusBadge from '../../components/common/StatusBadge';
import IconButton from '../../components/common/IconButton';
import Modal from '../../components/common/Modal';
import FormField from '../../components/common/FormField';
import { SelectField, TextAreaField } from '../../components/common/Fields';
import { HostelField } from '../../components/common/HostelSelect';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api, { downloadFile } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { PAYMENT_METHODS } from '../../utils/constants';
import { formatDate, formatPKR, todayISO } from '../../utils/formatters';

function ExpenseModal({ open, expense, categories, onClose, onSaved }) {
  const toast = useToast();
  const { defaultHostelId } = useHostel();
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setErrors({});
    setForm(expense
      ? { hostel_id: String(expense.hostel_id), category_id: String(expense.category_id), title: expense.title, amount: String(expense.amount), expense_date: expense.expense_date, payment_method: expense.payment_method, description: expense.description || '' }
      : { hostel_id: defaultHostelId, category_id: '', title: '', amount: '', expense_date: todayISO(), payment_method: 'cash', description: '' });
  }, [open, expense, defaultHostelId]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.hostel_id) errs.hostel_id = 'Select a hostel';
    if (!form.category_id) errs.category_id = 'Select a category';
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!(Number(form.amount) > 0)) errs.amount = 'Enter the amount';
    if (form.expense_date > todayISO()) errs.expense_date = 'Expense date cannot be in the future';
    if (file && file.size > 5 * 1024 * 1024) errs.receipt = 'File is too large (max 5 MB)';
    if (Object.keys(errs).length) return setErrors(errs);
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, v));
    if (file) data.append('receipt', file);
    setSaving(true);
    try {
      const { data: res } = expense ? await api.put(`/expenses/${expense.id}`, data) : await api.post('/expenses', data);
      toast.success(res.message);
      onSaved();
    } catch (err) {
      setErrors(err.fieldErrors);
      toast.error(err.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={expense ? 'Edit expense' : 'Record expense'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="expense-form" loading={saving}>Save expense</Button></>}>
      <form id="expense-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HostelField value={form.hostel_id || ''} onChange={set('hostel_id')} error={errors.hostel_id} disabled={Boolean(expense)} />
        <SelectField label="Category" required options={categories.map((c) => ({ value: String(c.id), label: c.name }))} name="category_id" value={form.category_id || ''} onChange={set('category_id')} error={errors.category_id} />
        <FormField label="Expense title" required className="sm:col-span-2" placeholder="e.g. LESCO bill October" name="title" value={form.title || ''} onChange={set('title')} error={errors.title} />
        <FormField label="Amount (PKR)" type="number" min="1" required name="amount" value={form.amount || ''} onChange={set('amount')} error={errors.amount} />
        <FormField label="Expense date" type="date" required max={todayISO()} name="expense_date" value={form.expense_date || ''} onChange={set('expense_date')} error={errors.expense_date} />
        <SelectField label="Payment method" placeholder={null} options={PAYMENT_METHODS} name="payment_method" value={form.payment_method || 'cash'} onChange={set('payment_method')} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="receipt">Receipt / attachment</label>
          <input id="receipt" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setFile(e.target.files[0] || null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800" />
          <p className={`mt-1 text-xs ${errors.receipt ? 'text-red-600' : 'text-slate-500'}`}>{errors.receipt || (expense?.has_receipt ? 'A receipt is attached; choose a file to replace it' : 'JPG, PNG or PDF up to 5 MB')}</p>
        </div>
        <TextAreaField label="Description" className="sm:col-span-2" rows={2} name="description" value={form.description || ''} onChange={set('description')} />
      </form>
    </Modal>
  );
}

export default function ExpensesPage() {
  useDocumentTitle('Expenses');
  const toast = useToast();
  const { hostelId } = useHostel();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ search: '', category_id: '', payment_method: '', from: '', to: '', status: 'posted', page: 1 });
  const { data, meta, loading, error, reload } = useFetch('/expenses', { ...filters, hostel_id: hostelId });
  const { data: categories } = useFetch('/expense-categories');
  const [modal, setModal] = useState({ open: params.get('new') === '1', expense: null });
  const [voidFor, setVoidFor] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (params.get('new')) setParams({}, { replace: true }); }, [params, setParams]);
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  const doVoid = async () => {
    if (!reason.trim()) return toast.error('Please give a reason');
    setBusy(true);
    try {
      await api.post(`/expenses/${voidFor.id}/void`, { reason });
      toast.success('Expense voided');
      reload();
    } catch (e) {
      toast.error(e.userMessage);
    } finally {
      setBusy(false);
      setVoidFor(null);
      setReason('');
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Expenses" description="Electricity, gas, mess, salaries, maintenance and other hostel expenses." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Expenses' }]}
        actions={<Button icon={Plus} onClick={() => setModal({ open: true, expense: null })}>Record expense</Button>} />
      {meta && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <StatCard label={filters.status === 'void' ? 'Voided total' : 'Total (filtered)'} value={formatPKR(meta.totals.amount)} tone="amber" hint={`${meta.total} expense(s)`} />
          <Card title="By category" className="lg:col-span-2" bodyClassName="px-5 py-3">
            {meta.byCategory.length === 0 ? <p className="text-sm text-slate-500">No expenses</p> : (
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {meta.byCategory.map((c) => <span key={c.category}><span className="text-slate-500">{c.category}:</span> <b>{formatPKR(c.amount)}</b></span>)}
              </div>
            )}
          </Card>
        </div>
      )}
      <Card bodyClassName="p-0">
        <Toolbar>
          <SearchInput className="sm:w-64" placeholder="Search title or description..." value={filters.search} onChange={set('search')} />
          <FilterSelect value={filters.category_id} onChange={set('category_id')} placeholder="All categories" options={(categories || []).map((c) => ({ value: String(c.id), label: c.name }))} />
          <FilterSelect value={filters.payment_method} onChange={set('payment_method')} placeholder="All methods" options={PAYMENT_METHODS} />
          <FilterSelect value={filters.status} onChange={set('status')} placeholder={null} options={[{ value: 'posted', label: 'Posted' }, { value: 'void', label: 'Voided' }]} />
          <FilterDate label="From" value={filters.from} onChange={set('from')} />
          <FilterDate label="To" value={filters.to} onChange={set('to')} />
        </Toolbar>
        <DataTable rows={data} loading={loading} error={error} onRetry={reload} emptyTitle="No expenses recorded" columns={[
          { key: 'expense_date', header: 'Date', render: (r) => formatDate(r.expense_date) },
          { key: 'title', header: 'Expense', render: (r) => <div><div className="font-medium text-slate-800">{r.title}</div>{r.description && <div className="max-w-[260px] truncate text-xs text-slate-500">{r.description}</div>}</div> },
          { key: 'category_name', header: 'Category' },
          { key: 'hostel_name', header: 'Hostel' },
          { key: 'payment_method', header: 'Method', render: (r) => <StatusBadge status={r.payment_method} /> },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="font-medium">{formatPKR(r.amount)}</span> },
          { key: 'added_by_name', header: 'Added by' },
          { key: 'status', header: 'Status', render: (r) => <span title={r.void_reason || ''}><StatusBadge status={r.status} /></span> },
          {
            key: 'actions', header: '', align: 'right',
            render: (r) => (
              <div className="flex justify-end gap-1">
                {r.has_receipt ? <IconButton icon={Paperclip} label="Download receipt" onClick={() => downloadFile(`/expenses/${r.id}/receipt`, {}, 'receipt').catch((e) => toast.error(e.userMessage))} /> : null}
                {r.status === 'posted' && <IconButton icon={Pencil} label="Edit" tone="brand" onClick={() => setModal({ open: true, expense: r })} />}
                {r.status === 'posted' && <IconButton icon={Ban} label="Void expense" tone="red" onClick={() => setVoidFor(r)} />}
              </div>
            ),
          },
        ]} />
        <Pagination meta={meta} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </Card>
      <ExpenseModal open={modal.open} expense={modal.expense} categories={categories || []} onClose={() => setModal({ open: false, expense: null })} onSaved={() => { setModal({ open: false, expense: null }); reload(); }} />
      <Modal open={Boolean(voidFor)} onClose={() => setVoidFor(null)} size="sm" title="Void expense?" footer={<><Button variant="secondary" onClick={() => setVoidFor(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={doVoid}>Void expense</Button></>}>
        <p className="mb-4 text-sm text-slate-600">Financial records are never deleted. "{voidFor?.title}" ({formatPKR(voidFor?.amount)}) will be marked void and excluded from totals.</p>
        <FormField label="Reason" required name="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  );
}
