import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import FormField from '../../components/common/FormField';
import Alert from '../../components/common/Alert';
import { SelectField } from '../../components/common/Fields';
import { HostelField } from '../../components/common/HostelSelect';
import { PageLoader } from '../../components/common/Spinner';
import useForm from '../../hooks/useForm';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { GENDERS, PAKISTAN_PROVINCES, RELATIONSHIPS, MAJOR_CITIES, toOptions } from '../../utils/constants';

const FIELDS = {
  hostel_id: '', full_name: '', father_name: '', cnic: '', date_of_birth: '', gender: '', mobile: '', whatsapp: '', email: '',
  permanent_address: '', city: '', province: '', institution: '', department: '', class_designation: '', student_employee_id: '',
  guardian_name: '', guardian_relationship: '', guardian_cnic: '', guardian_phone: '', guardian_address: '',
};
const CNIC = /^\d{5}-?\d{7}-?\d$/;
const PHONE = /^\+?[0-9][0-9\s-]{6,18}$/;

function validate(v, isNew) {
  const e = {};
  if (isNew && !v.hostel_id) e.hostel_id = 'Select a hostel';
  if (!v.full_name.trim()) e.full_name = 'Full name is required';
  if (!v.gender) e.gender = 'Gender is required';
  if (!v.mobile.trim()) e.mobile = 'Mobile number is required';
  else if (!PHONE.test(v.mobile)) e.mobile = 'Enter a valid number e.g. 0300-1234567';
  if (v.whatsapp && !PHONE.test(v.whatsapp)) e.whatsapp = 'Enter a valid number';
  if (v.guardian_phone && !PHONE.test(v.guardian_phone)) e.guardian_phone = 'Enter a valid number';
  if (v.cnic && !CNIC.test(v.cnic)) e.cnic = 'Format: 12345-1234567-1';
  if (v.guardian_cnic && !CNIC.test(v.guardian_cnic)) e.guardian_cnic = 'Format: 12345-1234567-1';
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter a valid email';
  return e;
}

/** Auto-formats CNIC as 12345-1234567-1 while typing. */
const formatCnic = (raw) => {
  const d = raw.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
};

function Section({ title, children }) {
  return (
    <Card title={title} className="mb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </Card>
  );
}

/** Register a new resident or edit an existing one. */
export default function ResidentFormPage() {
  const { id } = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Register resident' : 'Edit resident');
  const navigate = useNavigate();
  const toast = useToast();
  const { defaultHostelId, activeHostels } = useHostel();
  const form = useForm({ ...FIELDS, hostel_id: defaultHostelId });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.get(`/residents/${id}`).then(({ data }) => {
      const r = data.data;
      form.reset(Object.fromEntries(Object.keys(FIELDS).map((k) => [k, r[k] === null || r[k] === undefined ? '' : String(r[k])])));
      setLoading(false);
    }).catch((e) => { toast.error(e.userMessage); navigate('/residents'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const hostel = activeHostels.find((h) => String(h.id) === String(form.values.hostel_id));
  const genderOptions = hostel?.hostel_type === 'boys' ? GENDERS.filter((g) => g.value === 'male') : hostel?.hostel_type === 'girls' ? GENDERS.filter((g) => g.value === 'female') : GENDERS;
  const cnicField = (name) => ({ ...form.field(name), onChange: (e) => form.setValue(name, formatCnic(e.target.value)), placeholder: '12345-1234567-1', inputMode: 'numeric' });

  const submit = async (e) => {
    e.preventDefault();
    const errors = validate(form.values, isNew);
    if (Object.keys(errors).length) {
      form.setErrors(errors);
      toast.error('Please correct the highlighted fields');
      return;
    }
    setSaving(true);
    try {
      const { hostel_id: hostelId, ...rest } = form.values;
      const { data } = isNew ? await api.post('/residents', { hostel_id: hostelId, ...rest }) : await api.put(`/residents/${id}`, rest);
      toast.success(data.message);
      navigate(`/residents/${data.data.id}`);
    } catch (error) {
      form.applyServerErrors(error);
      toast.error(error.response?.status === 409 ? 'A resident with this CNIC already exists in this hostel' : error.userMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-6xl">
      <PageHeader
        title={isNew ? 'Register resident' : `Edit ${form.values.full_name}`}
        description={isNew ? 'After registration you can admit the resident and allocate a bed.' : undefined}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Residents', to: '/residents' }, { label: isNew ? 'Register' : 'Edit' }]}
        actions={<><Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button><Button type="submit" icon={Save} loading={saving}>{isNew ? 'Register resident' : 'Save changes'}</Button></>}
      />
      {isNew && hostel && hostel.hostel_type !== 'mixed' && <Alert type="info" className="mb-6">{hostel.name} is a {hostel.hostel_type} hostel.</Alert>}

      <Section title="Personal information">
        {isNew && <HostelField {...form.field('hostel_id')} />}
        <FormField label="Full name" required {...form.field('full_name')} />
        <FormField label="Father name" {...form.field('father_name')} />
        <FormField label="CNIC / B-Form number" {...cnicField('cnic')} />
        <FormField label="Date of birth" type="date" {...form.field('date_of_birth')} />
        <SelectField label="Gender" required options={genderOptions} {...form.field('gender')} />
        <FormField label="Mobile number" required placeholder="0300-1234567" {...form.field('mobile')} />
        <FormField label="WhatsApp number" placeholder="0300-1234567" {...form.field('whatsapp')} />
        <FormField label="Email" type="email" {...form.field('email')} />
        <FormField label="Permanent address" className="lg:col-span-2" {...form.field('permanent_address')} />
        <div>
          <FormField label="City" list="res-cities" {...form.field('city')} />
          <datalist id="res-cities">{MAJOR_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <SelectField label="Province" options={toOptions(PAKISTAN_PROVINCES)} {...form.field('province')} />
      </Section>

      <Section title="Education / employment">
        <FormField label="Institution / University / Company" {...form.field('institution')} />
        <FormField label="Department" {...form.field('department')} />
        <FormField label="Class / Degree / Designation" {...form.field('class_designation')} />
        <FormField label="Student / Employee ID" {...form.field('student_employee_id')} />
      </Section>

      <Section title="Emergency contact / guardian">
        <FormField label="Guardian name" {...form.field('guardian_name')} />
        <SelectField label="Relationship" options={toOptions(RELATIONSHIPS)} {...form.field('guardian_relationship')} />
        <FormField label="Guardian CNIC" {...cnicField('guardian_cnic')} />
        <FormField label="Guardian phone" placeholder="0300-1234567" {...form.field('guardian_phone')} />
        <FormField label="Guardian address" className="lg:col-span-2" {...form.field('guardian_address')} />
      </Section>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" icon={Save} loading={saving}>{isNew ? 'Register resident' : 'Save changes'}</Button>
      </div>
    </form>
  );
}
