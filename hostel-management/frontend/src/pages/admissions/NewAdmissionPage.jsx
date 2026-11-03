import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, CheckCircle2, UserPlus } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import Alert from '../../components/common/Alert';
import SearchInput from '../../components/common/SearchInput';
import StatusBadge from '../../components/common/StatusBadge';
import { SelectField, CheckboxField, TextAreaField } from '../../components/common/Fields';
import { PageLoader } from '../../components/common/Spinner';
import BedPicker from '../../components/admissions/BedPicker';
import useFetch from '../../hooks/useFetch';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { formatPKR, todayISO, addDaysISO } from '../../utils/formatters';

/** Step 1: choose a resident who can be admitted (pending or checked out). */
function ResidentChooser({ onPick }) {
  const { hostelId } = useHostel();
  const [search, setSearch] = useState('');
  const { data, loading } = useFetch('/residents', { search, hostel_id: hostelId, limit: 10 }, { enabled: search.length >= 2 });
  const eligible = (data || []).filter((r) => ['pending', 'checked_out'].includes(r.status) && !r.admission_id);
  return (
    <div>
      <SearchInput placeholder="Type at least 2 letters: name, CNIC, mobile, reg. no..." value={search} onChange={setSearch} />
      {search.length >= 2 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {loading && <li className="px-4 py-3 text-sm text-slate-500">Searching...</li>}
          {!loading && !eligible.length && (
            <li className="px-4 py-3 text-sm text-slate-500">
              No eligible residents found. Only pending or checked-out residents can be admitted. <Link className="text-brand-700" to="/residents/new">Register a new resident</Link>
            </li>
          )}
          {eligible.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onPick(r.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <span>
                  <span className="block text-sm font-medium text-slate-800">{r.full_name}</span>
                  <span className="block text-xs text-slate-500">{r.registration_no} · {r.cnic || r.mobile} · {r.hostel_name}</span>
                </span>
                <StatusBadge status={r.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NewAdmissionPage() {
  useDocumentTitle('New admission');
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [residentId, setResidentId] = useState(params.get('resident') || '');
  const [bed, setBed] = useState(null);
  const [room, setRoom] = useState(null);
  const [form, setForm] = useState({
    admission_date: todayISO(), expected_leaving_date: '', monthly_rent: '', security_deposit: '', admission_fee: '0', monthly_discount: '0',
    check_in_now: true, generate_invoices: true, remarks: '',
  });
  const [extraFees, setExtraFees] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { data: resident, loading: resLoading } = useFetch(residentId ? `/residents/${residentId}` : null);
  const { data: feeTypes } = useFetch('/fee-types');
  const presetBed = Number(params.get('bed')) || null;

  // Pre-select a bed when coming from a room page
  const { data: available } = useFetch('/rooms/available', { hostel_id: resident?.hostel_id }, { enabled: Boolean(presetBed && resident) });
  useEffect(() => {
    if (!presetBed || !available || bed) return;
    for (const r of available) {
      const b = r.free_beds.find((x) => x.id === presetBed);
      if (b) {
        pickBed(b, r);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const pickBed = (b, r) => {
    setBed(b);
    setRoom(r);
    setForm((f) => ({ ...f, monthly_rent: String(r.monthly_rent), security_deposit: String(r.security_deposit) }));
    setErrors((e) => ({ ...e, bed_id: undefined }));
  };

  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const monthlyFeeTypes = useMemo(() => (feeTypes || []).filter((f) => ['mess_fee', 'internet', 'laundry', 'electricity', 'gas', 'other'].includes(f.code)), [feeTypes]);
  const monthlyTotal = Number(form.monthly_rent || 0) + extraFees.reduce((s, f) => s + Number(f.amount || 0), 0) - Number(form.monthly_discount || 0);
  const firstBill = Number(form.security_deposit || 0) + Number(form.admission_fee || 0) + monthlyTotal;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!resident) errs.resident_id = 'Choose a resident';
    if (!bed) errs.bed_id = 'Choose a bed';
    if (!form.admission_date) errs.admission_date = 'Admission date is required';
    if (form.expected_leaving_date && form.expected_leaving_date <= form.admission_date) errs.expected_leaving_date = 'Must be after the admission date';
    if (form.monthly_rent === '' || Number(form.monthly_rent) < 0) errs.monthly_rent = 'Monthly rent is required';
    if (monthlyTotal < 0) errs.monthly_discount = 'Discount cannot exceed monthly charges';
    extraFees.forEach((f, i) => { if (!f.fee_type_id || !(Number(f.amount) > 0)) errs[`extra_${i}`] = 'Select a fee type and amount'; });
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error('Please complete the highlighted fields');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/admissions', {
        resident_id: resident.id, bed_id: bed.id, ...form,
        extra_fees: extraFees.map((f) => ({ fee_type_id: f.fee_type_id, amount: f.amount })),
      });
      toast.success(data.message);
      navigate(`/admissions/${data.data.id}`);
    } catch (error) {
      setErrors(error.fieldErrors);
      toast.error(error.userMessage);
      if (error.response?.status === 409 && error.userMessage.includes('bed')) setBed(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-6xl">
      <PageHeader title="New admission" description="Choose resident → select an available bed → confirm rent and charges." breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Admissions', to: '/admissions' }, { label: 'New' }]} />

      <Card title="1. Resident" className="mb-6" action={<Link to="/residents/new" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700"><UserPlus className="h-3.5 w-3.5" /> Register new</Link>}>
        {resLoading ? <PageLoader /> : resident ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{resident.full_name}</span><StatusBadge status={resident.status} /></div>
              <div className="text-sm text-slate-500">{resident.registration_no} · {resident.cnic || 'No CNIC'} · {resident.mobile} · {resident.hostel_name}</div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setResidentId(''); setBed(null); }}>Change</Button>
          </div>
        ) : <ResidentChooser onPick={(id) => setResidentId(String(id))} />}
        {resident && (!['pending', 'checked_out'].includes(resident.status) || resident.admission_id) && (
          <Alert type="error" className="mt-4">This resident already has an open admission or is {resident.status.replace('_', ' ')} and cannot be admitted.</Alert>
        )}
        {errors.resident_id && <p className="mt-2 text-xs text-red-600">{errors.resident_id}</p>}
      </Card>

      <Card title="2. Room & bed" subtitle={bed ? `Selected: Room ${room.room_number} / ${bed.bed_number}` : 'Only beds that are free right now are shown'} className="mb-6">
        <BedPicker hostelId={resident?.hostel_id} selectedBedId={bed?.id} onSelect={pickBed} />
        {errors.bed_id && <p className="mt-2 text-xs text-red-600">{errors.bed_id}</p>}
      </Card>

      <Card title="3. Admission details & charges" className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Admission date" type="date" required name="admission_date" value={form.admission_date} onChange={set('admission_date')} error={errors.admission_date} />
          <FormField label="Expected leaving date" type="date" name="expected_leaving_date" value={form.expected_leaving_date} min={addDaysISO(form.admission_date || todayISO(), 1)} onChange={set('expected_leaving_date')} error={errors.expected_leaving_date} />
          <FormField label="Monthly rent (PKR)" type="number" min="0" required name="monthly_rent" value={form.monthly_rent} onChange={set('monthly_rent')} error={errors.monthly_rent} hint={room ? `Room rate: ${formatPKR(room.monthly_rent)}` : undefined} />
          <FormField label="Security deposit (PKR)" type="number" min="0" name="security_deposit" value={form.security_deposit} onChange={set('security_deposit')} error={errors.security_deposit} hint="Refundable at checkout" />
          <FormField label="Admission fee (PKR)" type="number" min="0" name="admission_fee" value={form.admission_fee} onChange={set('admission_fee')} error={errors.admission_fee} />
          <FormField label="Monthly discount (PKR)" type="number" min="0" name="monthly_discount" value={form.monthly_discount} onChange={set('monthly_discount')} error={errors.monthly_discount} />
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Other monthly charges</h3>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setExtraFees((f) => [...f, { fee_type_id: '', amount: '' }])}>Add charge</Button>
          </div>
          {extraFees.length === 0 && <p className="text-sm text-slate-500">e.g. mess fee, internet, laundry - billed every month with rent.</p>}
          {extraFees.map((f, i) => (
            <div key={i} className="mb-2 flex flex-wrap items-start gap-2">
              <SelectField className="min-w-48 flex-1" options={monthlyFeeTypes.map((t) => ({ value: String(t.id), label: t.name }))} value={f.fee_type_id} onChange={(e) => setExtraFees((x) => x.map((y, j) => (j === i ? { ...y, fee_type_id: e.target.value } : y)))} error={errors[`extra_${i}`]} />
              <input type="number" min="0" placeholder="Amount" value={f.amount} onChange={(e) => setExtraFees((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} className="h-10 w-36 rounded-lg border border-slate-300 px-3 text-sm" aria-label="Amount" />
              <button type="button" onClick={() => setExtraFees((x) => x.filter((_, j) => j !== i))} className="h-10 rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label="Remove charge"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <CheckboxField label="Resident is checking in today" hint="Untick to reserve the bed and check in later" checked={form.check_in_now} onChange={set('check_in_now')} />
            <CheckboxField label="Generate initial invoices" hint="Deposit + admission fee invoice and the first month's invoice" checked={form.generate_invoices} onChange={set('generate_invoices')} />
            <TextAreaField label="Remarks" name="remarks" value={form.remarks} onChange={set('remarks')} rows={2} />
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <h4 className="mb-2 font-semibold text-slate-800">Summary</h4>
            {[
              ['Monthly charges', formatPKR(monthlyTotal)],
              ['Security deposit', formatPKR(form.security_deposit || 0)],
              ['Admission fee', formatPKR(form.admission_fee || 0)],
            ].map(([k, v]) => <div key={k} className="flex justify-between py-1"><span className="text-slate-500">{k}</span><span>{v}</span></div>)}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Payable at admission</span><span>{formatPKR(form.generate_invoices ? firstBill : 0)}</span></div>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" icon={CheckCircle2} loading={saving} disabled={!resident || !bed}>Confirm admission</Button>
      </div>
    </form>
  );
}
