import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { SelectField, CheckboxField } from '../common/Fields';
import useForm from '../../hooks/useForm';
import useFetch from '../../hooks/useFetch';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useHostel } from '../../context/HostelContext';
import { ROOM_TYPES, ROOM_FACILITIES } from '../../utils/constants';

const EMPTY = { floor_id: '', room_number: '', room_type: 'double', total_beds: '2', monthly_rent: '', security_deposit: '', facilities: [], status: 'available' };

/** Create / edit room. Beds are created automatically from "Total beds". */
export default function RoomFormModal({ open, room, onClose, onSaved }) {
  const toast = useToast();
  const { hostelId } = useHostel();
  const form = useForm(EMPTY);
  const [saving, setSaving] = useState(false);
  const { data: floors } = useFetch('/floors', { hostel_id: room ? room.hostel_id : hostelId, limit: 500, status: 'active' }, { enabled: open });

  useEffect(() => {
    if (!open) return;
    form.reset(
      room
        ? { floor_id: String(room.floor_id), room_number: room.room_number, room_type: room.room_type, total_beds: String(room.total_beds), monthly_rent: String(room.monthly_rent),
            security_deposit: String(room.security_deposit), facilities: room.facilities ? room.facilities.split(',').map((f) => f.trim()).filter(Boolean) : [], status: room.status }
        : EMPTY
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, room]);

  const v = form.values;
  const onType = (e) => {
    form.onChange(e);
    const t = ROOM_TYPES.find((x) => x.value === e.target.value);
    if (t && e.target.value !== 'custom') form.setValue('total_beds', String(t.beds));
  };
  const toggleFacility = (f) => form.setValue('facilities', v.facilities.includes(f) ? v.facilities.filter((x) => x !== f) : [...v.facilities, f]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!v.floor_id) errs.floor_id = 'Select a floor';
    if (!v.room_number.trim()) errs.room_number = 'Room number is required';
    if (!(Number(v.total_beds) >= 1)) errs.total_beds = 'At least 1 bed';
    if (v.monthly_rent === '' || Number(v.monthly_rent) < 0) errs.monthly_rent = 'Monthly rent is required';
    if (Object.keys(errs).length) return form.setErrors(errs);
    setSaving(true);
    try {
      const payload = { ...v, facilities: v.facilities.join(', '), security_deposit: v.security_deposit || 0, status: room ? undefined : v.status };
      const { data } = room ? await api.put(`/rooms/${room.id}`, payload) : await api.post('/rooms', payload);
      toast.success(data.message);
      onSaved(data.data);
    } catch (error) {
      form.applyServerErrors(error);
      toast.error(error.response?.status === 409 && !error.userMessage.includes('occupied') ? 'This room number already exists in the building' : error.userMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={room ? `Edit room ${room.room_number}` : 'Add room'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="room-form" loading={saving}>Save room</Button></>}>
      <form id="room-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Building / Floor"
          required
          className="sm:col-span-2"
          options={(floors || []).map((f) => ({ value: String(f.id), label: `${f.hostel_name} › ${f.building_name} › ${f.name}` }))}
          hint={floors && !floors.length ? 'No floors found. Create a building and floor first (or select a hostel in the top bar).' : undefined}
          {...form.field('floor_id')}
        />
        <FormField label="Room number" required placeholder="e.g. 101 or A-12" {...form.field('room_number')} />
        <SelectField label="Room type" required placeholder={null} options={ROOM_TYPES} {...form.field('room_type')} onChange={onType} />
        <FormField label="Total beds (capacity)" type="number" min="1" required hint={room ? 'Cannot be less than currently occupied beds' : 'Beds B1, B2... are created automatically'} {...form.field('total_beds')} />
        {!room && <SelectField label="Initial status" placeholder={null} options={[{ value: 'available', label: 'Available' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'inactive', label: 'Inactive' }]} {...form.field('status')} />}
        <FormField label="Monthly rent per bed (PKR)" type="number" min="0" required {...form.field('monthly_rent')} />
        <FormField label="Security deposit (PKR)" type="number" min="0" {...form.field('security_deposit')} />
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-slate-700">Facilities</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROOM_FACILITIES.map((f) => <CheckboxField key={f} label={f} checked={v.facilities.includes(f)} onChange={() => toggleFacility(f)} />)}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
