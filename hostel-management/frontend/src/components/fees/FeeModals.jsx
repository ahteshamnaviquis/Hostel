import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Printer } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import FormField from '../common/FormField';
import Alert from '../common/Alert';
import StatusBadge from '../common/StatusBadge';
import DataTable from '../common/DataTable';
import ConfirmDialog from '../common/ConfirmDialog';
import { SelectField, InfoGrid } from '../common/Fields';
import { HostelField } from '../common/HostelSelect';
import { PageLoader } from '../common/Spinner';
import AccountPicker from './AccountPicker';
import api from '../../services/api';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { PAYMENT_METHODS, REFUND_TYPES } from '../../utils/constants';
import { formatDate, formatPKR, formatMonth, humanize, todayISO, monthISO, addDaysISO } from '../../utils/formatters';

export function CollectPaymentModal({ open, admissionId, onClose, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ amount: '', payment_date: todayISO(), payment_method: 'cash', reference_no: '', remarks: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setAccount(null);
      setResult(null);
      setForm({ amount: '', payment_date: todayISO(), payment_method: 'cash', reference_no: '', remarks: '' });
    }
  }, [open]);

  useEffect(() => {
    setSelected([]);
    if (!account) return setInvoices([]);
    api.get('/invoices', { params: { admission_id: account.admission_id, status: 'outstanding', limit: 100 } }).then(({ data }) => {
      const list = [...data.data].sort((a, b) => (a.due_date > b.due_date ? 1 : -1));
      setInvoices(list);
      setForm((f) => ({ ...f, amount: account.outstanding > 0 ? String(account.outstanding) : '' }));
    });
  }, [account]);

  const toggle = (inv) => {
    const next = selected.includes(inv.id) ? selected.filter((x) => x !== inv.id) : [...selected, inv.id];
    setSelected(next);
    const sum = invoices.filter((i) => next.includes(i.id)).reduce((s, i) => s + Number(i.balance), 0);
    if (next.length) setForm((f) => ({ ...f, amount: String(sum) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!account) errs.admission_id = 'Choose a resident account';
    if (!(Number(form.amount) > 0)) errs.amount = 'Enter the amount received';
    if (form.payment_method !== 'cash' && form.payment_method !== 'other' && !form.reference_no) errs.reference_no = 'Transaction / reference ID is recommended for bank & wallets';
    if (errs.admission_id || errs.amount) return setErrors(errs);
    setSaving(true);
    try {
      const { data } = await api.post('/payments', { admission_id: account.admission_id, ...form, invoice_ids: selected });
      toast.success(data.message);
      setResult(data.data);
      onDone?.();
    } catch (err) {
      setErrors(err.fieldErrors);
      toast.error(err.userMessage);
    } finally {
      setSaving(false);
    }
  };

  const overpay = account && Number(form.amount) > account.outstanding ? Number(form.amount) - account.outstanding : 0;

  if (result) {
    return (
      <Modal open={open} onClose={onClose} size="sm" title="Payment recorded" footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={Printer} onClick={() => navigate(`/print/receipt/${result.id}`)}>Print receipt</Button></>}>
        <div className="space-y-2 text-sm">
          <p>Receipt <b className="font-mono">{result.receipt_no}</b> has been recorded.</p>
          <p>Applied to invoices: <b>{formatPKR(result.allocated)}</b></p>
          {result.advance > 0 && <p>Kept as advance credit: <b>{formatPKR(result.advance)}</b> (applied automatically to the next invoices)</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Collect payment" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="pay-form" loading={saving} disabled={!account}>Record payment</Button></>}>
      <form id="pay-form" onSubmit={submit} noValidate className="space-y-5">
        <AccountPicker value={account} onSelect={setAccount} admissionId={admissionId} />
        {errors.admission_id && <p className="text-xs text-red-600">{errors.admission_id}</p>}
        {account && (
          <>
            {invoices.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Outstanding invoices <span className="font-normal text-slate-500">(optional: tick to pay specific invoices first; otherwise the oldest are paid first)</span></p>
                <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {invoices.map((i) => (
                    <label key={i.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50">
                      <span className="flex items-center gap-2.5">
                        <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i)} className="h-4 w-4 accent-brand-700" />
                        <span><span className="font-mono text-xs">{i.invoice_no}</span> · {i.billing_month ? formatMonth(i.billing_month) : humanize(i.invoice_type)} · due {formatDate(i.due_date)}</span>
                      </span>
                      <span className={`tabular-nums ${i.is_overdue ? 'text-red-600' : ''}`}>{formatPKR(i.balance)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : <Alert type="info">No outstanding invoices. Any payment will be kept as advance credit.</Alert>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Amount received (PKR)" type="number" min="1" required name="amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} error={errors.amount} hint={overpay ? `${formatPKR(overpay)} will be kept as advance` : Number(form.amount) < account.outstanding && Number(form.amount) > 0 ? 'Partial payment' : undefined} />
              <FormField label="Payment date" type="date" required name="payment_date" max={todayISO()} value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} error={errors.payment_date} />
              <SelectField label="Payment method" required placeholder={null} options={PAYMENT_METHODS} name="payment_method" value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} />
              <FormField label="Reference / Transaction ID" name="reference_no" value={form.reference_no} onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))} error={errors.reference_no} placeholder="JazzCash / Easypaisa / bank ref" />
              <FormField label="Remarks" className="sm:col-span-2" name="remarks" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

export function CreateInvoiceModal({ open, admissionId, onClose, onDone }) {
  const toast = useToast();
  const { data: feeTypes } = useFetch('/fee-types', {}, { enabled: open });
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ invoice_date: todayISO(), due_date: addDaysISO(todayISO(), 7), remarks: '' });
  const [items, setItems] = useState([{ fee_type_id: '', amount: '', description: '' }]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setAccount(null);
      setItems([{ fee_type_id: '', amount: '', description: '' }]);
      setErrors({});
    }
  }, [open]);
  const types = feeTypes || [];
  const isDeduction = (id) => types.find((t) => String(t.id) === String(id))?.is_deduction;
  const total = items.reduce((s, i) => s + (isDeduction(i.fee_type_id) ? -1 : 1) * Number(i.amount || 0), 0);
  const updateItem = (idx, key, value) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!account) errs.admission_id = 'Choose a resident account';
    items.forEach((it, i) => { if (!it.fee_type_id || !(Number(it.amount) > 0)) errs[`item_${i}`] = 'Choose a fee type and amount'; });
    if (total < 0) errs.total = 'Discount cannot be more than the charges';
    if (form.due_date < form.invoice_date) errs.due_date = 'Due date cannot be before invoice date';
    if (Object.keys(errs).length) return setErrors(errs);
    setSaving(true);
    try {
      const { data } = await api.post('/invoices', { admission_id: account.admission_id, ...form, items });
      toast.success(data.message);
      onDone();
    } catch (err) {
      setErrors(err.fieldErrors);
      toast.error(err.userMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Create invoice (manual charges)" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="inv-form" loading={saving}>Create invoice</Button></>}>
      <form id="inv-form" onSubmit={submit} noValidate className="space-y-5">
        <AccountPicker value={account} onSelect={setAccount} admissionId={admissionId} />
        {errors.admission_id && <p className="text-xs text-red-600">{errors.admission_id}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Invoice date" type="date" name="invoice_date" value={form.invoice_date} onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))} />
          <FormField label="Due date" type="date" name="due_date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} error={errors.due_date} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Items</span>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setItems((l) => [...l, { fee_type_id: '', amount: '', description: '' }])}>Add item</Button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 gap-2">
              <SelectField className="col-span-12 sm:col-span-4" options={types.filter((t) => t.status === 'active').map((t) => ({ value: String(t.id), label: t.name }))} value={it.fee_type_id} onChange={(e) => updateItem(i, 'fee_type_id', e.target.value)} error={errors[`item_${i}`]} />
              <input className="col-span-7 h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-5" placeholder="Description (optional)" value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} aria-label="Description" />
              <input className="col-span-4 h-10 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2" type="number" min="0" placeholder="Amount" value={it.amount} onChange={(e) => updateItem(i, 'amount', e.target.value)} aria-label="Amount" />
              <button type="button" className="col-span-1 flex h-10 items-center justify-center text-red-600 disabled:opacity-30" disabled={items.length === 1} onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Remove item"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm font-semibold"><span>Invoice total</span><span className={total < 0 ? 'text-red-600' : ''}>{formatPKR(total)}</span></div>
          {errors.total && <p className="text-xs text-red-600">{errors.total}</p>}
        </div>
        <FormField label="Remarks" name="remarks" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
      </form>
    </Modal>
  );
}

export function GenerateMonthlyModal({ open, onClose, onDone }) {
  const toast = useToast();
  const { defaultHostelId } = useHostel();
  const [form, setForm] = useState({ hostel_id: defaultHostelId, billing_month: monthISO(), due_date: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (open) {
      setResult(null);
      setForm({ hostel_id: defaultHostelId, billing_month: monthISO(), due_date: '' });
    }
  }, [open, defaultHostelId]);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.hostel_id) return setErrors({ hostel_id: 'Select a hostel' });
    setSaving(true);
    try {
      const { data } = await api.post('/invoices/generate-monthly', form);
      toast.success(data.message);
      setResult(data.data);
      onDone();
    } catch (err) {
      setErrors(err.fieldErrors);
      toast.error(err.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Generate monthly fees" footer={result ? <Button onClick={onClose}>Done</Button> : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="gen-form" loading={saving}>Generate invoices</Button></>}>
      {result ? (
        <div className="space-y-2 text-sm">
          <p><b>{result.created}</b> invoice(s) created totalling <b>{formatPKR(result.totalAmount)}</b>.</p>
          <p className="text-slate-500">{result.skipped} skipped (already invoiced for this month or no monthly charges). Advance credit was applied automatically.</p>
        </div>
      ) : (
        <form id="gen-form" onSubmit={submit} noValidate className="space-y-4">
          <p className="text-sm text-slate-500">Creates one invoice per active resident from their monthly fee structure (rent, mess, etc.). Running it again for the same month never creates duplicates.</p>
          <HostelField value={form.hostel_id} onChange={(e) => setForm((f) => ({ ...f, hostel_id: e.target.value }))} error={errors.hostel_id} />
          <FormField label="Billing month" type="month" required name="billing_month" value={form.billing_month} onChange={(e) => setForm((f) => ({ ...f, billing_month: e.target.value }))} error={errors.billing_month} />
          <FormField label="Due date" type="date" name="due_date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} error={errors.due_date} hint="Leave empty to use the due day from Settings" />
        </form>
      )}
    </Modal>
  );
}

export function RefundModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ refund_type: 'advance', amount: '', refund_date: todayISO(), payment_method: 'cash', reference_no: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setAccount(null);
      setErrors({});
      setForm({ refund_type: 'advance', amount: '', refund_date: todayISO(), payment_method: 'cash', reference_no: '', reason: '' });
    }
  }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!account) errs.admission_id = 'Choose a resident account';
    if (!(Number(form.amount) > 0)) errs.amount = 'Enter the refund amount';
    if (!form.reason.trim()) errs.reason = 'Reason is required';
    if (Object.keys(errs).length) return setErrors(errs);
    setSaving(true);
    try {
      const { data } = await api.post('/refunds', { admission_id: account.admission_id, ...form });
      toast.success(data.message);
      onDone();
    } catch (err) {
      setErrors(err.fieldErrors);
      toast.error(err.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record refund" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="refund-form" loading={saving}>Record refund</Button></>}>
      <form id="refund-form" onSubmit={submit} noValidate className="space-y-4">
        <AccountPicker value={account} onSelect={setAccount} />
        {errors.admission_id && <p className="text-xs text-red-600">{errors.admission_id}</p>}
        <Alert type="info">Security deposits are normally refunded during check-out. Advance refunds cannot exceed the resident's advance credit.</Alert>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Refund type" placeholder={null} options={REFUND_TYPES} name="refund_type" value={form.refund_type} onChange={(e) => setForm((f) => ({ ...f, refund_type: e.target.value }))} />
          <FormField label="Amount (PKR)" type="number" min="1" required name="amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} error={errors.amount} hint={account ? `Advance available: ${formatPKR(account.advance)}` : undefined} />
          <FormField label="Refund date" type="date" name="refund_date" value={form.refund_date} onChange={(e) => setForm((f) => ({ ...f, refund_date: e.target.value }))} />
          <SelectField label="Method" placeholder={null} options={PAYMENT_METHODS} name="payment_method" value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} />
          <FormField label="Reference" name="reference_no" value={form.reference_no} onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))} />
          <FormField label="Reason" required name="reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} error={errors.reason} />
        </div>
      </form>
    </Modal>
  );
}

export function InvoiceDetailModal({ invoiceId, onClose, onChanged }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: inv, loading, reload } = useFetch(invoiceId ? `/invoices/${invoiceId}` : null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = async () => {
    try {
      await api.post(`/invoices/${invoiceId}/cancel`, { reason: reason || 'Cancelled' });
      toast.success('Invoice cancelled');
      setCancelOpen(false);
      reload();
      onChanged();
    } catch (e) {
      toast.error(e.userMessage);
    }
  };
  return (
    <Modal open={Boolean(invoiceId)} onClose={onClose} size="lg" title={inv ? `Invoice ${inv.invoice_no}` : 'Invoice'}
      footer={inv && <>
        {['unpaid'].includes(inv.status) && Number(inv.paid_amount) === 0 && <Button variant="ghost" onClick={() => setCancelOpen(true)}>Cancel invoice</Button>}
        {['unpaid', 'partially_paid'].includes(inv.status) && <Button onClick={() => navigate(`/fees?collect=${inv.admission_id}`)}>Collect payment</Button>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </>}
    >
      {loading || !inv ? <PageLoader /> : (
        <div className="space-y-5">
          <InfoGrid items={[
            { label: 'Resident', value: `${inv.full_name} (${inv.registration_no})` },
            { label: 'Admission', value: inv.admission_no },
            { label: 'Status', value: <StatusBadge status={inv.status} /> },
            { label: 'Type / Month', value: `${humanize(inv.invoice_type)}${inv.billing_month ? ` · ${formatMonth(inv.billing_month)}` : ''}` },
            { label: 'Invoice date', value: formatDate(inv.invoice_date) },
            { label: 'Due date', value: formatDate(inv.due_date) },
            { label: 'Cancelled', value: inv.cancelled_at ? `${formatDate(inv.cancelled_at)} by ${inv.cancelled_by_name}: ${inv.cancel_reason}` : '', hidden: !inv.cancelled_at },
          ]} />
          <div className="rounded-lg border border-slate-200">
            <DataTable rows={inv.items} dense columns={[
              { key: 'description', header: 'Item', render: (i) => <div>{i.description}<div className="text-xs text-slate-500">{i.fee_type_name}</div></div> },
              { key: 'amount', header: 'Amount', align: 'right', render: (i) => (i.is_deduction ? `- ${formatPKR(i.amount)}` : formatPKR(i.amount)) },
            ]} footer={
              <>
                <tr><td className="px-4 py-2">Total</td><td className="px-4 py-2 text-right">{formatPKR(inv.total_amount)}</td></tr>
                <tr><td className="px-4 py-2 font-normal text-slate-600">Paid</td><td className="px-4 py-2 text-right font-normal">{formatPKR(inv.paid_amount)}</td></tr>
                <tr><td className="px-4 py-2">Balance</td><td className="px-4 py-2 text-right text-red-600">{formatPKR(inv.balance)}</td></tr>
              </>
            } />
          </div>
          {inv.payments.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Payments applied</h4>
              <div className="rounded-lg border border-slate-200">
                <DataTable rows={inv.payments} dense columns={[
                  { key: 'receipt_no', header: 'Receipt', className: 'font-mono text-xs' },
                  { key: 'payment_date', header: 'Date', render: (p) => formatDate(p.payment_date) },
                  { key: 'payment_method', header: 'Method', render: (p) => <StatusBadge status={p.payment_method} /> },
                  { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                  { key: 'amount', header: 'Applied', align: 'right', render: (p) => formatPKR(p.amount) },
                ]} />
              </div>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog open={cancelOpen} title="Cancel invoice?" confirmLabel="Cancel invoice" onCancel={() => setCancelOpen(false)} onConfirm={cancel}
        message={<span className="block space-y-2"><span className="block">Cancelled invoices stay in the records but are no longer payable.</span><input className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /></span>} />
    </Modal>
  );
}

