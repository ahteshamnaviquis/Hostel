import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { SelectField, TextAreaField } from '../common/Fields';
import useForm from '../../hooks/useForm';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { HOSTEL_TYPES, PAKISTAN_PROVINCES, MAJOR_CITIES, toOptions } from '../../utils/constants';

const EMPTY = {
  name: '', code: '', hostel_type: 'boys', description: '', address: '', city: '', province: 'Punjab', contact_number: '', email: '',
  warden_name: '', warden_contact: '', status: 'active',
};

function validate(v) {
  const e = {};
  if (!v.name.trim()) e.name = 'Hostel name is required';
  if (!v.code.trim()) e.code = 'Hostel code is required';
  else if (!/^[A-Za-z0-9-]+$/.test(v.code)) e.code = 'Letters, numbers and dashes only';
  if (!v.address.trim()) e.address = 'Address is required';
  if (!v.city.trim()) e.city = 'City is required';
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter a valid email';
  return e;
}

/** Create / edit hostel (Super Admin). */
export default function HostelFormModal({ open, hostel, onClose, onSaved }) {
  const toast = useToast();
  const { refresh } = useAuth();
  const form = useForm(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) form.reset(hostel ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, hostel[k] ?? ''])) : EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hostel]);

  const submit = async (e) => {
    e.preventDefault();
    const errors = validate(form.values);
    if (Object.keys(errors).length) return form.setErrors(errors);
    setSaving(true);
    try {
      const { data } = hostel ? await api.put(`/hostels/${hostel.id}`, form.values) : await api.post('/hostels', form.values);
      toast.success(data.message);
      await refresh(); // hostel list in the top bar
      onSaved(data.data);
    } catch (error) {
      form.applyServerErrors(error);
      toast.error(error.userMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hostel ? `Edit ${hostel.name}` : 'Add hostel'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="hostel-form" loading={saving}>{hostel ? 'Save changes' : 'Create hostel'}</Button>
        </>
      }
    >
      <form id="hostel-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Hostel name" required className="sm:col-span-2" placeholder="e.g. Gulberg Boys Hostel" {...form.field('name')} />
        <FormField label="Hostel code" required placeholder="e.g. GBH-01" {...form.field('code')} />
        <SelectField label="Hostel type" required options={HOSTEL_TYPES} placeholder={null} {...form.field('hostel_type')} />
        <FormField label="Address" required className="sm:col-span-2" {...form.field('address')} />
        <div>
          <FormField label="City" required list="pk-cities" {...form.field('city')} />
          <datalist id="pk-cities">{MAJOR_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <SelectField label="Province / Territory" required options={toOptions(PAKISTAN_PROVINCES)} placeholder={null} {...form.field('province')} />
        <FormField label="Contact number" placeholder="042-35761234" {...form.field('contact_number')} />
        <FormField label="Email" type="email" {...form.field('email')} />
        <FormField label="Warden name" {...form.field('warden_name')} />
        <FormField label="Warden contact" placeholder="0300-1234567" {...form.field('warden_contact')} />
        <SelectField label="Status" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} placeholder={null} {...form.field('status')} />
        <TextAreaField label="Description" className="sm:col-span-2" {...form.field('description')} />
      </form>
    </Modal>
  );
}
