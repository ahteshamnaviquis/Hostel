import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import FormField from '../common/FormField';
import Alert from '../common/Alert';
import { SelectField, CheckboxField, TextAreaField } from '../common/Fields';
import { PageLoader } from '../common/Spinner';
import BedPicker from './BedPicker';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PAYMENT_METHODS } from '../../utils/constants';
import { formatPKR, todayISO } from '../../utils/formatters';

/** Shared submit helper for admission actions. */
function useAction(onDone) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const run = async (fn) => {
    setSaving(true);
    setErrors({});
    try {
      const { data } = await fn();
      toast.success(data.message);
      onDone(data.data);
    } catch (e) {
      setErrors(e.fieldErrors);
      toast.error(e.userMessage);
    } finally {
      setSaving(false);
    }
  };
  return { saving, errors, setErrors, run };
}

export function TransferModal({ open, admission, onClose, onDone }) {
  const [bed, setBed] = useState(null);
  const [room, setRoom] = useState(null);
  const [form, setForm] = useState({ transfer_date: todayISO(), reason: '', monthly_rent: '' });
  const { saving, errors, setErrors, run } = useAction(onDone);
  useEffect(() => {
    if (open) {
      setBed(null);
      setForm({ transfer_date: todayISO(), reason: '', monthly_rent: String(admission.monthly_rent) });
    }
  }, [open, admission]);
  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!bed) errs.to_bed_id = 'Choose the new bed';
    if (!form.reason.trim()) errs.reason = 'Reason is required';
    if (Object.keys(errs).length) return setErrors(errs);
    run(() => api.post(`/admissions/${admission.id}/transfer`, { to_bed_id: bed.id, ...form }));
  };
  return (
    <Modal open={open} onClose={onClose} size="xl" title={`Room transfer: ${admission.full_name}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="transfer-form" loading={saving} disabled={!bed}>Confirm transfer</Button></>}>
      <form id="transfer-form" onSubmit={submit} noValidate className="space-y-5">
        <Alert type="info">Current: Room {admission.room_number} / {admission.bed_number}. The current allocation is kept in history and the bed is released.</Alert>
        <BedPicker hostelId={admission.hostel_id} selectedBedId={bed?.id} excludeBedId={admission.bed_id} onSelect={(b, r) => { setBed(b); setRoom(r); setForm((f) => ({ ...f, monthly_rent: String(r.monthly_rent) })); }} />
        {errors.to_bed_id && <p className="text-xs text-red-600">{errors.to_bed_id}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Transfer date" type="date" required name="transfer_date" value={form.transfer_date} onChange={(e) => setForm((f) => ({ ...f, transfer_date: e.target.value }))} error={errors.transfer_date} />
          <FormField label="New monthly rent" type="number" min="0" name="monthly_rent" value={form.monthly_rent} onChange={(e) => setForm((f) => ({ ...f, monthly_rent: e.target.value }))} error={errors.monthly_rent} hint={room ? `Room rate ${formatPKR(room.monthly_rent)} · current ${formatPKR(admission.monthly_rent)}` : undefined} />
          <FormField label="Reason" required name="reason" placeholder="e.g. Requested single room" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} error={errors.reason} />
        </div>
      </form>
    </Modal>
  );
}

export function CheckInModal({ open, admission, onClose, onDone }) {
  const [date, setDate] = useState(todayISO());
  const { saving, errors, run } = useAction(onDone);
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Check-in" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => run(() => api.post(`/admissions/${admission.id}/check-in`, { check_in_date: date }))} loading={saving}>Confirm check-in</Button></>}>
      <FormField label="Check-in date" type="date" name="check_in_date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.check_in_date} />
    </Modal>
  );
}

export function CancelAdmissionModal({ open, admission, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const { saving, errors, setErrors, run } = useAction(onDone);
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Cancel admission" footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button variant="danger" loading={saving} onClick={() => (reason.trim() ? run(() => api.post(`/admissions/${admission.id}/cancel`, { reason })) : setErrors({ reason: 'Reason is required' }))}>Cancel admission</Button></>}>
      <p className="mb-4 text-sm text-slate-600">Use only for admissions made by mistake (no payments received). The bed is released and unpaid invoices are cancelled.</p>
      <FormField label="Reason" required name="reason" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
    </Modal>
  );
}

export function CheckoutModal({ open, admission, onClose, onDone }) {
  const [form, setForm] = useState({ checkout_date: todayISO(), checkout_reason: '', adjust_deposit: true, process_refund: true, refund_method: 'cash', refund_reference: '', remarks: '' });
  const [preview, setPreview] = useState(null);
  const [step, setStep] = useState(1);
  const { saving, errors, setErrors, run } = useAction(onDone);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPreview(null);
    api.get(`/admissions/${admission.id}/checkout-preview`, { params: { adjust_deposit: form.adjust_deposit } }).then(({ data }) => setPreview(data.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.adjust_deposit]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const next = () => {
    if (!form.checkout_reason.trim()) return setErrors({ checkout_reason: 'Reason is required' });
    setStep(2);
  };
  const rows = preview && [
    ['Total billed', preview.invoiced], ['Paid', preview.paid], ['Outstanding dues', preview.outstanding], ['Security deposit held', preview.depositHeld],
    ['Advance credit', preview.advance], ['Deposit adjusted against dues', preview.depositApplied],
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Check-out: ${admission.full_name}`}
      footer={
        step === 1 ? (
          <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={next} disabled={!preview}>Review settlement</Button></>
        ) : (
          <><Button variant="secondary" onClick={() => setStep(1)}>Back</Button><Button variant="danger" loading={saving} onClick={() => run(() => api.post(`/admissions/${admission.id}/checkout`, form))}>Confirm check-out & release bed</Button></>
        )
      }
    >
      {!preview ? <PageLoader /> : step === 1 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Actual check-out date" type="date" required name="checkout_date" value={form.checkout_date} onChange={set('checkout_date')} error={errors.checkout_date} />
            <FormField label="Check-out reason" required name="checkout_reason" placeholder="e.g. Completed degree" value={form.checkout_reason} onChange={set('checkout_reason')} error={errors.checkout_reason} />
          </div>
          <CheckboxField label="Adjust security deposit against outstanding dues" checked={form.adjust_deposit} onChange={set('adjust_deposit')} />
          <CheckboxField label="Record refund of remaining deposit / advance now" checked={form.process_refund} onChange={set('process_refund')} />
          {form.process_refund && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="Refund method" placeholder={null} options={PAYMENT_METHODS} name="refund_method" value={form.refund_method} onChange={set('refund_method')} />
              <FormField label="Refund reference" name="refund_reference" placeholder="Optional transaction id" value={form.refund_reference} onChange={set('refund_reference')} />
            </div>
          )}
          <TextAreaField label="Remarks" name="remarks" rows={2} value={form.remarks} onChange={set('remarks')} />
          <p className="text-xs text-slate-500">Tip: add any final charges (e.g. damages, electricity) as a manual invoice before checking out.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200">
            {rows.map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-100 px-4 py-2 text-sm last:border-0"><span className="text-slate-500">{k}</span><span className="tabular-nums">{formatPKR(v)}</span></div>)}
            <div className="flex justify-between bg-slate-50 px-4 py-2.5 text-sm font-semibold"><span>Remaining dues after checkout</span><span className={preview.remainingOutstanding > 0 ? 'text-red-600' : ''}>{formatPKR(preview.remainingOutstanding)}</span></div>
            <div className="flex justify-between bg-slate-50 px-4 py-2.5 text-sm font-semibold"><span>Refund to resident</span><span className="text-brand-700">{formatPKR(form.process_refund ? preview.totalRefund : 0)}</span></div>
          </div>
          {preview.remainingOutstanding > 0 && <Alert type="warning">Rs. {preview.remainingOutstanding.toLocaleString()} will remain outstanding and can still be collected after checkout.</Alert>}
          <Alert type="info">The bed will be released only after you confirm. A resident cannot be checked out twice.</Alert>
        </div>
      )}
    </Modal>
  );
}

export function FeeStructureModal({ open, admission, feeTypes, onClose, onDone }) {
  const [form, setForm] = useState({ fee_type_id: '', amount: '', frequency: 'monthly', effective_from: todayISO() });
  const { saving, errors, setErrors, run } = useAction(onDone);
  useEffect(() => {
    if (open) setForm({ fee_type_id: '', amount: '', frequency: 'monthly', effective_from: todayISO() });
  }, [open]);
  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.fee_type_id) errs.fee_type_id = 'Select a fee type';
    if (form.amount === '' || Number(form.amount) < 0) errs.amount = 'Amount is required';
    if (Object.keys(errs).length) return setErrors(errs);
    run(() => api.post(`/admissions/${admission.id}/fee-structures`, form));
  };
  return (
    <Modal open={open} onClose={onClose} title="Add / change a recurring charge" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="fs-form" loading={saving}>Save</Button></>}>
      <form id="fs-form" onSubmit={submit} noValidate className="space-y-4">
        <SelectField label="Fee type" required options={(feeTypes || []).filter((f) => f.status === 'active').map((f) => ({ value: String(f.id), label: f.name }))} name="fee_type_id" value={form.fee_type_id} onChange={(e) => setForm((f) => ({ ...f, fee_type_id: e.target.value }))} error={errors.fee_type_id} />
        <FormField label="Amount (PKR)" type="number" min="0" required name="amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} error={errors.amount} />
        <SelectField label="Frequency" placeholder={null} options={[{ value: 'monthly', label: 'Every month' }, { value: 'one_time', label: 'One time (record only)' }]} name="frequency" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} />
        <FormField label="Effective from" type="date" required name="effective_from" value={form.effective_from} onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} error={errors.effective_from} hint="Monthly invoices generated from this date use the new amount. An existing line of the same type is closed." />
      </form>
    </Modal>
  );
}
